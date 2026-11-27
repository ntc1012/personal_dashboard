'use client';
import { useState } from 'react';
import { ExternalLink, RefreshCw, PlugZap } from 'lucide-react';
import type { Snapshot } from '@/lib/types';
import {
  providerLabels,
  connectionStale,
  connectedOverview,
  type ConnectedItem,
} from '@/lib/integration-model';
import { dateKey } from '@/lib/domain';
import { setIntegrationEnabled, triggerJob } from '@/app/module-actions';
import Modal from './modal';

const statuses = {
  pending: 'Chờ đồng bộ',
  syncing: 'Đang đồng bộ',
  ready: 'Đã đồng bộ',
  error: 'Cần kiểm tra',
};
function stamp(s: string | null) {
  return s
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(s))
    : 'Chưa có lần đồng bộ thành công';
}
function link(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export default function ConnectedDashboard({
  snapshot,
  mode,
  view = 'home',
  onRefresh,
  notify,
}: {
  snapshot: Snapshot;
  mode: 'cloud' | 'demo';
  view?: 'home' | 'settings' | 'tasks' | 'projects';
  onRefresh: () => Promise<void>;
  notify?: (s: string, error?: boolean) => void;
}) {
  const connections = snapshot.integration_connections || [],
    items = snapshot.connected_items || [];
  const overview = connectedOverview(connections, items),
    today = dateKey();
  const [working, setWorking] = useState(false),
    [confirm, setConfirm] = useState<{ id: string; enabled: boolean; name: string } | null>(null);
  const [selected, setSelected] = useState('all');
  const [page, setPage] = useState(0);
  const source = (i: ConnectedItem) => connections.find((c) => c.id === i.connection_id);
  const label = (id: string) => {
    const c = connections.find((c) => c.id === id);
    return c
      ? `${providerLabels[c.provider]}${c.project_id ? ' · ' + (snapshot.projects.find((p) => p.id === c.project_id)?.name || 'Dự án') : ''}`
      : 'Nguồn';
  };
  const taskRows = overview.active.filter(
    (i) =>
      ['task', 'issue', 'pull_request'].includes(i.kind) && !['done', 'closed'].includes(i.status),
  );
  const due = taskRows.filter((i) => i.due_date && i.due_date <= today);
  const events = overview.active
    .filter(
      (i) =>
        i.kind === 'event' &&
        i.starts_at &&
        (i.all_day ? (i.ends_at || '') > today : Date.parse(i.ends_at || i.starts_at) > Date.now()),
    )
    .sort(
      (a, b) =>
        Date.parse((a.starts_at || '') + (a.all_day ? 'T00:00:00+07:00' : '')) -
        Date.parse((b.starts_at || '') + (b.all_day ? 'T00:00:00+07:00' : '')),
    );
  const filtered = items.filter((i) => selected === 'all' || i.connection_id === selected);
  const listed = filtered.filter((i) =>
    view === 'tasks'
      ? ['task', 'issue', 'pull_request'].includes(i.kind)
      : ['deployment', 'workflow'].includes(i.kind),
  );
  const lastPage = Math.max(0, Math.ceil(listed.length / 40) - 1),
    currentPage = Math.min(page, lastPage);
  const row = (i: ConnectedItem) => {
    const c = source(i),
      href = link(i.url);
    return (
      <div className="connected-row" key={i.id}>
        <div>
          <strong>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {i.title}
                <ExternalLink size={13} />
              </a>
            ) : (
              i.title
            )}
          </strong>
          <p>
            {label(i.connection_id)} · {i.status}
            {i.due_date ? ' · Hạn ' + i.due_date : ''}
          </p>
          {i.starts_at && (
            <p>
              {i.all_day ? `${i.starts_at} · Cả ngày` : stamp(i.starts_at)}
              {i.ends_at && !i.all_day ? ' – ' + stamp(i.ends_at) : ''}
            </p>
          )}
          <small>
            {c && !c.enabled ? 'Đã tạm dừng · ' : c && connectionStale(c) ? 'Dữ liệu cũ · ' : ''}Cập
            nhật {stamp(i.checked_at)}
          </small>
        </div>
      </div>
    );
  };
  async function sync() {
    setWorking(true);
    try {
      const r = await triggerJob('integrations');
      notify?.(r.ok ? r.value : r.error, !r.ok);
      await onRefresh();
    } catch {
      notify?.('Không tải được trạng thái kết nối.', true);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="connected-space" aria-label="Dữ liệu từ dịch vụ đã kết nối">
      <div className="module-toolbar">
        <div>
          <h2>
            <PlugZap size={20} />{' '}
            {view === 'settings'
              ? 'Trung tâm kết nối'
              : view === 'tasks'
                ? 'Công việc từ dịch vụ'
                : view === 'projects'
                  ? 'Dự án đang vận hành'
                  : 'Dữ liệu đang kết nối'}
          </h2>
          <p className="muted">Đọc từ nguồn gốc · cập nhật theo sự kiện hoặc lịch đồng bộ.</p>
        </div>
        {view === 'settings' && (
          <button className="button secondary" onClick={sync} disabled={working || mode === 'demo'}>
            <RefreshCw size={16} />
            {working ? 'Đang đồng bộ…' : 'Đồng bộ các nguồn'}
          </button>
        )}
      </div>
      {!connections.length ? (
        <div className="panel module-panel">
          <p>Chưa có nguồn dữ liệu được kết nối.</p>
          <p>
            Thêm GitHub URL hoặc Vercel Project ID vào dự án, cấu hình khóa server rồi chạy đồng bộ.
            Google Calendar và Todoist xuất hiện khi có cấu hình tương ứng.
          </p>
        </div>
      ) : (
        <>
          {view === 'settings' && (
            <div className="connected-grid">
              {connections.map((c) => (
                <article className="panel module-panel" key={c.id}>
                  <h3>{label(c.id)}</h3>
                  <p>
                    {!c.enabled ? 'Đã tạm dừng' : statuses[c.status]}
                    {connectionStale(c) ? ' · Dữ liệu chưa mới' : ''}
                  </p>
                  <p>Lần thành công: {stamp(c.last_success_at)}</p>
                  <p>
                    Sự kiện gần nhất:{' '}
                    {c.last_event_at ? stamp(c.last_event_at) : 'Chưa nhận webhook'}
                  </p>
                  {c.error && (
                    <p role="alert" className="error">
                      {c.error}
                    </p>
                  )}
                  <button
                    className="button secondary small"
                    disabled={mode === 'demo' || working}
                    onClick={() => setConfirm({ id: c.id, enabled: !c.enabled, name: label(c.id) })}
                  >
                    {c.enabled ? 'Tạm dừng' : 'Bật đồng bộ'}
                  </button>
                </article>
              ))}
            </div>
          )}
          {view === 'home' && (
            <div className="connected-grid">
              <article className="panel module-panel">
                <h3>Cần chú ý</h3>
                {overview.failed.map(row)}
                {connections
                  .filter((c) => c.enabled && (c.status === 'error' || connectionStale(c)))
                  .map((c) => (
                    <p key={c.id}>
                      {label(c.id)} · {c.error || 'Chưa có dữ liệu mới; kiểm tra lịch đồng bộ.'}
                    </p>
                  ))}
                {!overview.failed.length &&
                  !connections.some(
                    (c) => c.enabled && (c.status === 'error' || connectionStale(c)),
                  ) && <p>Chưa thấy lỗi trong dữ liệu đã đồng bộ.</p>}
                {snapshot.incidents
                  .filter((i) => !i.resolved_at)
                  .slice(0, 5)
                  .map((i) => (
                    <p key={i.id}>
                      Monitor ·{' '}
                      {snapshot.monitors.find((m) => m.id === i.monitor_id)?.name || 'Website'} ·{' '}
                      {i.reason}
                    </p>
                  ))}
              </article>
              <article className="panel module-panel">
                <h3>Lịch sắp tới</h3>
                {events.slice(0, 5).map(row)}
                {!events.length && <p>Chưa có lịch sắp tới trong nguồn đã đồng bộ.</p>}
              </article>
              <article className="panel module-panel">
                <h3>Việc đến hạn từ dịch vụ</h3>
                {due.slice(0, 6).map(row)}
                {!due.length && <p>Chưa có việc đến hạn trong nguồn đã đồng bộ.</p>}
              </article>
              <article className="panel module-panel">
                <h3>Hoạt động mới</h3>
                {(snapshot.integration_activity || []).slice(0, 8).map((a) => (
                  <div className="connected-row" key={a.id}>
                    <div>
                      {link(a.url) ? (
                        <a href={link(a.url)} target="_blank" rel="noopener noreferrer">
                          {a.title}
                        </a>
                      ) : (
                        <strong>{a.title}</strong>
                      )}
                      <p>
                        {label(a.connection_id)} · {stamp(a.happened_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {!snapshot.integration_activity?.length && (
                  <p>Chưa nhận sự kiện. Đồng bộ định kỳ vẫn cập nhật dữ liệu nguồn.</p>
                )}
              </article>
            </div>
          )}
          {(view === 'tasks' || view === 'projects') && (
            <article className="panel module-panel">
              <label>
                Nguồn{' '}
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">Tất cả</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {label(c.id)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Mở liên kết để xử lý tại dịch vụ gốc. Các mục này không tạo thêm task nội bộ.
              </p>
              {listed.slice(currentPage * 40, (currentPage + 1) * 40).map(row)}
              {listed.length > 40 && (
                <div className="button-row">
                  <button
                    className="button secondary small"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Trang trước
                  </button>
                  <span>
                    Trang {currentPage + 1}/{lastPage + 1} · {listed.length} mục
                  </span>
                  <button
                    className="button secondary small"
                    disabled={currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              )}
              {!listed.length && <p>Chưa có dữ liệu cho nguồn này.</p>}
            </article>
          )}
        </>
      )}
      {confirm && (
        <Modal
          title={confirm.enabled ? 'Bật đồng bộ?' : 'Tạm dừng đồng bộ?'}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.name}.{' '}
            {confirm.enabled
              ? 'Dịch vụ sẽ được đọc lại ở lượt đồng bộ tiếp theo.'
              : 'Hệ thống ngừng nhận và lấy dữ liệu mới; dữ liệu lần cuối vẫn được giữ.'}
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(null)}>
              Hủy
            </button>
            <button
              className="button primary"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  const r = await setIntegrationEnabled(confirm.id, confirm.enabled);
                  notify?.(r.ok ? r.value : r.error, !r.ok);
                  if (r.ok) {
                    setConfirm(null);
                    await onRefresh();
                  }
                } catch {
                  notify?.('Không đổi được trạng thái.', true);
                } finally {
                  setWorking(false);
                }
              }}
            >
              Xác nhận
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
