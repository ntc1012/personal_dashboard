import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Snapshot } from './types';
import { extraEntities } from './modules';
export async function readSnapshot(db: SupabaseClient, userId?: string): Promise<Snapshot> {
  const names = [
    'projects',
    'tasks',
    'project_configs',
    ...extraEntities,
    'changes',
    'monitor_checks',
    'incidents',
    'agent_logs',
    'integration_snapshots',
    'job_runs',
    'integration_connections',
    'connected_items',
    'integration_activity',
  ] as const;
  const entries = await Promise.all(
    names.map(async (name) => {
      const columns =
        name === 'changes' ? 'id,entity,record_id,action,created_at,undone_at,after_version' : '*';
      const order =
        name === 'monitor_checks'
          ? 'checked_at'
          : name === 'incidents'
            ? 'opened_at'
            : name === 'integration_snapshots'
              ? 'checked_at'
              : name === 'integration_connections'
                ? 'next_sync_at'
                : name === 'connected_items'
                  ? 'checked_at'
                  : name === 'job_runs'
                    ? 'started_at'
                    : 'created_at';
      const recentOnly = [
        'changes',
        'monitor_checks',
        'agent_logs',
        'job_runs',
        'news_items',
        'integration_activity',
      ].includes(name);
      const rows: unknown[] = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        let query = db.from(name).select(columns).order(order, { ascending: false });
        query = recentOnly
          ? query.limit(name === 'news_items' ? 500 : 1000)
          : query.range(offset, offset + 999);
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await query;
        if (error)
          throw new Error(
            'Không đọc được dữ liệu. Kiểm tra kết nối và chạy đầy đủ migration Supabase.',
          );
        rows.push(...(data || []));
        if (recentOnly || !data || data.length < 1000) return [name, rows];
      }
      throw new Error(
        `Module ${name} vượt giới hạn tải 10.000 bản ghi. Cần phân trang trước khi tiếp tục; không dùng số liệu bị cắt.`,
      );
    }),
  );
  return Object.fromEntries(entries) as Snapshot;
}
