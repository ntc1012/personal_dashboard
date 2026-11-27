import { z } from 'zod';
import type { RecordBase } from './types';
const text = (n = 5000) => z.string().max(n);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T12:00:00Z');
    return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Ngày không hợp lệ.');
export const webUrl = z
  .url()
  .max(2000)
  .refine((v) => {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  }, 'Chỉ dùng URL HTTP/HTTPS không chứa tài khoản.');
const title = (n = 160) => z.string().trim().min(1).max(n);
const integer = (max = 1000000) => z.number().int().min(0).max(max);
export const workoutSetSchema = z
  .object({
    exercise: title(100),
    reps: z.number().int().min(1).max(1000),
    weight_kg: z.number().min(0).max(1000),
  })
  .strict();
export const extraSchemas = {
  study_logs: z
    .object({
      language: z.enum(['en', 'zh']),
      date: day,
      minutes: z.number().int().min(1).max(1440),
      notes: text().default(''),
    })
    .strict(),
  vocab_cards: z
    .object({
      language: z.enum(['en', 'zh']),
      front: title(300),
      back: title(2000),
      phonetic: text(300).default(''),
      example: text(2000).default(''),
      due_date: day,
      interval_days: integer(36500).default(0),
      repetitions: integer(10000).default(0),
      ease: z.number().min(1.3).max(5).default(2.5),
      last_reviewed: z.iso.datetime({ offset: true }).nullable().default(null),
    })
    .strict(),
  workouts: z
    .object({
      date: day,
      title: title(),
      duration_min: integer(1440).default(0),
      sets: z.array(workoutSetSchema).min(1).max(100),
      notes: text().default(''),
    })
    .strict(),
  body_metrics: z
    .object({
      date: day,
      weight_kg: z.number().positive().max(500).nullable().default(null),
      notes: text().default(''),
    })
    .strict(),
  ai_usage: z
    .object({
      date: day,
      tool: title(100),
      model: text(150).default(''),
      project_id: z.uuid().nullable().default(null),
      input_tokens: integer(100000000).default(0),
      output_tokens: integer(100000000).default(0),
      cost_usd: z.number().min(0).max(100000).default(0),
      source: z.enum(['manual', 'api']).default('manual'),
      notes: text().default(''),
      request_key: z.string().max(150).nullable().default(null),
    })
    .strict(),
  vault_meta: z
    .object({
      salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
      iterations: z.literal(600000),
      verifier: z.string().min(20).max(500),
      verifier_iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
      cipher_version: z.literal(1),
    })
    .strict(),
  vault_items: z
    .object({
      label: title(),
      category: title(60),
      location: z.enum(['vault', 'bitwarden']),
      ciphertext: z.string().min(1).max(150000),
      iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
      cipher_version: z.literal(1),
    })
    .strict(),
  monitors: z
    .object({
      name: title(),
      url: webUrl,
      project_id: z.uuid().nullable().default(null),
      expected_status: z.number().int().min(100).max(599).default(200),
      interval_minutes: z.number().int().min(5).max(1440).default(15),
      failure_threshold: z.number().int().min(2).max(10).default(2),
      timeout_ms: z.number().int().min(1000).max(10000).default(8000),
      enabled: z.boolean().default(true),
    })
    .strict(),
  news_sources: z
    .object({
      name: title(),
      url: webUrl,
      enabled: z.boolean().default(true),
      keywords: z.array(text(100)).max(30).default([]),
    })
    .strict(),
  news_items: z
    .object({
      source_id: z.uuid().nullable().default(null),
      title: title(500),
      url: webUrl,
      summary: text(10000).default(''),
      published_at: z.iso.datetime({ offset: true }).nullable().default(null),
      tags: z.array(text(100)).max(30).default([]),
      read: z.boolean().default(false),
      external_id: title(200),
    })
    .strict(),
  weekly_reviews: z
    .object({
      week_start: day,
      metrics: z.record(z.string(), z.number()).default({}),
      summary: text(10000),
      suggestions: z.array(text(500)).length(3),
      source: z.enum(['deterministic', 'llm']).default('deterministic'),
    })
    .strict(),
  settings: z
    .object({
      theme: z.enum(['auto', 'dark', 'light']).default('auto'),
      sound: z.boolean().default(false),
      keywords: z.array(text(100)).max(30).default(['Next.js', 'PostgreSQL', 'Supabase']),
      ai_monthly_budget: z.number().min(0).max(100000).default(5),
      ai_daily_tokens: integer(10000000).default(20000),
      ai_input_per_million: z.number().min(0).max(1000).default(0),
      ai_output_per_million: z.number().min(0).max(1000).default(0),
      greeting: z.boolean().default(true),
      notifications: z.boolean().default(false),
    })
    .strict(),
};
export const extraEntities = Object.keys(extraSchemas) as ExtraEntity[];
export type ExtraEntity = keyof typeof extraSchemas;
export type ModuleMap = { [K in ExtraEntity]: (RecordBase & z.infer<(typeof extraSchemas)[K]>)[] };
export type ModuleRecord<K extends ExtraEntity = ExtraEntity> = ModuleMap[K][number];
export type StudyLog = ModuleRecord<'study_logs'>;
export type VocabCard = ModuleRecord<'vocab_cards'>;
export type Workout = ModuleRecord<'workouts'>;
export type AppSettings = ModuleRecord<'settings'>;
export type Monitor = ModuleRecord<'monitors'>;
export type VaultMeta = ModuleRecord<'vault_meta'>;
export type VaultItem = ModuleRecord<'vault_items'>;
export const moduleLabels: Record<ExtraEntity, string> = {
  study_logs: 'buổi học',
  vocab_cards: 'thẻ từ vựng',
  workouts: 'buổi tập',
  body_metrics: 'chỉ số cơ thể',
  ai_usage: 'chi phí AI',
  vault_meta: 'thiết lập vault',
  vault_items: 'mục vault',
  monitors: 'monitor',
  news_sources: 'nguồn tin',
  news_items: 'bản tin',
  weekly_reviews: 'review tuần',
  settings: 'cài đặt',
};
export const blankModules = () =>
  Object.fromEntries(extraEntities.map((k) => [k, []])) as unknown as ModuleMap;
export type MonitorCheck = {
  id: string;
  monitor_id: string;
  checked_at: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number;
  error: string | null;
  ssl_expires_at: string | null;
  domain_expires_at: string | null;
};
export type Incident = {
  id: string;
  monitor_id: string;
  opened_at: string;
  resolved_at: string | null;
  reason: string;
};
export type AgentLog = {
  id: string;
  tool: string;
  tier: number;
  status: string;
  created_at: string;
};
export type IntegrationSnapshot = {
  id: string;
  project_id: string;
  provider: 'github' | 'vercel';
  payload: Record<string, unknown>;
  checked_at: string;
};
export type JobRun = {
  id: string;
  name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  detail: string | null;
};
