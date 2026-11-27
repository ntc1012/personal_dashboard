import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.JARVIS_OWNER_ID,
  );
}
export async function supabaseServer() {
  if (!isConfigured()) throw new Error('Chưa kết nối Supabase.');
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (entries) => {
          try {
            entries.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            /* Proxy refreshes cookies in server components. */
          }
        },
      },
    },
  );
}
export async function ownerSession() {
  const db = await supabaseServer();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub || data.claims.sub !== process.env.JARVIS_OWNER_ID)
    throw new Error('Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');
  const { data: factors, error: factorError } = await db.auth.mfa.listFactors();
  if (factorError || !factors)
    throw new Error('Không kiểm tra được mức xác thực. Hãy đăng nhập lại.');
  return {
    db,
    userId: data.claims.sub as string,
    needsMfa: factors.all.some((f) => f.status === 'verified') && data.claims.aal !== 'aal2',
  };
}
export async function requireOwner() {
  const session = await ownerSession();
  if (session.needsMfa)
    throw new Error('Cần xác thực hai lớp. Hãy đăng nhập lại để nhập mã xác thực.');
  return session;
}
