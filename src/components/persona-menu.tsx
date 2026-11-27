'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Command, LogOut, ShieldCheck } from 'lucide-react';
import { logout } from '@/app/actions';
import { dateKey, taskBuckets, visible } from '@/lib/domain';
import type { Section, Snapshot } from '@/lib/types';
import { useDashboardMotion } from './dashboard-motion';

type Entry = { id: Section; label: string; description: string };
const chapters: { label: string; items: Section[] }[] = [
  { label: 'Hằng ngày', items: ['home', 'tasks', 'study', 'gym', 'review'] },
  { label: 'Dự án', items: ['projects', 'configs', 'monitor', 'ai-usage'] },
  { label: 'Không gian', items: ['news', 'vault', 'chat', 'settings'] },
];
function previewFor(section: Section, snapshot: Snapshot) {
  const s = visible(snapshot),
    today = dateKey(),
    buckets = taskBuckets(s.tasks, today);
  const open = s.tasks.filter((t) => t.status !== 'done');
  switch (section) {
    case 'home':
      return {
        value: buckets.today.length,
        label: 'việc nội bộ hôm nay',
        rows: [...buckets.overdue, ...buckets.today].slice(0, 3).map((t) => t.title),
        note: `${buckets.overdue.length} việc quá hạn · ${s.projects.filter((p) => p.status === 'active').length} dự án đang làm`,
      };
    case 'tasks':
      return {
        value: open.length,
        label: 'công việc đang mở',
        rows: open.slice(0, 3).map((t) => t.title),
        note: `${buckets.today.length} đến hạn hôm nay · ${buckets.upcoming.length} sắp tới`,
      };
    case 'projects':
      return {
        value: s.projects.filter((p) => p.status === 'active').length,
        label: 'dự án đang làm',
        rows: s.projects.slice(0, 3).map((p) => p.name),
        note: `${s.projects.length} dự án trong không gian của bạn`,
      };
    case 'study':
      return {
        value: s.vocab_cards.filter((c) => c.due_date <= today).length,
        label: 'thẻ từ đến lịch ôn',
        rows: s.study_logs
          .slice(0, 3)
          .map(
            (l) =>
              `${l.language === 'en' ? 'Tiếng Anh' : 'Tiếng Trung'} · ${l.minutes} phút · ${l.date}`,
          ),
        note: `${s.study_logs.filter((l) => l.date === today).reduce((a, l) => a + l.minutes, 0)} phút học đã ghi hôm nay`,
      };
    case 'gym':
      return {
        value: s.workouts.length,
        label: 'buổi tập đã ghi',
        rows: s.workouts.slice(0, 3).map((w) => `${w.title} · ${w.date}`),
        note: 'Nhật ký vận động theo nhịp của bạn',
      };
    case 'review':
      return {
        value: s.weekly_reviews.length,
        label: 'bản tổng hợp tuần',
        rows: s.weekly_reviews.slice(0, 2).map((r) => `Tuần bắt đầu ${r.week_start}`),
        note: 'Nhìn lại hoạt động, chọn bước tiếp theo',
      };
    case 'configs':
      return {
        value: s.project_configs.length,
        label: 'ghi chú cấu hình',
        rows: s.project_configs.slice(0, 3).map((c) => c.title),
        note: 'Cách chạy, triển khai và xử lý lỗi dự án',
      };
    case 'monitor':
      return {
        value: s.monitors.filter((m) => m.enabled).length,
        label: 'website đang theo dõi',
        rows: s.monitors.slice(0, 3).map((m) => {
          const c = s.monitor_checks.find((c) => c.monitor_id === m.id);
          return `${m.name} · ${!m.enabled ? 'đã tắt' : !c ? 'chưa kiểm tra' : c.ok ? 'lần kiểm tra cuối bình thường' : 'lần kiểm tra cuối có lỗi'}`;
        }),
        note: `${s.incidents.filter((i) => !i.resolved_at).length} sự cố chưa được đánh dấu phục hồi`,
      };
    case 'ai-usage':
      return {
        value:
          '$' +
          s.ai_usage
            .filter((u) => u.date.startsWith(today.slice(0, 7)))
            .reduce((a, u) => a + Number(u.cost_usd), 0)
            .toFixed(2),
        label: 'chi phí AI ghi trong tháng',
        rows: s.ai_usage.slice(0, 3).map((u) => `${u.tool} · ${u.model}`),
        note: 'Đối chiếu chi phí và giới hạn API',
      };
    case 'news':
      return {
        value: s.news_items.filter((n) => !n.read).length,
        label: 'bản tin chưa đọc',
        rows: s.news_items.slice(0, 3).map((n) => n.title),
        note: 'Các nguồn tin bạn đã chọn theo dõi',
      };
    case 'vault':
      return {
        value: s.vault_items.length,
        label: 'mục được mã hóa',
        rows: s.vault_items.slice(0, 3).map((v) => v.label),
        note: 'Mở khóa trong Vault để xem nội dung riêng tư',
      };
    case 'chat':
      return {
        value: 'AI',
        label: 'trợ lý trong không gian của bạn',
        rows: [
          'Hôm nay còn những việc gì?',
          'Website nào cần kiểm tra?',
          'Tóm tắt hoạt động dự án',
        ],
        note: 'Đọc dữ liệu đã kết nối, trả lời kèm nguồn',
      };
    default:
      return {
        value: snapshot.integration_connections.filter((c) => c.enabled).length,
        label: 'nguồn đang bật đồng bộ',
        rows: [
          'Giao diện và âm thanh',
          'Tài khoản và xác thực hai lớp',
          'Dữ liệu, kết nối và lịch sử',
        ],
        note: 'Điều chỉnh không gian theo cách của bạn',
      };
  }
}
export default function PersonaMenu({
  snapshot,
  entries,
  selectedSection,
  mode,
  onOpen,
  onCommands,
  onResume,
  canResume,
}: {
  snapshot: Snapshot;
  entries: Entry[];
  selectedSection: Section;
  mode: 'demo' | 'cloud';
  onOpen: (section: Section, origin?: { x: number; y: number }) => void;
  onCommands: () => void;
  onResume: () => void;
  canResume: boolean;
}) {
  const initialChapter = Math.max(
    0,
    chapters.findIndex((c) => c.items.includes(selectedSection)),
  );
  const [chapter, setChapter] = useState(initialChapter),
    [selected, setSelected] = useState<Section>(selectedSection),
    [opening, setOpening] = useState(false);
  const root = useRef<HTMLElement>(null),
    list = useRef<HTMLElement>(null),
    preview = useRef<HTMLElement>(null);
  const exitAnimation = useRef<Animation | null>(null),
    openingRef = useRef(false);
  const { animate, reduced } = useDashboardMotion();
  const currentChapter = chapters[chapter],
    entry = entries.find((e) => e.id === selected) || entries[0];
  const details = previewFor(entry.id, snapshot),
    previous = useRef(selected);
  function focus(id: Section) {
    setSelected(id);
    list.current
      ?.querySelector<HTMLButtonElement>(`[data-menu-id="${id}"]`)
      ?.focus({ preventScroll: true });
  }
  function changeChapter(index: number) {
    if (openingRef.current) return;
    const n = (index + chapters.length) % chapters.length;
    setChapter(n);
    setSelected(chapters[n].items[0]);
  }
  function open(section: Section, origin?: { x: number; y: number }) {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    if (reduced || !root.current || typeof root.current.animate !== 'function') {
      onOpen(section, origin);
      return;
    }
    const duration = Math.max(
      50,
      Math.min(
        180,
        (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--t-enter')) ||
          450) * 0.22,
      ),
    );
    const a = root.current.animate(
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(-24px)' },
      ],
      { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    );
    exitAnimation.current = a;
    void a.finished.then(
      () => onOpen(section, origin),
      () => {},
    );
  }
  useLayoutEffect(() => {
    if (document.querySelector('.media-entrance[open]')) return;
    return animate(root.current, 'exit');
  }, [animate]);
  useLayoutEffect(() => {
    if (previous.current === selected) return;
    previous.current = selected;
    return animate(preview.current, 'tab');
  }, [selected, animate]);
  useEffect(
    () => () => {
      exitAnimation.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    let frame = 0;
    const focusSelection = () => {
      frame = requestAnimationFrame(() =>
        list.current
          ?.querySelector<HTMLButtonElement>('[tabindex="0"]')
          ?.focus({ preventScroll: true }),
      );
    };
    focusSelection();
    window.addEventListener('jarvis:media-entered', focusSelection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('jarvis:media-entered', focusSelection);
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        openingRef.current ||
        document.querySelector('dialog[open]') ||
        (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')
      )
        return;
      const index = currentChapter.items.indexOf(selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focus(
          currentChapter.items[
            (index + (e.key === 'ArrowDown' ? 1 : -1) + currentChapter.items.length) %
              currentChapter.items.length
          ],
        );
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        changeChapter(chapter + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (
        e.key === 'Enter' &&
        !e.repeat &&
        (list.current?.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        e.preventDefault();
        open(selected);
      } else if (e.key === 'Escape' && canResume) {
        e.preventDefault();
        onResume();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [chapter, selected, currentChapter, reduced, canResume, onResume]);
  return (
    <section className="persona-hub" ref={root} aria-label="Menu chính J.A.R.V.I.S.">
      <div className="hub-diagonal" aria-hidden="true" />
      <div className="hub-watermark" aria-hidden="true">
        YOUR
        <br />
        OWN
        <br />
        PACE.
      </div>
      <header className="hub-header">
        <div className="hub-wordmark">
          J.A.R.V.I.S.<span>PERSONAL SYSTEM / MENU</span>
        </div>
        <div className="hub-header-actions">
          <span className="hub-private">
            <ShieldCheck size={15} />
            Không gian riêng
          </span>
          <button type="button" onClick={onCommands} className="hub-search">
            <Command size={15} />
            Tìm nhanh
          </button>
          {mode === 'cloud' && (
            <form action={logout}>
              <button type="submit" className="hub-search" aria-label="Đăng xuất">
                <LogOut size={16} />
              </button>
            </form>
          )}
        </div>
      </header>
      {mode === 'demo' && (
        <p className="hub-demo">BẢN DÙNG THỬ · Dữ liệu mẫu trên trình duyệt này</p>
      )}
      <div className="hub-stage">
        <div className="hub-menu-column">
          <div className="hub-chapters" role="tablist" aria-label="Nhóm chức năng">
            {chapters.map((c, i) => (
              <button
                type="button"
                role="tab"
                key={c.label}
                aria-selected={chapter === i}
                aria-controls="hub-navigation"
                id={'hub-chapter-' + i}
                disabled={opening}
                onClick={() => changeChapter(i)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <nav
            id="hub-navigation"
            ref={list}
            className="hub-navigation"
            aria-labelledby={'hub-chapter-' + chapter}
          >
            {currentChapter.items.map((id, i) => {
              const item = entries.find((e) => e.id === id)!;
              return (
                <button
                  type="button"
                  key={id}
                  className={selected === id ? 'hub-menu-item selected' : 'hub-menu-item'}
                  tabIndex={selected === id ? 0 : -1}
                  data-menu-id={id}
                  disabled={opening}
                  aria-describedby="hub-preview-description"
                  onFocus={() => setSelected(id)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse' && !openingRef.current) setSelected(id);
                  }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    open(
                      id,
                      e.detail
                        ? { x: e.clientX, y: e.clientY }
                        : { x: r.right, y: r.top + r.height / 2 },
                    );
                  }}
                >
                  <small>{String(i + 1).padStart(2, '0')}</small>
                  <span>{item.label}</span>
                  <ArrowRight size={23} />
                </button>
              );
            })}
          </nav>
          <p className="hub-chapter-position">
            <ChevronLeft size={15} />
            {String(chapter + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}
            <ChevronRight size={15} />
          </p>
        </div>
        <aside
          className="hub-preview"
          id="hub-preview"
          tabIndex={-1}
          ref={preview}
          aria-label="Xem nhanh mục đang chọn"
        >
          <span className="hub-preview-kicker">FOCUS / {entry.label}</span>
          <h1>{details.value}</h1>
          <p className="hub-preview-value-label">{details.label}</p>
          <div className="hub-preview-rule" />
          <h2>{entry.label}</h2>
          <p id="hub-preview-description">{entry.description}</p>
          <ul>
            {details.rows.length ? (
              details.rows.slice(0, 2).map((row, i) => <li key={i}>{row}</li>)
            ) : (
              <li>Chưa có dữ liệu. Mở mục này để bắt đầu.</li>
            )}
          </ul>
          <p className="hub-preview-note">{details.note}</p>
          <button
            type="button"
            className="hub-open"
            disabled={opening}
            onClick={() => open(entry.id)}
          >
            {opening ? 'Đang mở…' : 'Mở ' + entry.label}
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>
      <footer className="hub-footer">
        <span>
          ↑ ↓ CHỌN MỤC <i /> ← → ĐỔI NHÓM <i /> ENTER MỞ
        </span>
        <div>
          {canResume && (
            <button type="button" disabled={opening} onClick={onResume}>
              Tiếp tục module · Esc
            </button>
          )}
          <span>{dateKey()} / UTC+7</span>
        </div>
      </footer>
    </section>
  );
}
