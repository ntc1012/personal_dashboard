import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { githubSource } from '../integration-model';

export function verifyWebhook(
  provider: 'github' | 'vercel',
  body: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature) return false;
  const algorithm = provider === 'github' ? 'sha256' : 'sha1';
  const raw = provider === 'github' ? signature.replace(/^sha256=/, '') : signature;
  if (!new RegExp(`^[a-f0-9]{${algorithm === 'sha256' ? 64 : 40}}$`, 'i').test(raw)) return false;
  if (provider === 'github' && !signature.startsWith('sha256=')) return false;
  return timingSafeEqual(
    Buffer.from(raw, 'hex'),
    createHmac(algorithm, secret).update(body).digest(),
  );
}
export async function readWebhookBody(request: Request, limit = 512 * 1024) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('body_limit');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error('body_limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
const text = (s: unknown, fallback: string) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').slice(0, 350) : fallback;
function safeLink(s: unknown, hosts: string[]) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'https:' && hosts.includes(u.hostname) && !u.username && !u.password
      ? u.href.slice(0, 2000)
      : '';
  } catch {
    return '';
  }
}
function happened(value: unknown) {
  const d =
    typeof value === 'number' ? new Date(value) : new Date(typeof value === 'string' ? value : '');
  // Future timestamps never move the activity clock ahead indefinitely.
  return Number.isFinite(d.valueOf()) && d.valueOf() <= Date.now() + 300000
    ? d.toISOString()
    : new Date().toISOString();
}
export function parseWebhook(provider: 'github' | 'vercel', body: Buffer, headers: Headers) {
  const p = z.record(z.string(), z.any()).parse(JSON.parse(body.toString('utf8')));
  const digest = createHash('sha256').update(body).digest('hex');
  if (provider === 'github') {
    const event = headers.get('x-github-event');
    if (event === 'ping') return null;
    const repo = githubSource(p.repository?.html_url || '');
    if (
      !repo ||
      !['issues', 'pull_request', 'workflow_run', 'push', 'release', 'check_run'].includes(
        event || '',
      )
    )
      return null;
    const x = p.issue || p.pull_request || p.workflow_run || p.release || p.check_run || {};
    const title =
      event === 'push'
        ? `GitHub · ${repo}: ${Array.isArray(p.commits) ? p.commits.length : 0} commit mới`
        : `GitHub · ${text(x.title || x.name, event || 'Sự kiện')} · ${text(x.conclusion || p.action, 'cập nhật')}`;
    return {
      source: repo,
      digest,
      event: {
        title: title.slice(0, 500),
        url: safeLink(x.html_url || p.compare, ['github.com']),
        happened_at: happened(
          x.updated_at || x.completed_at || x.published_at || p.head_commit?.timestamp,
        ),
      },
    };
  }
  const type = String(p.type || '');
  if (
    ![
      'deployment.created',
      'deployment.ready',
      'deployment.succeeded',
      'deployment.error',
      'deployment.canceled',
      'deployment.promoted',
    ].includes(type)
  )
    return null;
  const source = z.string().min(1).max(150).parse(p.payload?.project?.id);
  return {
    source,
    digest,
    event: {
      title: `Vercel · ${text(p.payload?.deployment?.name, 'Deployment')} · ${type.split('.').pop()}`,
      url: safeLink(p.payload?.links?.deployment, ['vercel.com']),
      happened_at: happened(p.createdAt),
    },
  };
}
