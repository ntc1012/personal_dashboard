import { z } from 'zod';

export const providers = ['github', 'vercel', 'google_calendar', 'todoist'] as const;
export type IntegrationProvider = (typeof providers)[number];
export type IntegrationConnection = {
  id: string;
  provider: IntegrationProvider;
  project_id: string | null;
  source_key: string;
  enabled: boolean;
  status: 'pending' | 'syncing' | 'ready' | 'error';
  last_success_at: string | null;
  last_event_at: string | null;
  next_sync_at: string;
  error: string | null;
};
export const connectedItemSchema = z
  .object({
    external_id: z.string().min(1).max(300),
    kind: z.enum(['issue', 'pull_request', 'workflow', 'deployment', 'event', 'task']),
    title: z.string().min(1).max(500),
    status: z.string().max(60),
    url: z
      .string()
      .max(2000)
      .refine((s) => !s || /^https:\/\//.test(s)),
    due_date: z.iso.date().nullable(),
    starts_at: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(),
    ends_at: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(),
    all_day: z.boolean(),
    source_updated_at: z.iso.datetime(),
  })
  .strict();
export type ConnectedItemInput = z.infer<typeof connectedItemSchema>;
export type ConnectedItem = ConnectedItemInput & {
  id: string;
  connection_id: string;
  checked_at: string;
};
export type IntegrationActivity = {
  id: string;
  connection_id: string;
  title: string;
  url: string;
  happened_at: string;
  created_at: string;
};
export const providerLabels: Record<IntegrationProvider, string> = {
  github: 'GitHub',
  vercel: 'Vercel',
  google_calendar: 'Google Calendar',
  todoist: 'Todoist',
};
export function connectionStale(c: IntegrationConnection, now = Date.now()) {
  return !c.enabled || !c.last_success_at || now - Date.parse(c.last_success_at) > 30 * 60000;
}
export function githubSource(value: string) {
  try {
    const u = new URL(value);
    const p = u.pathname
      .replace(/\.git\/?$/, '')
      .replace(/^\/|\/$/g, '')
      .split('/');
    return u.protocol === 'https:' &&
      u.hostname === 'github.com' &&
      !u.username &&
      !u.password &&
      p.length === 2 &&
      p.every((x) => /^[\w.-]+$/.test(x))
      ? p.join('/').toLowerCase()
      : null;
  } catch {
    return null;
  }
}
export function connectedOverview(
  connections: IntegrationConnection[],
  items: ConnectedItem[],
  now = Date.now(),
) {
  const enabled = new Set(connections.filter((c) => c.enabled).map((c) => c.id));
  const active = items.filter((i) => enabled.has(i.connection_id));
  const latest = new Map<string, ConnectedItem>();
  for (const i of active.filter((i) => i.kind === 'deployment' || i.kind === 'workflow')) {
    const key = i.connection_id + ':' + i.kind + (i.kind === 'workflow' ? ':' + i.title : '');
    const previous = latest.get(key);
    if (!previous || i.source_updated_at > previous.source_updated_at) latest.set(key, i);
  }
  const failed = [...latest.values()].filter((i) =>
    ['error', 'failure', 'timed_out', 'action_required', 'startup_failure'].includes(
      i.status.toLowerCase(),
    ),
  );
  return {
    active,
    failed,
    connections: connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      project_id: c.project_id,
      enabled: c.enabled,
      status: c.status,
      last_success_at: c.last_success_at,
      last_event_at: c.last_event_at,
      error: c.error,
      stale: connectionStale(c, now),
    })),
  };
}
