import { z } from 'zod';
import { extraEntities } from './modules';
import { validateMutation } from './domain';
import type { Entity, Mutation, Snapshot } from './types';
const coreFields = {
  projects: [
    'name',
    'category',
    'prod_url',
    'repo_url',
    'stack',
    'status',
    'notes',
    'vercel_project_id',
  ],
  tasks: ['title', 'project_id', 'due_date', 'priority', 'status', 'notes', 'category', 'due_at'],
  project_configs: [
    'project_id',
    'title',
    'run_steps',
    'deploy_steps',
    'env_var_names',
    'runtime',
    'troubleshooting',
  ],
};
const protectedFields = new Set([
  'id',
  'user_id',
  'version',
  'created_at',
  'updated_at',
  'archived_at',
  'done_at',
]);
export function planBackupRestore(input: unknown, current: Snapshot) {
  const file = z
    .object({
      format: z.literal('jarvis-export-v1'),
      exported_at: z.string().optional(),
      data: z.record(z.string(), z.unknown()),
    })
    .strict()
    .parse(input);
  const order: Entity[] = [
    'projects',
    'project_configs',
    'tasks',
    'settings',
    'vault_meta',
    'vault_items',
    ...extraEntities.filter((e) => !['settings', 'vault_meta', 'vault_items'].includes(e)),
  ];
  const operations: Mutation[] = [];
  let skipped = 0;
  const existingMeta = current.vault_meta.find((m) => !m.archived_at);
  const importedMeta = (Array.isArray(file.data.vault_meta) ? file.data.vault_meta : []).find(
    (r: Record<string, unknown>) => !r.archived_at,
  ) as Record<string, unknown> | undefined;
  if (
    Array.isArray(file.data.vault_items) &&
    file.data.vault_items.some((r: Record<string, unknown>) => !r.archived_at) &&
    !importedMeta
  )
    throw new Error('Bản sao có mục vault nhưng thiếu metadata khóa gốc.');
  if (
    existingMeta &&
    importedMeta &&
    ['id', 'salt', 'iterations', 'verifier', 'verifier_iv', 'cipher_version'].some(
      (k) => existingMeta[k as keyof typeof existingMeta] !== importedMeta[k],
    )
  )
    throw new Error(
      'Bản sao lưu dùng khóa vault khác. Khôi phục vào một không gian trống để tránh trộn khóa.',
    );
  for (const entity of order) {
    if (file.data[entity] === undefined) continue;
    const rows = z.array(z.record(z.string(), z.unknown())).max(2000).parse(file.data[entity]);
    const existing = new Set(current[entity].map((row) => row.id));
    for (const row of rows) {
      const id = z.uuid().parse(row.id);
      if (
        existing.has(id) ||
        row.archived_at ||
        (entity === 'ai_usage' && row.source === 'api') ||
        (entity === 'settings' && current.settings.length)
      ) {
        skipped++;
        continue;
      }
      const allowed =
        entity in coreFields
          ? coreFields[entity as keyof typeof coreFields]
          : Object.keys(row).filter((k) => !protectedFields.has(k));
      const data = Object.fromEntries(
        allowed.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]),
      );
      operations.push(validateMutation({ entity, action: 'create', id, data }));
      existing.add(id);
    }
  }
  if (operations.length > 2000)
    throw new Error(
      'Khôi phục JSON tối đa 2000 bản ghi mỗi lần. Dùng bản SQL cho dữ liệu lớn hơn.',
    );
  return { operations, skipped };
}
