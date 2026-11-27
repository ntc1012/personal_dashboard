import { dateKey, validateMutation } from './domain';
import type { Change, Entity, Mutation, Snapshot } from './types';
import { blankModules, moduleLabels } from './modules';
const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const P3 = '10000000-0000-4000-8000-000000000003';
export function demoSnapshot(): Snapshot {
  const now = new Date().toISOString();
  const base = { version: 1, created_at: now, updated_at: now, archived_at: null };
  const today = dateKey();
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  return {
    ...blankModules(),
    monitor_checks: [],
    incidents: [],
    agent_logs: [],
    integration_snapshots: [],
    integration_connections: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        provider: 'github',
        project_id: P1,
        source_key: 'example/demo',
        enabled: true,
        status: 'ready',
        last_success_at: now,
        last_event_at: now,
        next_sync_at: now,
        error: null,
      },
      {
        id: '71000000-0000-4000-8000-000000000002',
        provider: 'google_calendar',
        project_id: null,
        source_key: 'primary',
        enabled: true,
        status: 'ready',
        last_success_at: now,
        last_event_at: null,
        next_sync_at: now,
        error: null,
      },
      {
        id: '71000000-0000-4000-8000-000000000003',
        provider: 'todoist',
        project_id: null,
        source_key: 'personal',
        enabled: true,
        status: 'ready',
        last_success_at: now,
        last_event_at: null,
        next_sync_at: now,
        error: null,
      },
    ],
    connected_items: [
      {
        id: '72000000-0000-4000-8000-000000000001',
        connection_id: '71000000-0000-4000-8000-000000000001',
        external_id: 'issue:sample',
        kind: 'issue',
        title: '[Mẫu] Kiểm tra bố cục trên điện thoại',
        status: 'open',
        url: 'https://github.com',
        due_date: null,
        starts_at: null,
        ends_at: null,
        all_day: false,
        source_updated_at: now,
        checked_at: now,
      },
      {
        id: '72000000-0000-4000-8000-000000000002',
        connection_id: '71000000-0000-4000-8000-000000000001',
        external_id: 'workflow:sample',
        kind: 'workflow',
        title: '[Mẫu] Kiểm tra ứng dụng',
        status: 'failure',
        url: 'https://github.com',
        due_date: null,
        starts_at: null,
        ends_at: null,
        all_day: false,
        source_updated_at: now,
        checked_at: now,
      },
      {
        id: '72000000-0000-4000-8000-000000000003',
        connection_id: '71000000-0000-4000-8000-000000000002',
        external_id: 'event:sample',
        kind: 'event',
        title: '[Mẫu] Khoảng thời gian học tập',
        status: 'confirmed',
        url: 'https://calendar.google.com',
        due_date: null,
        starts_at: new Date(Date.now() + 3600000).toISOString(),
        ends_at: new Date(Date.now() + 7200000).toISOString(),
        all_day: false,
        source_updated_at: now,
        checked_at: now,
      },
      {
        id: '72000000-0000-4000-8000-000000000004',
        connection_id: '71000000-0000-4000-8000-000000000003',
        external_id: 'task:sample',
        kind: 'task',
        title: '[Mẫu] Chuẩn bị tài liệu cho ngày mai',
        status: 'open',
        url: 'https://app.todoist.com',
        due_date: today,
        starts_at: null,
        ends_at: null,
        all_day: false,
        source_updated_at: now,
        checked_at: now,
      },
    ],
    integration_activity: [
      {
        id: '73000000-0000-4000-8000-000000000001',
        connection_id: '71000000-0000-4000-8000-000000000001',
        title: '[Mẫu] GitHub · Workflow cần kiểm tra',
        url: 'https://github.com',
        happened_at: now,
        created_at: now,
      },
    ],
    job_runs: [],
    study_logs: [
      {
        ...base,
        id: '40000000-0000-4000-8000-000000000001',
        language: 'en',
        date: today,
        minutes: 15,
        notes: 'Nhật ký mẫu: một khoảng học ngắn.',
      },
    ],
    vocab_cards: [
      {
        ...base,
        id: '50000000-0000-4000-8000-000000000001',
        language: 'en',
        front: 'focus',
        back: 'tập trung',
        phonetic: 'ˈfəʊkəs',
        example: 'Focus on one small task.',
        due_date: today,
        interval_days: 0,
        repetitions: 0,
        ease: 2.5,
        last_reviewed: null,
      },
      {
        ...base,
        id: '50000000-0000-4000-8000-000000000002',
        language: 'zh',
        front: '你好',
        back: 'xin chào',
        phonetic: 'nǐ hǎo',
        example: '你好！',
        due_date: today,
        interval_days: 0,
        repetitions: 0,
        ease: 2.5,
        last_reviewed: null,
      },
    ],
    monitors: [
      {
        ...base,
        id: '60000000-0000-4000-8000-000000000001',
        name: 'Website mẫu',
        url: 'https://example.com',
        project_id: null,
        expected_status: 200,
        interval_minutes: 15,
        failure_threshold: 2,
        timeout_ms: 8000,
        enabled: true,
      },
    ],
    news_sources: [
      {
        ...base,
        id: '70000000-0000-4000-8000-000000000001',
        name: 'CISA Known Exploited Vulnerabilities',
        url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
        enabled: true,
        keywords: [],
      },
    ],
    projects: [
      {
        ...base,
        id: P1,
        name: 'J.A.R.V.I.S. Dashboard',
        category: 'personal',
        prod_url: '',
        repo_url: '',
        stack: 'Next.js · TypeScript · Supabase',
        status: 'active',
        notes: 'Xây một không gian làm việc của riêng mình.',
      },
      {
        ...base,
        id: P2,
        name: 'English, every day',
        category: 'personal',
        prod_url: '',
        repo_url: '',
        stack: 'Learning · Practice',
        status: 'active',
        notes: 'Một chút mỗi ngày, đi xa hơn mỗi tuần.',
      },
      {
        ...base,
        id: P3,
        name: 'Đồ án học kỳ',
        category: 'school',
        prod_url: '',
        repo_url: '',
        stack: 'Research · Development',
        status: 'active',
        notes: 'Tập trung hoàn thiện từng phần.',
      },
    ],
    tasks: [
      {
        ...base,
        id: '20000000-0000-4000-8000-000000000001',
        title: 'Hoàn thiện trang tổng quan cá nhân',
        project_id: P1,
        due_date: today,
        priority: 'high',
        status: 'todo',
        done_at: null,
        notes: '',
      },
      {
        ...base,
        id: '20000000-0000-4000-8000-000000000002',
        title: 'Luyện nghe tiếng Anh 20 phút',
        project_id: P2,
        due_date: today,
        priority: 'medium',
        status: 'todo',
        done_at: null,
        notes: '',
      },
      {
        ...base,
        id: '20000000-0000-4000-8000-000000000003',
        title: 'Phác thảo ý tưởng cho đồ án',
        project_id: P3,
        due_date: today,
        priority: 'medium',
        status: 'todo',
        done_at: null,
        notes: '',
      },
      {
        ...base,
        id: '20000000-0000-4000-8000-000000000004',
        title: 'Kiểm tra quy trình sao lưu dữ liệu',
        project_id: P1,
        due_date: tomorrow,
        priority: 'high',
        status: 'todo',
        done_at: null,
        notes: '',
      },
      {
        ...base,
        id: '20000000-0000-4000-8000-000000000005',
        title: 'Sắp xếp các đường dẫn dự án',
        project_id: P1,
        due_date: today,
        priority: 'low',
        status: 'done',
        done_at: now,
        notes: '',
      },
    ],
    project_configs: [
      {
        ...base,
        id: '30000000-0000-4000-8000-000000000001',
        project_id: P1,
        title: 'Khởi động dự án',
        run_steps: 'npm install\nnpm run dev',
        deploy_steps:
          'Chạy migration Supabase.\nCấu hình biến môi trường trên Vercel.\nKiểm tra đăng nhập và dữ liệu sau deploy.',
        env_var_names:
          'NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\nJARVIS_OWNER_ID',
        runtime: 'Node.js 22+',
        troubleshooting: 'Nếu chưa tải được dữ liệu, kiểm tra migration và quyền của tài khoản.',
      },
    ],
    changes: [],
  };
}
type DemoEvent = Change & { before: Record<string, unknown> | null };
export type DemoState = { snapshot: Snapshot; events: DemoEvent[] };
export function demoMutate(state: DemoState, input: Mutation): DemoState {
  const m = validateMutation(input);
  if (m.entity === 'vault_meta' && m.action !== 'create')
    throw new Error('Vault metadata is immutable.');
  if (m.entity === 'ai_usage' && m.data.source === 'api')
    throw new Error('Automatic usage is server-only.');
  const next = structuredClone(state);
  const rows = next.snapshot[m.entity] as unknown as Record<string, unknown>[];
  const row = rows.find((r) => r.id === m.id);
  if (m.action === 'create' && row) throw new Error('Yêu cầu đã được lưu. Hãy tải lại.');
  if (m.action !== 'create' && (!row || row.archived_at || row.version !== m.expectedVersion))
    throw new Error('Dữ liệu đã thay đổi. Hãy tải lại.');
  if (m.entity !== 'projects' && m.action !== 'archive') {
    const pid = m.data.project_id === undefined ? row?.project_id : m.data.project_id;
    if (pid && !next.snapshot.projects.some((p) => p.id === pid && !p.archived_at))
      throw new Error('Dự án không tồn tại hoặc đã lưu trữ.');
  }
  if (m.entity === 'projects' && m.action === 'archive') assertNoChildren(next.snapshot, m.id);
  const before = row ? structuredClone(row) : null;
  const now = new Date().toISOString();
  const after = {
    ...(row || { id: m.id, created_at: now, archived_at: null }),
    ...m.data,
    version: Number(row?.version || 0) + 1,
    updated_at: now,
  };
  if (m.action === 'archive') Object.assign(after, { archived_at: now });
  if (m.entity === 'tasks')
    Object.assign(after, {
      done_at: 'status' in after && after.status === 'done' ? row?.done_at || now : null,
    });
  if (row) rows[rows.indexOf(row)] = after;
  else rows.unshift(after);
  const event: DemoEvent = {
    id: crypto.randomUUID(),
    entity: m.entity,
    record_id: m.id,
    action: m.action,
    created_at: now,
    undone_at: null,
    after_version: after.version,
    before,
  };
  next.events.unshift(event);
  const { before: _before, ...summary } = event;
  next.snapshot.changes.unshift(summary);
  return next;
}
function assertNoChildren(s: Snapshot, id: string) {
  if (
    s.tasks.some((t) => t.project_id === id && !t.archived_at) ||
    s.project_configs.some((c) => c.project_id === id && !c.archived_at) ||
    s.monitors.some((m) => m.project_id === id && !m.archived_at) ||
    s.ai_usage.some((u) => u.project_id === id && !u.archived_at)
  )
    throw new Error('Hãy lưu trữ các công việc và cấu hình liên quan trước.');
}
export function demoUndo(state: DemoState, id: string): DemoState {
  const next = structuredClone(state);
  const event = next.events.find((e) => e.id === id);
  if (event?.entity === 'vault_meta')
    throw new Error('Không hoàn tác thiết lập khóa vault; dùng bản sao lưu mã hóa để phục hồi.');
  if (!event || event.undone_at) throw new Error('Thao tác này đã được hoàn tác.');
  const rows = next.snapshot[event.entity] as unknown as Record<string, unknown>[];
  const index = rows.findIndex((r) => r.id === event.record_id);
  const current = rows[index];
  if (!current || current.version !== event.after_version)
    throw new Error('Mục đã được sửa tiếp; không thể hoàn tác đè lên thay đổi mới.');
  if (event.entity === 'projects' && event.action === 'create')
    assertNoChildren(next.snapshot, event.record_id);
  const now = new Date().toISOString();
  const restored: Record<string, unknown> = event.before
    ? { ...event.before }
    : { ...current, archived_at: now };
  if (
    event.entity !== 'projects' &&
    !restored.archived_at &&
    restored.project_id &&
    !next.snapshot.projects.some((p) => p.id === restored.project_id && !p.archived_at)
  )
    throw new Error('Khôi phục dự án liên quan trước.');
  rows[index] = { ...restored, version: Number(current.version) + 1, updated_at: now };
  event.undone_at = now;
  const summary = next.snapshot.changes.find((c) => c.id === id);
  if (summary) summary.undone_at = now;
  return next;
}
export const labels: Record<Entity, string> = {
  ...moduleLabels,
  projects: 'dự án',
  tasks: 'công việc',
  project_configs: 'cấu hình',
};
