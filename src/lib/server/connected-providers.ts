import 'server-only';
import {
  connectedItemSchema,
  type ConnectedItemInput,
  type IntegrationConnection,
} from '../integration-model';
import { dateKey } from '../domain';

type Json = Record<string, any>;
// All destinations are fixed provider APIs; redirects never forward credentials.
async function providerApi(url: string, token: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: init?.signal || AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Quyền truy cập đã hết hạn hoặc không đủ. Kiểm tra cấu hình kết nối.'
        : response.status === 429
          ? 'Nguồn đang giới hạn API; hệ thống sẽ thử lại.'
          : 'Nguồn dữ liệu chưa phản hồi thành công.',
    );
  const body = await response.text();
  if (body.length > 4_000_000) throw new Error('Kết quả API quá lớn; chưa thay thế dữ liệu cũ.');
  return JSON.parse(body);
}
const clean = (s: unknown, fallback: string, max = 500) =>
  (typeof s === 'string' && s.trim() ? s.replace(/[\u0000-\u001f]/g, ' ').trim() : fallback).slice(
    0,
    max,
  );
function url(s: unknown, host: string) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password
      ? u.href.slice(0, 2000)
      : '';
  } catch {
    return '';
  }
}
function iso(s: unknown) {
  return typeof s === 'string' && Number.isFinite(Date.parse(s))
    ? new Date(s).toISOString()
    : new Date().toISOString();
}
const base = (x: Json, kind: ConnectedItemInput['kind'], title: string): ConnectedItemInput => {
  if (!['string', 'number'].includes(typeof x.id) || !String(x.id))
    throw new Error('Dữ liệu nguồn thiếu định danh.');
  return {
    external_id: `${kind}:${x.id}`,
    kind,
    title: clean(title, 'Không có tiêu đề'),
    status: '',
    url: '',
    due_date: null,
    starts_at: null,
    ends_at: null,
    all_day: false,
    source_updated_at: iso(x.updated_at || x.created_at),
  };
};

export async function fetchConnected(
  c: IntegrationConnection,
  deadline = Date.now() + 25000,
): Promise<{ items: ConnectedItemInput[]; snapshot: Json | null }> {
  const api = (url: string, token: string, init?: RequestInit) => {
    const left = deadline - Date.now();
    if (left < 100) throw new Error('Nguồn cần thêm thời gian; hệ thống sẽ thử lại.');
    return providerApi(url, token, { ...init, signal: AbortSignal.timeout(Math.min(8000, left)) });
  };
  const items: ConnectedItemInput[] = [];
  let snapshot: Json | null = null;
  if (c.provider === 'github') {
    if (!process.env.GITHUB_TOKEN) throw new Error('Chưa cấu hình GITHUB_TOKEN.');
    if (!/^[\w.-]+\/[\w.-]+$/.test(c.source_key)) throw new Error('Repository không hợp lệ.');
    const root = `https://api.github.com/repos/${c.source_key}`;
    const token = process.env.GITHUB_TOKEN;
    const [repo, commits, runs] = await Promise.all([
      api(root, token),
      api(root + '/commits?per_page=3', token),
      api(root + '/actions/runs?per_page=10', token),
    ]);
    if (!Array.isArray(commits) || !Array.isArray(runs.workflow_runs))
      throw new Error('Dữ liệu GitHub không hợp lệ.');
    // GitHub's issues API includes PRs. Fetch all pages before replacing cached data.
    for (let page = 1; ; page++) {
      if (page > 15)
        throw new Error(
          'Repository vượt 1.500 issue/PR mở; cần thu hẹp phạm vi trước khi đồng bộ.',
        );
      const list = await api(root + `/issues?state=open&per_page=100&page=${page}`, token);
      if (!Array.isArray(list)) throw new Error('Dữ liệu issue không hợp lệ.');
      for (const x of list)
        items.push({
          ...base(x, x.pull_request ? 'pull_request' : 'issue', x.title),
          status: 'open',
          url: url(x.html_url, 'github.com'),
        });
      if (list.length < 100) break;
    }
    for (const x of runs.workflow_runs || [])
      items.push({
        ...base(x, 'workflow', x.name || x.display_title),
        status: x.conclusion || x.status || 'unknown',
        url: url(x.html_url, 'github.com'),
      });
    snapshot = {
      name: clean(repo.full_name, c.source_key),
      open_issues: items.filter((x) => x.kind === 'issue').length,
      open_pull_requests: items.filter((x) => x.kind === 'pull_request').length,
      commits: Array.isArray(commits)
        ? commits.map((x: Json) => ({
            sha: clean(x.sha, '').slice(0, 7),
            message: clean(x.commit?.message, ''),
            url: url(x.html_url, 'github.com'),
          }))
        : [],
    };
  } else if (c.provider === 'vercel') {
    if (!process.env.VERCEL_TOKEN) throw new Error('Chưa cấu hình VERCEL_TOKEN.');
    const p = new URLSearchParams({ projectId: c.source_key, limit: '10' });
    if (process.env.VERCEL_TEAM_ID) p.set('teamId', process.env.VERCEL_TEAM_ID);
    const data = await api('https://api.vercel.com/v6/deployments?' + p, process.env.VERCEL_TOKEN);
    if (!Array.isArray(data.deployments)) throw new Error('Dữ liệu Vercel không hợp lệ.');
    for (const x of data.deployments || []) {
      const stamp =
        typeof x.created === 'number' ? new Date(x.created).toISOString() : iso(x.createdAt);
      const host = String(x.url || '');
      items.push({
        ...base({ id: x.uid, updated_at: stamp }, 'deployment', x.name),
        status: clean(x.readyState || x.state, 'unknown', 60),
        url: /^[a-z0-9.-]+\.vercel\.app$/i.test(host) ? 'https://' + host : '',
      });
    }
    snapshot = {
      deployments: items.map((x) => ({
        id: x.external_id,
        name: x.title,
        state: x.status,
        url: x.url,
        created: x.source_updated_at,
      })),
    };
  } else if (c.provider === 'todoist') {
    if (!process.env.TODOIST_TOKEN) throw new Error('Chưa cấu hình TODOIST_TOKEN.');
    let cursor = '';
    for (let page = 0; ; page++) {
      if (page >= 20) throw new Error('Todoist vượt phạm vi 2.000 task; chưa thay thế dữ liệu cũ.');
      const p = new URLSearchParams({ limit: '100' });
      if (cursor) p.set('cursor', cursor);
      const data = await api(
        'https://api.todoist.com/api/v1/tasks?' + p,
        process.env.TODOIST_TOKEN,
      );
      if (!Array.isArray(data.results)) throw new Error('Dữ liệu Todoist không hợp lệ.');
      for (const x of data.results) {
        const due = String(x.due?.date || '').slice(0, 10);
        items.push({
          ...base(x, 'task', x.content),
          status: x.is_completed ? 'done' : 'open',
          url: `https://app.todoist.com/app/task/${encodeURIComponent(x.id)}`,
          due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        });
      }
      if (!data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } else {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN)
      throw new Error('Chưa cấu hình quyền đọc Google Calendar.');
    const auth = await api('https://oauth2.googleapis.com/token', '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    if (!auth.access_token) throw new Error('Không làm mới được quyền Google Calendar.');
    // Bounded rolling window; the provider expands recurring events and preserves all-day dates.
    const start = dateKey() + 'T00:00:00+07:00',
      end = new Date(Date.parse(start) + 31 * 86400000).toISOString();
    let pageToken = '';
    for (let page = 0; ; page++) {
      if (page >= 8) throw new Error('Lịch vượt phạm vi 2.000 sự kiện; chưa thay thế dữ liệu cũ.');
      const p = new URLSearchParams({
        timeMin: start,
        timeMax: end,
        singleEvents: 'true',
        showDeleted: 'false',
        maxResults: '250',
        orderBy: 'startTime',
        timeZone: 'Asia/Bangkok',
      });
      if (pageToken) p.set('pageToken', pageToken);
      const data = await api(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.source_key)}/events?${p}`,
        auth.access_token,
      );
      for (const x of data.items || []) {
        if (x.status === 'cancelled') continue;
        items.push({
          ...base({ ...x, updated_at: x.updated }, 'event', x.summary || 'Sự kiện riêng tư'),
          status: clean(x.status, 'confirmed', 60),
          url: url(x.htmlLink, 'www.google.com') || url(x.htmlLink, 'calendar.google.com'),
          starts_at: x.start?.dateTime || x.start?.date || null,
          ends_at: x.end?.dateTime || x.end?.date || null,
          all_day: Boolean(x.start?.date),
          due_date: x.start?.date || null,
        });
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
  }
  if (items.length > 2000)
    throw new Error('Nguồn vượt giới hạn 2.000 mục; chưa thay thế dữ liệu cũ.');
  return { items: items.map((x) => connectedItemSchema.parse(x)), snapshot };
}
