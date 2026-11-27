import { timingSafeEqual } from 'node:crypto';
import { runScheduledJob, type JobKind } from '@/lib/server/jobs';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET,
    header = request.headers.get('authorization') || '';
  if (
    !secret ||
    secret.length < 32 ||
    header.length !== ('Bearer ' + secret).length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from('Bearer ' + secret))
  )
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { job } = await params;
  if (!['monitor', 'news', 'daily', 'weekly', 'integrations'].includes(job))
    return Response.json({ error: 'Not found' }, { status: 404 });
  try {
    return Response.json({
      ok: true,
      result: await runScheduledJob(job as JobKind),
    });
  } catch {
    return Response.json({ error: 'Job failed. Check job history.' }, { status: 500 });
  }
}
