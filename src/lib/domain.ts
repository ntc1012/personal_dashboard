import { z } from 'zod';
import type { Mutation, Snapshot, Task } from './types';
import { extraEntities, extraSchemas } from './modules';

const url = z
  .union([
    z.literal(''),
    z
      .url()
      .refine(
        (v) => ['https:', 'http:'].includes(new URL(v).protocol),
        'Chỉ dùng đường dẫn HTTP/HTTPS.',
      ),
  ])
  .default('');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Ngày không hợp lệ.')
  .nullable()
  .default(null);
const project = z
  .object({
    name: z.string().trim().min(1).max(120),
    vercel_project_id: z.string().max(150).default(''),
    category: z.enum(['personal', 'school', 'work']),
    prod_url: url,
    repo_url: url,
    stack: z.string().max(300).default(''),
    status: z.enum(['active', 'paused', 'done']),
    notes: z.string().max(5000).default(''),
  })
  .strict();
const task = z
  .object({
    title: z.string().trim().min(1).max(240),
    project_id: z.uuid().nullable().default(null),
    due_date: date,
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['todo', 'done']),
    notes: z.string().max(5000).default(''),
  })
  .strict();
const config = z
  .object({
    project_id: z.uuid(),
    title: z.string().trim().min(1).max(160),
    run_steps: z.string().max(10000).default(''),
    deploy_steps: z.string().max(10000).default(''),
    env_var_names: z
      .string()
      .max(2000)
      .refine(
        (v) => v.split(/[\n,]/).every((s) => !s.trim() || /^[A-Z_][A-Z0-9_]*$/.test(s.trim())),
        'Chỉ nhập tên biến, mỗi dòng một tên; không nhập giá trị.',
      )
      .default(''),
    runtime: z.string().max(200).default(''),
    troubleshooting: z.string().max(10000).default(''),
  })
  .strict();
export const mutationSchema = z
  .object({
    entity: z.enum(['projects', 'tasks', 'project_configs', ...extraEntities]),
    action: z.enum(['create', 'update', 'archive']),
    id: z.uuid(),
    expectedVersion: z.number().int().positive().optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export function validateMutation(input: unknown): Mutation {
  const m = mutationSchema.parse(input);
  if (m.action !== 'create' && !m.expectedVersion)
    throw new Error('Thiếu phiên bản dữ liệu. Hãy tải lại.');
  if (m.action !== 'archive') {
    const s =
      m.entity === 'projects'
        ? project
        : m.entity === 'tasks'
          ? task
          : m.entity === 'project_configs'
            ? config
            : extraSchemas[m.entity];
    if (m.action === 'create') m.data = s.parse(m.data);
    else {
      const keys = Object.keys(m.data);
      if (!keys.length) throw new Error('Không có trường nào cần thay đổi.');
      const parsed = s.partial().parse(m.data) as Record<string, unknown>;
      // Zod defaults also apply inside optional fields. Patch only explicitly supplied keys.
      m.data = Object.fromEntries(keys.map((key) => [key, parsed[key]]));
    }
  } else m.data = {};
  return m;
}
export function dateKey(dateValue = new Date(), timezone = 'Asia/Bangkok') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateValue);
  return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)!.value).join('-');
}
export function taskBuckets(tasks: Task[], today: string) {
  const open = tasks.filter((t) => !t.archived_at && t.status !== 'done');
  return {
    overdue: open.filter((t) => t.due_date && t.due_date < today),
    today: open.filter((t) => t.due_date === today),
    upcoming: open.filter((t) => t.due_date && t.due_date > today),
    unscheduled: open.filter((t) => !t.due_date),
  };
}
export function visible(snapshot: Snapshot) {
  const copy = { ...snapshot };
  for (const entity of ['projects', 'tasks', 'project_configs', ...extraEntities] as const)
    (copy[entity] as unknown[]) = snapshot[entity].filter((row) => !row.archived_at);
  return copy;
}
