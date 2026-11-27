'use client';
import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LiveUpdates({
  enabled,
  onRefresh,
}: {
  enabled: boolean;
  onRefresh: () => Promise<void>;
}) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const [state, setState] = useState('Đang kết nối cập nhật…');
  useEffect(() => {
    if (!enabled) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setState('Chưa cấu hình cập nhật trực tiếp');
      return;
    }
    const db = createBrowserClient(url, key);
    let stopped = false,
      running = false,
      again = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof db.channel> | undefined;
    async function refresh() {
      if (stopped || document.hidden) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await refreshRef.current();
        if (!stopped) setState('Đã cập nhật dữ liệu');
      } catch {
        if (!stopped) setState('Chưa tải được thay đổi; đang giữ dữ liệu lần cuối');
      } finally {
        running = false;
        if (again) {
          again = false;
          schedule();
        }
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 900);
    }
    function visible() {
      if (!document.hidden) schedule();
    }
    void db.auth
      .getClaims()
      .then(({ data, error }) => {
        if (stopped || error || !data?.claims?.sub) return;
        channel = db.channel('jarvis-dashboard-' + data.claims.sub);
        // Listen only to invalidation signals, then reload through the server's owner/MFA gate.
        for (const table of [
          'integration_connections',
          'integration_activity',
          'integration_snapshots',
          'monitor_checks',
          'incidents',
          'tasks',
          'projects',
          'job_runs',
          'news_items',
        ])
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter: `user_id=eq.${data.claims.sub}` },
            schedule,
          );
        channel.subscribe((status) => {
          if (stopped) return;
          setState(
            status === 'SUBSCRIBED'
              ? 'Đang nhận cập nhật trực tiếp'
              : 'Đang kết nối lại · đối soát mỗi phút',
          );
          if (status === 'SUBSCRIBED') schedule();
        });
      })
      .catch(() => setState('Chưa kết nối Realtime · đối soát mỗi phút'));
    // Covers missed events, reconnects and installations with Realtime disabled.
    const interval = setInterval(() => void refresh(), 60000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      if (channel) void db.removeChannel(channel);
    };
  }, [enabled]);
  if (!enabled) return null;
  return (
    <p className="live-status" role="status">
      {state}
    </p>
  );
}
