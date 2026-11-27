// CSP grants only this project's Supabase HTTP and WebSocket origins.
export function realtimeOrigins(value: string | undefined) {
  if (!value) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    return ` ${u.origin} wss://${u.host}`;
  } catch {
    return '';
  }
}
