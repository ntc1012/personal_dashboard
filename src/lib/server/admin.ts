import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function adminKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}
export function adminDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = adminKey();
  if (!url || !key || !process.env.JARVIS_OWNER_ID)
    throw new Error('Chưa cấu hình khóa server cho các job tự động.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
