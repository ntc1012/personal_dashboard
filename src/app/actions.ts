'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ownerSession, requireOwner, supabaseServer } from '@/lib/supabase/server';
import { validateMutation } from '@/lib/domain';
import type { Change, Mutation, Result, Snapshot } from '@/lib/types';
import { readSnapshot } from '@/lib/data';
import { runAgent } from '@/lib/agent/server';
import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { adminDatabase, adminKey } from '@/lib/server/admin';

function message(e: unknown) {
  if (e instanceof z.ZodError) return e.issues[0]?.message || 'Dữ liệu không hợp lệ.';
  return e instanceof Error ? e.message : 'Không thể xử lý. Hãy thử lại.';
}
export async function login(_: { error: string }, form: FormData) {
  let needsMfa = false;
  try {
    const email = z.email().parse(form.get('email'));
    const password = z.string().min(1).max(1024).parse(form.get('password'));
    const secret = adminKey();
    if (secret) {
      const requestHeaders = await headers(),
        ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const admin = adminDatabase();
      for (const value of ['ip:' + ip, 'email:' + email.toLowerCase()]) {
        const key = createHmac('sha256', secret).update(value).digest('hex');
        const { data, error } = await admin.rpc('take_login_rate', { p_key: key });
        if (error || !data) return { error: 'Chưa thể đăng nhập. Hãy chờ một phút rồi thử lại.' };
      }
    }
    const db = await supabaseServer();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || data.user?.id !== process.env.JARVIS_OWNER_ID) {
      if (data.session) await db.auth.signOut();
      return { error: 'Không thể đăng nhập. Kiểm tra tài khoản và mật khẩu.' };
    }
    needsMfa = (await ownerSession()).needsMfa;
  } catch {
    return { error: 'Không thể đăng nhập. Kiểm tra kết nối và thử lại.' };
  }
  redirect(needsMfa ? '/verify' : '/');
}
export async function logout() {
  const { db } = await ownerSession();
  await db.auth.signOut();
  redirect('/login');
}
export async function loadSnapshot(): Promise<Result<Snapshot>> {
  try {
    const { db } = await requireOwner();
    return { ok: true, value: await readSnapshot(db) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function mutate(input: Mutation): Promise<Result<Change>> {
  try {
    const { db } = await requireOwner();
    const m = validateMutation(input);
    const { data, error } = await db.rpc('apply_change', {
      p_entity: m.entity,
      p_action: m.action,
      p_id: m.id,
      p_data: m.data,
      p_expected_version: m.expectedVersion ?? null,
    });
    if (error)
      throw new Error(
        error.message.includes('version_conflict')
          ? 'Dữ liệu đã thay đổi. Hãy tải lại trước khi sửa.'
          : 'Không lưu được. Kiểm tra dữ liệu, kết nối hoặc quyền truy cập.',
      );
    return { ok: true, value: data as Change };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function undoChange(id: string): Promise<Result<Change>> {
  try {
    const { db } = await requireOwner();
    z.uuid().parse(id);
    const { data, error } = await db.rpc('undo_change', { p_change_id: id });
    if (error)
      throw new Error(
        error.message.includes('version_conflict')
          ? 'Mục này đã được sửa tiếp. Không thể hoàn tác đè lên thay đổi mới.'
          : 'Không thể hoàn tác. Mục có thể đã được khôi phục hoặc có dữ liệu liên quan mới.',
      );
    return { ok: true, value: data as Change };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function askAssistant(
  text: string,
  requestId: string,
): Promise<Result<{ text: string; change?: Change }>> {
  try {
    const { db } = await requireOwner();
    return { ok: true, value: await runAgent(db, text, requestId) };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
export async function verifyMfa(_: { error: string }, form: FormData) {
  try {
    const { db } = await ownerSession();
    const code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(form.get('code'));
    const { data: factorData, error: factorError } = await db.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const factor = factorData.totp.find((f) => f.status === 'verified');
    if (!factor) return { error: 'Không tìm thấy ứng dụng xác thực đã thiết lập.' };
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return { error: 'Mã không đúng hoặc đã hết hạn. Hãy thử mã mới.' };
  } catch {
    return { error: 'Chưa xác thực được. Kiểm tra mã hoặc đăng nhập lại.' };
  }
  redirect('/');
}
export async function getMfaStatus(): Promise<Result<boolean>> {
  try {
    const { db } = await requireOwner();
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw error;
    return { ok: true, value: data.totp.some((f) => f.status === 'verified') };
  } catch {
    return { ok: false, error: 'Không kiểm tra được trạng thái xác thực.' };
  }
}
export async function beginMfaEnrollment(): Promise<Result<{ factorId: string; qr: string }>> {
  try {
    const { db } = await requireOwner();
    const { data: factors, error: factorError } = await db.auth.mfa.listFactors();
    if (factorError) throw factorError;
    if (factors.totp.some((f) => f.status === 'verified'))
      return { ok: false, error: 'Tài khoản đã bật xác thực hai lớp.' };
    // Only replace unfinished enrollments, never remove a verified factor.
    for (const factor of factors.all.filter(
      (f) => f.factor_type === 'totp' && f.status === 'unverified',
    )) {
      const { error } = await db.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'J.A.R.V.I.S.',
    });
    if (error) throw error;
    const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '');
    return {
      ok: true,
      value: {
        factorId: data.id,
        qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      },
    };
  } catch {
    return {
      ok: false,
      error: 'Không bắt đầu được. Kiểm tra kết nối và cấu hình TOTP trong Supabase.',
    };
  }
}
export async function finishMfaEnrollment(
  factorId: string,
  code: string,
): Promise<Result<boolean>> {
  try {
    const { db } = await requireOwner();
    z.uuid().parse(factorId);
    z.string()
      .regex(/^\d{6}$/)
      .parse(code);
    const { data: factors, error: factorError } = await db.auth.mfa.listFactors();
    if (factorError) throw factorError;
    if (
      !factors.all.some(
        (f) => f.id === factorId && f.factor_type === 'totp' && f.status === 'unverified',
      )
    )
      throw new Error('invalid_factor');
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    return { ok: true, value: true };
  } catch {
    return { ok: false, error: 'Mã không đúng hoặc đã hết hạn. Thử lại bằng mã mới.' };
  }
}
