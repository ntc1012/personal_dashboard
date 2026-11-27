import { z } from 'zod';
import { extraSchemas, day } from '../modules';
import { dateKey, taskBuckets, visible } from '../domain';
import type { Snapshot, Mutation } from '../types';
import { agentPolicy } from '../agent-policy';
import { connectedOverview } from '../integration-model';
const id = z.uuid(),
  query = z.object({ query: z.string().max(200).default('') }).strict(),
  empty = z.object({}).strict();
export const toolSchemas = {
  list_projects: empty,
  get_project: z.object({ id }).strict(),
  list_tasks: query,
  get_connected_status: query,
  search_configs: query,
  get_monitor_status: empty,
  get_gym_summary: empty,
  get_study_summary: empty,
  get_ai_usage: empty,
  search_news: query,
  get_weekly_review: empty,
  find_credential: query,
  add_task: z
    .object({
      title: z.string().trim().min(1).max(240),
      project_id: id.nullable().default(null),
      due_date: day.nullable().default(null),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      notes: z.string().max(5000).default(''),
    })
    .strict(),
  log_workout: extraSchemas.workouts,
  log_study: extraSchemas.study_logs,
  add_project_note: z.object({ project_id: id, note: z.string().trim().min(1).max(3000) }).strict(),
  mark_news_read: z.object({ id }).strict(),
  update_task: z
    .object({
      id,
      changes: z
        .object({
          title: z.string().min(1).max(240).optional(),
          due_date: day.nullable().optional(),
          priority: z.enum(['low', 'medium', 'high']).optional(),
          status: z.enum(['todo', 'done']).optional(),
        })
        .strict(),
    })
    .strict(),
  bulk_update: z
    .object({
      ids: z.array(id).min(1).max(100),
      changes: z
        .object({
          due_date: day.nullable().optional(),
          priority: z.enum(['low', 'medium', 'high']).optional(),
          status: z.enum(['todo', 'done']).optional(),
        })
        .strict(),
    })
    .strict(),
  bulk_archive: z
    .object({ entity: z.enum(['tasks', 'projects']), ids: z.array(id).min(1).max(100) })
    .strict(),
  disable_monitor: z.object({ id }).strict(),
  update_config: z
    .object({
      id,
      changes: extraSchemas.settings
        .pick({})
        .extend({
          title: z.string().min(1).max(160).optional(),
          run_steps: z.string().max(10000).optional(),
          deploy_steps: z.string().max(10000).optional(),
          runtime: z.string().max(200).optional(),
          troubleshooting: z.string().max(10000).optional(),
          env_var_names: z.string().max(2000).optional(),
        })
        .strict(),
    })
    .strict(),
  send_notification: z.object({ message: z.string().trim().min(1).max(4000) }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export type PendingProposal = { id: string; tool: string; preview: string; expires_at: string };
export type AgentReply = {
  text: string;
  change?: import('../types').Change;
  changes?: import('../types').Change[];
  pending?: PendingProposal;
  mode: 'local' | 'llm';
};
export function normalized(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}
export function writeIntent(tool: string, text: string) {
  const s = normalized(text)
    .trim()
    .replace(/^(hay|vui long|giup toi|ban hay)\s+/, '');
  if (
    !/^(them|tao|ghi|danh dau|sua|doi|cap nhat|xoa|luu tru|tat|gui|add|create|log|mark|update|delete|disable|send)\b/.test(
      s,
    )
  )
    return false;
  const rules: Record<string, RegExp> = {
    add_task: /^(them|tao|add|create).*\b(task|cong viec|viec)\b/,
    log_workout: /^(ghi|log).*(tap|gym|workout)/,
    log_study: /^(ghi|log).*(hoc|study)/,
    add_project_note: /^(them|ghi|add).*(ghi chu|note)/,
    mark_news_read: /^(danh dau|mark).*(doc|read)/,
    update_task: /^(sua|doi|cap nhat|update).*(task|cong viec|deadline|viec)/,
    bulk_update: /^(sua|doi|cap nhat|update)/,
    bulk_archive: /^(xoa|luu tru|delete)/,
    disable_monitor: /^(tat|disable)/,
    update_config: /^(sua|doi|cap nhat|update).*(cau hinh|config)/,
    send_notification: /^(gui|send)/,
  };
  return rules[tool]?.test(s) ?? false;
}
const has = (value: string, q: string) => normalized(value).includes(normalized(q));
export function readTool(tool: ToolName, args: Record<string, unknown>, snapshot: Snapshot) {
  const s = visible(snapshot),
    q = String(args.query || '');
  switch (tool) {
    case 'list_projects':
      return s.projects;
    case 'get_project':
      return {
        project: s.projects.find((p) => p.id === args.id) || null,
        integrations: s.integration_snapshots.filter((i) => i.project_id === args.id),
        connected: (s.connected_items || [])
          .filter((i) =>
            (s.integration_connections || []).some(
              (c) => c.id === i.connection_id && c.project_id === args.id,
            ),
          )
          .slice(0, 100),
      };
    case 'get_connected_status': {
      const overview = connectedOverview(s.integration_connections || [], s.connected_items || []);
      return {
        ...overview,
        failed: overview.failed.slice(0, 30),
        active: overview.active.filter((i) => has(i.title, q)).slice(0, 100),
        activity: (s.integration_activity || []).slice(0, 20),
      };
    }
    case 'list_tasks': {
      const connected = connectedOverview(s.integration_connections || [], s.connected_items || []);
      return {
        today: dateKey(),
        buckets: taskBuckets(s.tasks, dateKey()),
        tasks: s.tasks.filter((t) => has(t.title + ' ' + t.notes, q)).slice(0, 100),
        connected: {
          ...connected,
          failed: connected.failed.slice(0, 30),
          active: connected.active
            .filter((i) => i.kind === 'task' || i.kind === 'event')
            .slice(0, 100),
          total_connected: connected.active.length,
        },
      };
    }
    case 'search_configs':
      return s.project_configs
        .filter((c) => has(c.title + ' ' + c.run_steps + ' ' + c.troubleshooting, q))
        .slice(0, 15);
    case 'get_monitor_status':
      return s.monitors.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        enabled: m.enabled,
        latest: s.monitor_checks.find((c) => c.monitor_id === m.id) || null,
        stale: !s.monitor_checks.some(
          (c) =>
            c.monitor_id === m.id &&
            new Date(c.checked_at).valueOf() >= new Date(m.updated_at).valueOf() &&
            Date.now() - new Date(c.checked_at).valueOf() <= m.interval_minutes * 120000,
        ),
        incident: s.incidents.find((i) => i.monitor_id === m.id && !i.resolved_at) || null,
      }));
    case 'get_gym_summary':
      return { workouts: s.workouts.slice(0, 20), body_metrics: s.body_metrics.slice(0, 30) };
    case 'get_study_summary':
      return {
        logs: s.study_logs.slice(0, 60),
        due_cards: s.vocab_cards.filter((c) => c.due_date <= dateKey()).slice(0, 100),
        total_cards: s.vocab_cards.length,
      };
    case 'get_ai_usage':
      return s.ai_usage.filter((u) => u.date.startsWith(dateKey().slice(0, 7)));
    case 'search_news':
      return s.news_items.filter((n) => has(n.title + ' ' + n.summary, q)).slice(0, 10);
    case 'get_weekly_review':
      return s.weekly_reviews.slice(0, 4);
    case 'find_credential':
      return s.vault_items
        .filter((v) => has(v.label + ' ' + v.category, q))
        .map((v) => ({ id: v.id, label: v.label, category: v.category, location: v.location }));
    default:
      throw new Error('Không phải tool chỉ đọc.');
  }
}
export function toolMutations(
  tool: ToolName,
  args: Record<string, unknown>,
  snapshot: Snapshot,
  requestId: string,
): Mutation[] {
  const s = visible(snapshot);
  const parsed = toolSchemas[tool].parse(args) as Record<string, unknown>;
  const edit = (
    entity: 'tasks' | 'projects' | 'project_configs' | 'monitors' | 'news_items',
    recordId: string,
    data: Record<string, unknown>,
    action: 'update' | 'archive' = 'update',
  ): Mutation => {
    const row = s[entity].find((r) => r.id === recordId);
    if (!row) throw new Error('Không tìm thấy mục cần thay đổi.');
    return { entity, id: recordId, action, expectedVersion: row.version, data };
  };
  switch (tool) {
    case 'add_task':
      return [
        { entity: 'tasks', action: 'create', id: requestId, data: { ...parsed, status: 'todo' } },
      ];
    case 'log_workout':
      return [{ entity: 'workouts', action: 'create', id: requestId, data: parsed }];
    case 'log_study':
      return [{ entity: 'study_logs', action: 'create', id: requestId, data: parsed }];
    case 'add_project_note': {
      const p = s.projects.find((p) => p.id === parsed.project_id);
      if (!p) throw new Error('Không tìm thấy dự án.');
      return [edit('projects', p.id, { notes: [p.notes, parsed.note].filter(Boolean).join('\n') })];
    }
    case 'mark_news_read':
      return [edit('news_items', String(parsed.id), { read: true })];
    case 'update_task':
      return [edit('tasks', String(parsed.id), parsed.changes as Record<string, unknown>)];
    case 'bulk_update':
      return [...new Set(parsed.ids as string[])].map((i) =>
        edit('tasks', i, parsed.changes as Record<string, unknown>),
      );
    case 'bulk_archive':
      return [...new Set(parsed.ids as string[])].map((i) =>
        edit(parsed.entity as 'tasks' | 'projects', i, {}, 'archive'),
      );
    case 'disable_monitor':
      return [edit('monitors', String(parsed.id), { enabled: false })];
    case 'update_config':
      return [
        edit('project_configs', String(parsed.id), parsed.changes as Record<string, unknown>),
      ];
    default:
      throw new Error('Tool ghi chưa được cho phép.');
  }
}
export function availableTools(text: string) {
  return (Object.keys(toolSchemas) as ToolName[]).filter(
    (tool) => agentPolicy(tool).tier === 1 || writeIntent(tool, text),
  );
}
export function localToolPlan(
  text: string,
): { tool: ToolName; args: Record<string, unknown> } | null {
  const n = normalized(text).trim();
  const explicitDate = n.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const logDate =
    explicitDate || (/hom qua/.test(n) ? dateKey(new Date(Date.now() - 86400000)) : dateKey());
  if (/^them (task|cong viec)\s*:/.test(n))
    return { tool: 'add_task', args: { title: text.slice(text.indexOf(':') + 1).trim() } };
  if (/^ghi.*hoc/.test(n)) {
    const minutes = n.match(/(\d+)\s*phut/);
    if (minutes && /tieng anh|english|\ben\b|ielts|toeic|tieng trung|chinese|\bzh\b|hsk/.test(n))
      return {
        tool: 'log_study',
        args: {
          language: /trung|chinese|\bzh\b/.test(n) ? 'zh' : 'en',
          date: logDate,
          minutes: Number(minutes[1]),
          notes: '',
        },
      };
  }
  if (/^ghi.*tap/.test(n)) {
    const set = n.match(/([a-z][a-z ]+?)\s+(\d+(?:\.\d+)?)\s*kg\s+(\d+)\s*[x×]\s*(\d+)/);
    if (set && Number(set[3]) <= 30)
      return {
        tool: 'log_workout',
        args: {
          date: logDate,
          title: text.slice(0, 160),
          duration_min: 0,
          sets: Array.from({ length: Number(set[3]) }, () => ({
            exercise: set[1].replace(/^ghi buoi tap\s*/, '').trim(),
            weight_kg: Number(set[2]),
            reps: Number(set[4]),
          })),
          notes: '',
        },
      };
  }
  if (/mat khau|tai khoan|credential|vault/.test(n))
    return {
      tool: 'find_credential',
      args: { query: n.match(/discord|github|vercel|email/)?.[0] || '' },
    };
  if (/web.*loi|monitor|website|giam sat/.test(n)) return { tool: 'get_monitor_status', args: {} };
  if (/chi phi|bao nhieu tien|ton.*ai|ai usage|token/.test(n))
    return { tool: 'get_ai_usage', args: {} };
  if (/review|tuan nay|tong ket/.test(n)) return { tool: 'get_weekly_review', args: {} };
  if (/gym|buoi tap|tap luyen/.test(n)) return { tool: 'get_gym_summary', args: {} };
  if (/hoc|ngoai ngu/.test(n) && !/hom nay|con gi/.test(n))
    return { tool: 'get_study_summary', args: {} };
  if (/tin tuc|bao mat|ban tin|cve/.test(n)) return { tool: 'search_news', args: { query: '' } };
  if (/cau hinh|cach chay|khoi dong|fix loi|config/.test(n))
    return { tool: 'search_configs', args: { query: '' } };
  if (
    /dong bo|ket noi|deploy|github|vercel|todoist|calendar|lich hen|lich hom nay|su kien|can chu y|ci\b/.test(
      n,
    )
  )
    return { tool: 'get_connected_status', args: { query: '' } };
  if (/hom nay|con gi|cong viec|task|deadline/.test(n))
    return { tool: 'list_tasks', args: { query: '' } };
  if (/du an|project/.test(n)) return { tool: 'list_projects', args: {} };
  return null;
}
export function localReadAnswer(tool: ToolName, args: Record<string, unknown>, snapshot: Snapshot) {
  const s = visible(snapshot),
    result = readTool(tool, args, snapshot);
  if (tool === 'list_tasks') {
    const b = taskBuckets(s.tasks, dateKey());
    const connected = connectedOverview(s.integration_connections || [], s.connected_items || []);
    const due = connected.active.filter(
      (i) => i.kind === 'task' && i.due_date && i.due_date <= dateKey() && i.status !== 'done',
    );
    const events = connected.active.filter(
      (i) =>
        i.kind === 'event' &&
        i.starts_at &&
        (i.all_day
          ? i.starts_at <= dateKey() && (i.ends_at || '') > dateKey()
          : dateKey(new Date(i.starts_at)) === dateKey()),
    );
    return `Hôm nay: ${b.today.length} việc nội bộ đến hạn, ${b.overdue.length} việc nội bộ quá hạn.\n${[...b.overdue, ...b.today].map((t) => `• ${t.title} · ${t.due_date}`).join('\n') || 'Chưa có việc nội bộ cần làm hôm nay.'}\n${b.upcoming.length} việc sắp tới; ${b.unscheduled.length} việc chưa đặt ngày.\nTừ dịch vụ: ${due.length} việc đến hạn/quá hạn, ${events.length} sự kiện hôm nay.\n${[
      ...due,
      ...events,
    ]
      .slice(0, 20)
      .map(
        (i) => `• ${i.title} · ${i.starts_at || i.due_date} · ${i.url} · cập nhật ${i.checked_at}`,
      )
      .join(
        '\n',
      )}\n${connected.connections.some((c) => c.stale) ? 'Có nguồn dữ liệu cũ hoặc tạm dừng; kiểm tra Trung tâm kết nối.' : ''}`;
  }
  if (tool === 'get_connected_status') {
    const c = connectedOverview(s.integration_connections || [], s.connected_items || []);
    return c.connections.length
      ? `${c.connections.map((x) => `• ${x.provider}: ${!x.enabled ? 'đã tạm dừng' : x.status}${x.stale ? ' · dữ liệu cũ' : ''} · thành công gần nhất ${x.last_success_at || 'chưa có'}`).join('\n')}\nCần chú ý:\n${c.failed.map((i) => `• ${i.title}: ${i.status} · ${i.url} · cập nhật ${i.checked_at}`).join('\n') || 'Chưa thấy CI/deployment lỗi trong dữ liệu đã đồng bộ.'}\nLịch và công việc:\n${c.active
          .filter((i) => i.kind === 'event' || i.kind === 'task')
          .slice(0, 20)
          .map(
            (i) =>
              `• ${i.title} · ${i.starts_at || i.due_date || 'chưa có lịch'} · ${i.url} · cập nhật ${i.checked_at}`,
          )
          .join('\n')}`
      : 'Chưa có nguồn dịch vụ được kết nối.';
  }
  if (tool === 'get_monitor_status')
    return s.monitors.length
      ? s.monitors
          .map((m) => {
            const c = s.monitor_checks.find((c) => c.monitor_id === m.id);
            const stale =
              c &&
              (new Date(c.checked_at).valueOf() < new Date(m.updated_at).valueOf() ||
                Date.now() - new Date(c.checked_at).valueOf() > m.interval_minutes * 120000);
            return `• ${m.name}: ${!m.enabled ? 'đã tắt' : !c ? 'chưa có kết quả kiểm tra' : stale ? 'dữ liệu cũ; chưa thể kết luận' : c.ok ? 'HTTP bình thường' : 'đang lỗi'}${c ? ' · kiểm tra ' + c.checked_at : ''}`;
          })
          .join('\n')
      : 'Giám sát website chưa có monitor hoặc kết quả được kết nối.';
  if (tool === 'get_ai_usage')
    return `Chi phí AI tháng ${dateKey().slice(0, 7)}: $${(result as Snapshot['ai_usage']).reduce((a, u) => a + Number(u.cost_usd), 0).toFixed(4)}. Đây là chi phí ghi trong dashboard; không tự đọc hóa đơn công cụ ngoài.`;
  if (tool === 'list_projects')
    return s.projects.map((p) => `• ${p.name} · ${p.status}`).join('\n') || 'Chưa có dự án.';
  if (tool === 'get_gym_summary')
    return (
      s.workouts
        .slice(0, 10)
        .map((w) => `• ${w.date}: ${w.title}, ${w.sets.length} set`)
        .join('\n') || 'Chưa có buổi tập.'
    );
  if (tool === 'get_study_summary')
    return `Đã ghi ${s.study_logs.reduce((a, l) => a + l.minutes, 0)} phút học trong ${s.study_logs.length} bản ghi.`;
  if (tool === 'get_weekly_review')
    return s.weekly_reviews[0]?.summary || 'Chưa có review tuần; tạo trong mục Review tuần.';
  if (tool === 'search_configs')
    return (
      (result as Snapshot['project_configs'])
        .map((c) => `${c.title}\n${c.run_steps}\n${c.troubleshooting}`)
        .join('\n\n') || 'Chưa có hướng dẫn chạy.'
    );
  if (tool === 'search_news')
    return (
      (result as Snapshot['news_items']).map((n) => `• ${n.title}\n${n.url}`).join('\n') ||
      'Chưa có tin phù hợp.'
    );
  if (tool === 'find_credential')
    return (
      (result as { label: string; location: string }[])
        .map(
          (v) =>
            `• ${v.label}: ${v.location === 'bitwarden' ? 'trong Bitwarden' : 'trong Vault; mở từ giao diện để giải mã'}`,
        )
        .join('\n') || 'Không tìm thấy metadata tài khoản phù hợp. Mình không đọc nội dung bí mật.'
    );
  return JSON.stringify(result, null, 2);
}
export function safeAgentText(value: unknown) {
  return JSON.stringify(value)
    .replace(/(?:sk-|sb_secret_|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/((?:password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,"}]+/gi, '$1[REDACTED]')
    .slice(0, 12000);
}
