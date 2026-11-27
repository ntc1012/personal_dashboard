'use server';
import { z } from 'zod';
import { requireOwner } from '@/lib/supabase/server';
import { runAgent } from '@/lib/agent/server';
import type { AgentReply } from '@/lib/agent/tools';
import type { Result, Change } from '@/lib/types';
import { adminDatabase } from '@/lib/server/admin';
import { sendNotification } from '@/lib/server/notifications';
export async function chatWithAgent(text: string, requestId: string): Promise<Result<AgentReply>> {
  try {
    const { db } = await requireOwner();
    return { ok: true, value: await runAgent(db, text, requestId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không xử lý được yêu cầu.' };
  }
}
export async function confirmAgentAction(
  id: string,
): Promise<Result<{ text: string; changes: Change[] }>> {
  try {
    const { db, userId } = await requireOwner();
    z.uuid().parse(id);
    const { data, error } = await db.rpc('confirm_action', { p_id: id });
    if (error)
      throw new Error('Đề xuất hết hạn, đã dùng hoặc dữ liệu đã thay đổi. Hãy tạo lại đề xuất.');
    if (data.tool === 'send_notification') {
      const payload = z
        .object({ message: z.string().min(1).max(4000) })
        .strict()
        .parse(data.payload);
      await sendNotification(adminDatabase(), userId, 'agent:' + id, payload.message);
      return { ok: true, value: { text: 'Kênh nhận đã xác nhận gửi thông báo.', changes: [] } };
    }
    return {
      ok: true,
      value: { text: 'Đã áp dụng các thay đổi bạn xác nhận.', changes: data.changes },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không xác nhận được.' };
  }
}
export async function cancelAgentAction(id: string): Promise<Result<boolean>> {
  try {
    const { db } = await requireOwner();
    z.uuid().parse(id);
    const { error } = await db.rpc('cancel_action', { p_id: id });
    if (error) throw error;
    return { ok: true, value: true };
  } catch {
    return { ok: false, error: 'Không hủy được đề xuất.' };
  }
}
