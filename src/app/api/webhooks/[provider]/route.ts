import { after } from 'next/server';
import { adminDatabase } from '@/lib/server/admin';
import { reconcileConnections, drainIntegrations } from '@/lib/server/connected-sync';
import { parseWebhook, readWebhookBody, verifyWebhook } from '@/lib/server/integration-webhooks';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (provider !== 'github' && provider !== 'vercel')
    return Response.json({ error: 'Not found' }, { status: 404 });
  const secret =
    provider === 'github' ? process.env.GITHUB_WEBHOOK_SECRET : process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Webhook not configured' }, { status: 503 });
  let body: Buffer;
  try {
    body = await readWebhookBody(request);
  } catch {
    return Response.json({ error: 'Payload too large or unreadable' }, { status: 413 });
  }
  if (
    !verifyWebhook(
      provider,
      body,
      request.headers.get(provider === 'github' ? 'x-hub-signature-256' : 'x-vercel-signature'),
      secret,
    )
  )
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  let event: ReturnType<typeof parseWebhook>;
  try {
    event = parseWebhook(provider, body, request.headers);
  } catch {
    return Response.json({ error: 'Invalid event' }, { status: 400 });
  }
  if (!event) return Response.json({ ok: true, ignored: true });
  try {
    const db = adminDatabase(),
      user = process.env.JARVIS_OWNER_ID!;
    const connections = await reconcileConnections(db, user);
    const matches = connections.filter(
      (c) => c.enabled && c.provider === provider && c.source_key === event.source,
    );
    let accepted = false;
    for (const c of matches) {
      const { data, error } = await db.rpc('enqueue_integration', {
        p_user: user,
        p_connection: c.id,
        p_digest: event.digest,
        p_event: event.event,
      });
      if (error) throw error;
      accepted ||= Boolean(data);
    }
    // Persist before acknowledging; retries are recoverable by the scheduled worker.
    if (accepted)
      after(async () => {
        try {
          await drainIntegrations(db, user, 25000);
        } catch {
          /* Durable queue is retried by /api/cron/integrations. */
        }
      });
    return Response.json({ ok: true, accepted }, { status: accepted ? 202 : 200 });
  } catch {
    return Response.json({ error: 'Unable to persist delivery; retry later' }, { status: 503 });
  }
}
