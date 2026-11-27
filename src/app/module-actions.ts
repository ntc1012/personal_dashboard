'use server';
import { z } from 'zod';
import { requireOwner } from '@/lib/supabase/server';
import { validateMutation } from '@/lib/domain';
import { runScheduledJob, type JobKind } from '@/lib/server/jobs';
import { adminKey } from '@/lib/server/admin';
import { runIntegrations } from '@/lib/server/connected-sync';
import { readSnapshot } from '@/lib/data';
import type { Change, Mutation, Result } from '@/lib/types';
import { planBackupRestore } from '@/lib/backup';
export async function restoreBackup(input: unknown): Promise<Result<number>> {
  try {
    const { db } = await requireOwner();
    if (JSON.stringify(input).length > 5_000_000) throw new Error('Bản sao lưu quá lớn.');
    const snapshot = await readSnapshot(db),
      plan = planBackupRestore(input, snapshot);
    if (!plan.operations.length) return { ok: true, value: 0 };
    const { error } = await db.rpc('restore_backup', { p_operations: plan.operations });
    if (error)
      throw new Error(
        'Không khôi phục được. Toàn bộ thay đổi đã được hủy; kiểm tra quan hệ hoặc khóa vault.',
      );
    return { ok: true, value: plan.operations.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không nhập được bản sao lưu.' };
  }
}
export async function batchMutate(operations: Mutation[]): Promise<Result<Change[]>> {
  try {
    const { db } = await requireOwner();
    const ops = z.array(z.unknown()).min(1).max(5000).parse(operations).map(validateMutation);
    const { data, error } = await db.rpc('apply_batch', { p_operations: ops });
    if (error) throw error;
    return { ok: true, value: data };
  } catch {
    return {
      ok: false,
      error:
        'Không lưu được lô dữ liệu. Không có thay đổi nào được áp dụng; kiểm tra dữ liệu, phiên bản và quan hệ.',
    };
  }
}
export async function triggerJob(kind: JobKind): Promise<Result<string>> {
  try {
    const { db } = await requireOwner();
    z.enum(['monitor', 'news', 'daily', 'weekly', 'integrations']).parse(kind);
    const { data, error } = await db.rpc('take_rate', {
      p_bucket: 'manual-jobs',
      p_limit: 6,
      p_seconds: 60,
    });
    if (error || !data) throw new Error('Chờ một phút trước khi chạy lại.');
    return { ok: true, value: await runScheduledJob(kind, true) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không chạy được job.' };
  }
}
export async function syncProjectIntegrations(id: string): Promise<Result<string>> {
  try {
    const { db } = await requireOwner();
    z.uuid().parse(id);
    const s = await readSnapshot(db);
    const project = s.projects.find((p) => p.id === id && !p.archived_at);
    if (!project) throw new Error('Không tìm thấy dự án.');
    const { data: allowed, error: rateError } = await db.rpc('take_rate', {
      p_bucket: 'integrations',
      p_limit: 10,
      p_seconds: 60,
    });
    if (rateError || !allowed) throw new Error('Chờ trước khi đồng bộ lại.');
    return { ok: true, value: await runIntegrations(true, id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không đồng bộ được.' };
  }
}
export async function setIntegrationEnabled(id: string, enabled: boolean): Promise<Result<string>> {
  try {
    const { db } = await requireOwner();
    z.uuid().parse(id);
    z.boolean().parse(enabled);
    const { error } = await db.rpc('set_integration_enabled', { p_id: id, p_enabled: enabled });
    if (error) throw error;
    return {
      ok: true,
      value: enabled ? 'Đã bật đồng bộ.' : 'Đã tạm dừng đồng bộ; dữ liệu cũ được giữ.',
    };
  } catch {
    return { ok: false, error: 'Không thay đổi được kết nối.' };
  }
}
export async function connectionStatus(): Promise<Result<Record<string, boolean>>> {
  try {
    await requireOwner();
    return {
      ok: true,
      value: {
        llm: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL),
        jobs: Boolean(adminKey() && process.env.CRON_SECRET),
        github: Boolean(process.env.GITHUB_TOKEN),
        vercel: Boolean(process.env.VERCEL_TOKEN),
        github_webhook: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
        vercel_webhook: Boolean(process.env.VERCEL_WEBHOOK_SECRET),
        google_calendar: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN,
        ),
        todoist: Boolean(process.env.TODOIST_TOKEN),
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        email: Boolean(
          process.env.RESEND_API_KEY &&
          process.env.NOTIFICATION_EMAIL &&
          process.env.NOTIFICATION_FROM,
        ),
      },
    };
  } catch {
    return { ok: false, error: 'Không đọc được trạng thái kết nối.' };
  }
}
