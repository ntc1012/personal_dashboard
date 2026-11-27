import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
export function notificationDestination() {
  const channels: string[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    channels.push(`Telegram chat ${process.env.TELEGRAM_CHAT_ID}`);
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL && process.env.NOTIFICATION_FROM)
    channels.push(`Email: ${process.env.NOTIFICATION_EMAIL}`);
  return channels.join(' + ') || 'Chưa cấu hình kênh nhận';
}
export async function sendNotification(
  db: SupabaseClient,
  userId: string,
  key: string,
  message: string,
) {
  if (!message.trim() || message.length > 4000)
    throw new Error('Thông báo cần từ 1 đến 4000 ký tự.');
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email = Boolean(
      process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL && process.env.NOTIFICATION_FROM,
    );
  if (!telegram && !email) throw new Error('Chưa cấu hình Telegram hoặc email.');
  const { data, error } = await db
    .from('notification_outbox')
    .insert({ user_id: userId, dedupe_key: key, status: 'reserved' })
    .select('id')
    .single();
  if (error?.code === '23505') return { duplicate: true };
  if (error || !data) throw new Error('Không tạo được bản ghi thông báo.');
  try {
    if (telegram) {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        },
      );
      if (!res.ok || !(await res.json()).ok)
        throw new Error('Telegram không xác nhận gửi thành công.');
    }
    if (email) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          from: process.env.NOTIFICATION_FROM,
          to: [process.env.NOTIFICATION_EMAIL],
          subject: 'J.A.R.V.I.S. · Thông báo',
          text: message,
        }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Email không xác nhận gửi thành công.');
    }
    const { error: writeError } = await db
      .from('notification_outbox')
      .update({ status: 'sent' })
      .eq('id', data.id);
    if (writeError) throw new Error('Đã gửi nhưng chưa cập nhật được trạng thái.');
    return { duplicate: false };
  } catch {
    await db.from('notification_outbox').update({ status: 'unknown' }).eq('id', data.id);
    throw new Error(
      'Chưa xác định kết quả gửi. Không tự gửi lại để tránh trùng; kiểm tra kênh nhận.',
    );
  }
}
