import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminDatabase } from './admin';
import { fetchConnected } from './connected-providers';
import {
  githubSource,
  type IntegrationConnection,
  type IntegrationProvider,
} from '../integration-model';

async function checked<T>(query: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw new Error('Không cập nhật được dữ liệu tích hợp. Kiểm tra migration 009.');
  return data;
}
export async function reconcileConnections(db: SupabaseClient, user: string) {
  const projects = await checked(
    db
      .from('projects')
      .select('id,repo_url,vercel_project_id')
      .eq('user_id', user)
      .is('archived_at', null)
      .limit(101),
  );
  if (projects && projects.length > 100)
    throw new Error('Nguồn vượt 100 dự án; cần phân trang connector trước khi đồng bộ.');
  const desired: {
    provider: IntegrationProvider;
    project_id: string | null;
    source_key: string;
  }[] = [];
  for (const p of projects || []) {
    const repo = githubSource(p.repo_url);
    if (repo) desired.push({ provider: 'github', project_id: p.id, source_key: repo });
    if (p.vercel_project_id)
      desired.push({ provider: 'vercel', project_id: p.id, source_key: p.vercel_project_id });
  }
  if (process.env.TODOIST_TOKEN)
    desired.push({ provider: 'todoist', project_id: null, source_key: 'personal' });
  if (
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  )
    desired.push({
      provider: 'google_calendar',
      project_id: null,
      source_key: process.env.GOOGLE_CALENDAR_ID || 'primary',
    });
  const current = (await checked(
    db.from('integration_connections').select('*').eq('user_id', user),
  )) as IntegrationConnection[];
  for (const d of desired) {
    const c = current.find((x) => x.provider === d.provider && x.project_id === d.project_id);
    if (!c)
      await checked(
        db
          .from('integration_connections')
          .upsert(
            { user_id: user, ...d },
            { onConflict: 'user_id,provider,project_id', ignoreDuplicates: true },
          ),
      );
    else if (c.source_key !== d.source_key) {
      // Invalidate old leases and data when a project is pointed at a different source.
      await checked(
        db
          .from('integration_connections')
          .update({
            source_key: d.source_key,
            status: 'pending',
            last_success_at: null,
            last_event_at: null,
            next_sync_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', c.id),
      );
    }
  }
  // Archived/unlinked projects must stop being polled; keep explicit user pauses intact.
  for (const c of current)
    if (!desired.some((d) => d.provider === c.provider && d.project_id === c.project_id))
      await checked(db.from('integration_connections').update({ enabled: false }).eq('id', c.id));
  return (await checked(
    db.from('integration_connections').select('*').eq('user_id', user),
  )) as IntegrationConnection[];
}
export async function queueConnections(
  db: SupabaseClient,
  user: string,
  force = false,
  project?: string,
) {
  const connections = await reconcileConnections(db, user);
  for (const c of connections)
    if (
      c.enabled &&
      (!project || c.project_id === project) &&
      (force || Date.parse(c.next_sync_at) <= Date.now())
    ) {
      // An existing retry keeps its backoff. Reconciliation only requests work when due.
      await checked(db.rpc('enqueue_integration', { p_user: user, p_connection: c.id }));
    }
}
export async function drainIntegrations(
  db = adminDatabase(),
  user = process.env.JARVIS_OWNER_ID!,
  budget = 35000,
) {
  const until = Date.now() + budget;
  let done = 0,
    failed = 0;
  while (Date.now() < until - 1000) {
    const claim = await checked(db.rpc('claim_integration', { p_user: user }));
    if (!claim) break;
    const { connection_id, lease_token } = claim;
    const c = (await checked(
      db
        .from('integration_connections')
        .select('*')
        .eq('id', connection_id)
        .eq('user_id', user)
        .single(),
    )) as IntegrationConnection;
    try {
      const result = await fetchConnected(c, Math.min(until - 500, Date.now() + 25000));
      const saved = await checked(
        db.rpc('finish_integration', {
          p_user: user,
          p_connection: c.id,
          p_lease: lease_token,
          p_items: result.items,
          p_snapshot: result.snapshot,
        }),
      );
      if (saved) done++;
    } catch (e) {
      // Only known, credential-free adapter errors reach public status rows.
      const message =
        e instanceof Error &&
        /^(Chưa cấu hình|Quyền truy cập|Nguồn |Repository |Dữ liệu |Todoist |Lịch |Không làm mới|Kết quả API)/.test(
          e.message,
        )
          ? e.message
          : 'Đồng bộ chưa thành công; dữ liệu lần cuối vẫn được giữ.';
      await checked(
        db.rpc('finish_integration', {
          p_user: user,
          p_connection: c.id,
          p_lease: lease_token,
          p_error: message,
        }),
      );
      failed++;
    }
  }
  return `Đồng bộ ${done} nguồn; ${failed} nguồn cần thử lại. Mục còn lại được giữ trong hàng đợi.`;
}
export async function runIntegrations(force = false, project?: string) {
  const db = adminDatabase(),
    user = process.env.JARVIS_OWNER_ID!;
  await queueConnections(db, user, force, project);
  // Retain replay protection for as long as a delivery could plausibly be retried.
  await checked(
    db
      .from('integration_activity')
      .delete()
      .eq('user_id', user)
      .lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  );
  return drainIntegrations(db, user);
}
