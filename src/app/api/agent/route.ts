import { chatWithAgent } from '@/app/agent-actions';
import { requireOwner } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  let sameHost = false;
  try {
    const source = new URL(origin || '');
    sameHost =
      ['http:', 'https:'].includes(source.protocol) &&
      source.host === (request.headers.get('host') || new URL(request.url).host);
  } catch {}
  if (!sameHost) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await requireOwner();
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (Number(request.headers.get('content-length') || 0) > 12000)
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Empty body');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 12000) {
        await reader.cancel();
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }
      chunks.push(value);
    }
    const { text, requestId } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = await chatWithAgent(text, requestId);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
