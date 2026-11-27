import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { realtimeOrigins } from './lib/realtime-policy';

export async function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${realtimeOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL)}${process.env.NODE_ENV === 'development' ? ' ws://127.0.0.1:*' : ''}; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`;
  function nextResponse() {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  let response = nextResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || request.nextUrl.pathname.startsWith('/api/webhooks/')) return response;
  const db = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(entries) {
        entries.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await db.auth.getClaims();
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|media/|favicon.ico|icon|sw.js|offline.html|manifest.webmanifest).*)',
  ],
};
