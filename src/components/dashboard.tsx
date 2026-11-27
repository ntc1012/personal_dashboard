'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Dumbbell,
  ChartNoAxesCombined,
  Newspaper,
  CalendarDays,
  LockKeyhole,
  Archive,
  ArrowUpRight,
  Bot,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { loadSnapshot, logout, mutate, undoChange } from '@/app/actions';
import { batchMutate, restoreBackup } from '@/app/module-actions';
import { planBackupRestore } from '@/lib/backup';
import BackupRestore from './backup-restore';
import { dateKey, taskBuckets, visible } from '@/lib/domain';
import { demoMutate, demoUndo, labels, type DemoState } from '@/lib/demo';
import { blankModules } from '@/lib/modules';
import ModuleDashboard from './module-dashboard';
import AssistantChat from './assistant-chat';
import { Greeting, CallingCard, CommandPalette, SocialStats, Moon, playSuccess } from './persona';
import type {
  Change,
  Entity,
  CoreEntity,
  Mutation,
  Project,
  ProjectConfig,
  Section,
  Snapshot,
  Task,
} from '@/lib/types';
import Editor from './editor';
import Modal from './modal';
import MfaSettings from './mfa-settings';
import DeadlineSummary from './deadline-summary';
import LiveUpdates from './live-updates';
import ConnectedDashboard from './connected-dashboard';
import { useDashboardMotion } from './dashboard-motion';

const navigation = [
  { id: 'home', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'projects', label: 'Dự án', icon: FolderKanban },
  { id: 'tasks', label: 'Công việc', icon: CheckSquare },
  { id: 'study', label: 'Ngoại ngữ', icon: BookOpen },
  { id: 'gym', label: 'Gym', icon: Dumbbell },
  { id: 'ai-usage', label: 'Chi phí AI', icon: ChartNoAxesCombined },
  { id: 'configs', label: 'Sổ cấu hình', icon: Code2 },
  { id: 'monitor', label: 'Giám sát web', icon: Activity },
  { id: 'news', label: 'Tin bảo mật', icon: Newspaper },
  { id: 'review', label: 'Review tuần', icon: CalendarDays },
  { id: 'vault', label: 'Vault', icon: LockKeyhole },
  { id: 'chat', label: 'J.A.R.V.I.S.', icon: Bot },
  { id: 'settings', label: 'Cài đặt', icon: Settings2 },
] as const;
const groups = { personal: 'Cá nhân', school: 'Học tập', work: 'Công việc' };
const priorities = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
const sectionTitles: Record<Section, string> = {
  study: 'Mỗi ngày, thêm một chút.',
  gym: 'Ghi lại những buổi vận động.',
  'ai-usage': 'Hiểu chi phí. Giữ giới hạn.',
  vault: 'Không gian mã hóa của bạn.',
  monitor: 'Biết trạng thái, biết thời điểm.',
  news: 'Tin mới, đúng điều cần theo dõi.',
  review: 'Nhìn lại để bước tiếp.',
  home: 'Không gian của bạn.',
  projects: 'Những điều đang xây.',
  tasks: 'Từng việc, từng bước.',
  configs: 'Nhớ một lần. Dùng mãi.',
  chat: 'Một trợ lý, luôn ở đây.',
  settings: 'Theo cách của bạn.',
};
const sectionDescriptions: Record<Section, string> = {
  study: 'Tiếng Anh và tiếng Trung: nhật ký, từ vựng và ôn tập ngắt quãng.',
  gym: 'Một nhật ký tập luyện nhanh, theo nhịp của riêng bạn.',
  'ai-usage': 'Chi phí thực ghi, token và ngân sách API.',
  vault: 'Mã hóa trên thiết bị; khóa và plaintext không gửi tới chatbot.',
  monitor: 'Kiểm tra website, lịch sử và sự cố theo thời gian.',
  news: 'RSS / Atom, lọc từ khóa, chống trùng và đánh dấu đã đọc.',
  review: 'Số liệu hoạt động và ba gợi ý cho tuần sau.',
  home: 'Một chút rõ ràng, cho một ngày tập trung hơn.',
  projects: 'Từ ý tưởng đầu tiên đến lần triển khai tiếp theo.',
  tasks: 'Giữ điều quan trọng ở trước mắt.',
  configs: 'Cách chạy dự án, triển khai và những bài học đã có.',
  chat: 'Tra cứu dữ liệu và thêm công việc trong không gian của bạn.',
  settings: 'Giao diện, dữ liệu và lịch sử thay đổi.',
};
const STORAGE = 'jarvis-demo-v1';
type EditorState = { entity: CoreEntity; record?: Project | Task | ProjectConfig };

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function shortDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(value + 'T12:00:00+07:00'))
    : 'Chưa đặt ngày';
}
function emptyState(title: string, description: string) {
  return (
    <div className="empty-state">
      <Sparkles size={27} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export default function Dashboard({
  initial,
  mode,
  initialSection = 'home',
}: {
  initial: Snapshot;
  mode: 'demo' | 'cloud';
  initialSection?: Section;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const { animate: animateMotion } = useDashboardMotion();
  const contentMotionRef = useRef<HTMLElement>(null);
  const navigationOrigin = useRef<{ x: number; y: number } | undefined>(undefined);
  const previousSection = useRef(initialSection);
  const refreshSequence = useRef(0);
  const demoRef = useRef<DemoState>({ snapshot: initial, events: [] });
  const [section, setSection] = useState<Section>(initialSection);
  const [query, setQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState('open');
  const [taskProject, setTaskProject] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [archiving, setArchiving] = useState<{
    entity: Entity;
    record: Project | Task | ProjectConfig;
  } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean; changeId?: string } | null>(
    null,
  );
  const [now, setNow] = useState<Date | null>(null);
  const [theme, setTheme] = useState('auto');
  const searchRef = useRef<HTMLInputElement>(null);
  const [chatSeed, setChatSeed] = useState('');
  const [commands, setCommands] = useState(false);
  const [celebration, setCelebration] = useState('');
  const [ready, setReady] = useState(mode === 'cloud');
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    try {
      const savedTheme = localStorage.getItem('jarvis-theme');
      if (savedTheme && ['auto', 'dark', 'light'].includes(savedTheme)) setTheme(savedTheme);
      if (mode === 'demo') {
        const raw = localStorage.getItem(STORAGE);
        if (raw) {
          const stored = JSON.parse(raw);
          if (
            stored?.snapshot &&
            ['projects', 'tasks', 'project_configs', 'changes'].every((k) =>
              Array.isArray(stored.snapshot[k]),
            ) &&
            Array.isArray(stored.events)
          ) {
            stored.snapshot = { ...initial, ...stored.snapshot };
            demoRef.current = stored;
            setSnapshot(stored.snapshot);
          }
        }
      }
    } catch {
      setNotice({
        text: 'Không đọc được dữ liệu trên trình duyệt. Phiên này dùng dữ liệu tạm.',
        error: true,
      });
    }
    setReady(true);
    const keyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommands(true);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', keyboard);
    };
  }, [mode]);

  useEffect(() => {
    function popped() {
      const part = window.location.pathname.split('/').filter(Boolean);
      const next = (part[0] === 'demo' ? part[1] : part[0]) || 'home';
      if (navigation.some((n) => n.id === next)) setSection(next as Section);
    }
    window.addEventListener('popstate', popped);
    return () => window.removeEventListener('popstate', popped);
  }, []);
  const data = visible(snapshot);
  const today = dateKey(now || new Date(initial.projects[0]?.created_at || '2026-11-27T00:00:00Z'));
  const hour = now ? now.getHours() : 12;
  const period =
    hour >= 5 && hour < 11
      ? 'morning'
      : hour >= 11 && hour < 14
        ? 'noon'
        : hour >= 14 && hour < 18
          ? 'afternoon'
          : 'night';
  useEffect(() => {
    document.documentElement.dataset.period = period;
  }, [period]);
  useEffect(() => {
    if (snapshot.settings[0]?.theme) setTheme(snapshot.settings[0].theme);
  }, [snapshot.settings[0]?.theme]);
  const chosenTheme = theme;
  const light =
    chosenTheme === 'light' ||
    (chosenTheme === 'auto' && (period === 'morning' || period === 'noon'));
  const buckets = taskBuckets(data.tasks, today);
  const done = data.tasks.filter((t) => t.status === 'done').length;
  const completion = data.tasks.length ? Math.round((done / data.tasks.length) * 100) : 0;
  const q = query.trim().toLocaleLowerCase('vi');
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((x) => x?.toLocaleLowerCase('vi').includes(q));
  const projects = data.projects.filter(
    (p) =>
      matches(p.name, p.stack, p.notes) &&
      (projectFilter === 'all' || p.category === projectFilter),
  );
  const tasks = data.tasks.filter(
    (t) =>
      (taskProject === 'all' || t.project_id === taskProject) &&
      matches(t.title, t.notes, data.projects.find((p) => p.id === t.project_id)?.name) &&
      (taskFilter === 'all' ||
        (taskFilter === 'open' && t.status === 'todo') ||
        (taskFilter === 'done' && t.status === 'done') ||
        (taskFilter === 'today' && t.due_date === today) ||
        (taskFilter === 'upcoming' && !!t.due_date && t.due_date > today && t.status === 'todo') ||
        (taskFilter === 'overdue' && !!t.due_date && t.due_date < today && t.status === 'todo')),
  );
  const configs = data.project_configs.filter((c) =>
    matches(
      c.title,
      c.run_steps,
      c.deploy_steps,
      c.troubleshooting,
      c.runtime,
      data.projects.find((p) => p.id === c.project_id)?.name,
    ),
  );
  function go(next: Section, origin?: { x: number; y: number }) {
    navigationOrigin.current = origin;
    const path =
      mode === 'demo'
        ? next === 'home'
          ? '/demo'
          : '/demo/' + next
        : next === 'home'
          ? '/'
          : '/' + next;
    window.history.pushState({}, '', path);
    setSection(next);
    setQuery('');
    setMobileOpen(false);
  }
  useLayoutEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    return animateMotion(
      contentMotionRef.current,
      section === 'home' ? 'exit' : 'enter',
      navigationOrigin.current,
    );
  }, [section, animateMotion]);
  const previousFilter = useRef(taskFilter);
  useLayoutEffect(() => {
    if (previousFilter.current === taskFilter) return;
    previousFilter.current = taskFilter;
    return animateMotion(
      contentMotionRef.current?.querySelector<HTMLElement>('.task-list') || null,
      'tab',
    );
  }, [taskFilter, animateMotion]);
  function persist(next: DemoState) {
    demoRef.current = next;
    setSnapshot(next.snapshot);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }
  async function refresh() {
    if (mode === 'demo') return;
    const sequence = ++refreshSequence.current;
    const r = await loadSnapshot();
    if (!r.ok) throw new Error(r.error);
    if (sequence === refreshSequence.current) setSnapshot(r.value);
  }
  async function restoreFromFile(file: unknown) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === 'demo') {
        const plan = planBackupRestore(file, demoRef.current.snapshot);
        if (!persist(plan.operations.reduce((state, m) => demoMutate(state, m), demoRef.current)))
          throw new Error('Browser storage unavailable');
      } else {
        const result = await restoreBackup(file);
        if (!result.ok) throw new Error(result.error);
        await refresh();
      }
      setNotice({ text: 'Đã khôi phục các bản ghi mới.' });
      return true;
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Không khôi phục được.', error: true });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function batchSave(operations: Mutation[]): Promise<boolean> {
    if (busyRef.current || !ready) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === 'demo') {
        const next = operations.reduce((state, m) => demoMutate(state, m), demoRef.current);
        if (!persist(next))
          throw new Error('Thay đổi chỉ lưu trong phiên; trình duyệt không ghi được dữ liệu.');
      } else {
        const result = await batchMutate(operations);
        if (!result.ok) throw new Error(result.error);
        await refresh();
      }
      setNotice({ text: 'Đã lưu ' + operations.length + ' thay đổi; hoàn tác trong lịch sử.' });
      return true;
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : 'Không lưu được lô dữ liệu.',
        error: true,
      });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save(m: Mutation): Promise<boolean> {
    if (busyRef.current || !ready) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      let change: Change;
      let persisted = true;
      if (mode === 'demo') {
        const next = demoMutate(demoRef.current, m);
        persisted = persist(next);
        change = next.snapshot.changes[0];
      } else {
        const r = await mutate(m);
        if (!r.ok) throw new Error(r.error);
        change = r.value;
        try {
          await refresh();
        } catch {
          setNotice({
            text: 'Đã lưu nhưng chưa tải lại được dữ liệu. Hãy tải lại trang trước khi sửa tiếp.',
            error: true,
          });
          return true;
        }
      }
      setNotice({
        text: persisted
          ? `${m.action === 'create' ? 'Đã thêm' : m.action === 'archive' ? 'Đã lưu trữ' : 'Đã cập nhật'} ${labels[m.entity]}.`
          : 'Đã thay đổi trong phiên này; trình duyệt không lưu được dữ liệu.',
        error: !persisted,
        changeId: change.id,
      });
      if (m.entity === 'tasks' && m.data.status === 'done') {
        setCelebration('HOÀN THÀNH');
        playSuccess(data.settings[0]?.sound || false);
      }
      return true;
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Không lưu được dữ liệu.', error: true });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function undo(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === 'demo') {
        if (!persist(demoUndo(demoRef.current, id)))
          throw new Error('Đã hoàn tác trong phiên này nhưng chưa lưu được trên trình duyệt.');
      } else {
        const r = await undoChange(id);
        if (!r.ok) throw new Error(r.error);
        await refresh();
      }
      setNotice({ text: 'Đã hoàn tác thay đổi.' });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'Không thể hoàn tác.', error: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { format: 'jarvis-export-v1', exported_at: new Date().toISOString(), data: snapshot },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: 'Đã xuất dữ liệu JSON. Giữ tệp ở nơi riêng tư.' });
  }
  function changeTheme(value: string) {
    setTheme(value);
    try {
      localStorage.setItem('jarvis-theme', value);
    } catch {
      setNotice({ text: 'Giao diện đã đổi cho phiên này; chưa lưu được lựa chọn.', error: true });
    }
  }
  function TaskRow({ task }: { task: Task }) {
    const project = data.projects.find((p) => p.id === task.project_id);
    const overdue = task.status === 'todo' && task.due_date && task.due_date < today;
    return (
      <div className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}>
        <button
          className="task-check"
          disabled={busy}
          onClick={() =>
            save({
              entity: 'tasks',
              action: 'update',
              id: task.id,
              expectedVersion: task.version,
              data: { status: task.status === 'done' ? 'todo' : 'done' },
            })
          }
          aria-label={task.status === 'done' ? `Mở lại ${task.title}` : `Hoàn thành ${task.title}`}
        >
          {task.status === 'done' ? <Check size={15} /> : null}
        </button>
        <button className="task-main" onClick={() => setEditor({ entity: 'tasks', record: task })}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {project?.name || 'Cá nhân'}
            <span>·</span>
            <span className={overdue ? 'overdue' : ''}>
              {task.due_date === today ? 'Hôm nay' : shortDate(task.due_date)}
            </span>
          </span>
        </button>
        <span className={`priority ${task.priority}`}>{priorities[task.priority]}</span>
        <button
          className="icon-button archive-action"
          aria-label={`Lưu trữ ${task.title}`}
          onClick={() => setArchiving({ entity: 'tasks', record: task })}
        >
          <Archive size={16} />
        </button>
      </div>
    );
  }
  function ProjectCard({ project }: { project: Project }) {
    const count = data.tasks.filter((t) => t.project_id === project.id);
    const completed = count.filter((t) => t.status === 'done').length;
    return (
      <article className="project-card">
        <div className="project-top">
          <span className={`project-symbol ${project.category}`}>
            <FolderKanban size={23} />
          </span>
          <span className={`project-status ${project.status}`}>
            {project.status === 'active'
              ? 'Đang làm'
              : project.status === 'paused'
                ? 'Tạm dừng'
                : 'Hoàn thành'}
          </span>
          <button
            className="icon-button"
            aria-label={`Lưu trữ ${project.name}`}
            onClick={() => setArchiving({ entity: 'projects', record: project })}
          >
            <Archive size={15} />
          </button>
        </div>
        <button
          className="project-name"
          onClick={() => setEditor({ entity: 'projects', record: project })}
        >
          {project.name}
        </button>
        <p>{project.notes || 'Một không gian cho ý tưởng tiếp theo.'}</p>
        <div className="stack">{project.stack || groups[project.category]}</div>
        <div className="progress-track">
          <span style={{ width: `${count.length ? (completed / count.length) * 100 : 0}%` }} />
        </div>
        <div className="project-footer">
          <span>
            {completed}/{count.length} công việc
          </span>
          <div>
            {safeUrl(project.repo_url) && (
              <a
                href={safeUrl(project.repo_url)!}
                target="_blank"
                rel="noreferrer"
                aria-label={`Repository ${project.name}`}
              >
                <Code2 size={17} />
              </a>
            )}
            {safeUrl(project.prod_url) && (
              <a
                href={safeUrl(project.prod_url)!}
                target="_blank"
                rel="noreferrer"
                aria-label={`Mở ${project.name}`}
              >
                <ExternalLink size={17} />
              </a>
            )}
            <button
              aria-label={`Sửa ${project.name}`}
              className="icon-button"
              onClick={() => setEditor({ entity: 'projects', record: project })}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <div className={`app-shell ${light ? 'light' : 'dark'}`} data-period={period}>
      <a href="#main-content" className="skip-link sr-only focus:not-sr-only">
        Bỏ qua menu, tới nội dung
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <button className="brand" onClick={() => go('home')} aria-label="J.A.R.V.I.S. Tổng quan">
          <span className="brand-mark">
            J<span>/</span>
          </span>
          <span>
            J.A.R.V.I.S.<small>PERSONAL SYSTEM</small>
          </span>
        </button>
        <div className="sidebar-caption">KHÔNG GIAN LÀM VIỆC</div>
        <nav
          aria-label="Điều hướng chính"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMobileOpen(false);
              return;
            }
            if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
            e.preventDefault();
            const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
            const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[
              (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus();
          }}
        >
          {navigation.map((n) => (
            <button
              key={n.id}
              className={section === n.id ? 'nav-item selected' : 'nav-item'}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                go(
                  n.id,
                  event.detail
                    ? { x: event.clientX, y: event.clientY }
                    : { x: bounds.right, y: bounds.top + bounds.height / 2 },
                );
              }}
              aria-current={section === n.id ? 'page' : undefined}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === 'tasks' && (
                <span className="nav-count">
                  {data.tasks.filter((t) => t.status === 'todo').length}
                </span>
              )}
              {n.id === 'chat' && <span className="tiny-tag">BETA</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-note">
            <span className="focus-star">✳</span>
            <p>
              Từng bước nhỏ.
              <br />
              <strong>Những điều lớn hơn.</strong>
            </p>
          </div>
          <div className="profile">
            <div className="avatar">ME</div>
            <div>
              <strong>Không gian cá nhân</strong>
              <small>{mode === 'demo' ? 'Bản dùng thử trên máy' : 'Tài khoản riêng tư'}</small>
            </div>
            {mode === 'cloud' && (
              <form action={logout}>
                <button className="icon-button" aria-label="Đăng xuất">
                  <LogOut size={17} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Không gian cá nhân</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === section)?.label}</strong>
          </div>
          <div className="topbar-tools">
            <label className="search-box">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Tìm kiếm"
                placeholder="Tìm trong không gian…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            {now && (
              <span className="clock-label">
                <Moon date={now} />
                {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
                  now,
                )}
              </span>
            )}
            <span className="private-label">
              <ShieldCheck size={15} /> Riêng tư
            </span>
          </div>
        </header>
        <main className="content" id="main-content" ref={contentMotionRef}>
          {mode === 'demo' && (
            <div className="demo-banner">
              <span>
                <span className="status-dot" /> BẢN DÙNG THỬ{' '}
                <span className="demo-explanation">
                  · Dữ liệu mẫu, lưu riêng trên trình duyệt này.
                </span>
              </span>
              <button onClick={() => go('settings')}>
                Quản lý dữ liệu <ChevronRight size={14} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {section === 'home'
                  ? hour < 12
                    ? 'CHÀO BUỔI SÁNG'
                    : hour < 18
                      ? 'CHÀO BUỔI CHIỀU'
                      : 'CHÀO BUỔI TỐI'
                  : 'J.A.R.V.I.S. / ' +
                    navigation.find((n) => n.id === section)?.label.toLocaleUpperCase('vi')}
              </span>
              <h1>{sectionTitles[section]}</h1>
              <p>{sectionDescriptions[section]}</p>
            </div>
            {['home', 'projects', 'tasks', 'configs'].includes(section) && (
              <button
                className="button primary"
                disabled={!ready}
                onClick={() =>
                  setEditor({
                    entity:
                      section === 'projects'
                        ? 'projects'
                        : section === 'configs'
                          ? 'project_configs'
                          : 'tasks',
                  })
                }
              >
                <Plus size={18} />
                {section === 'projects'
                  ? 'Thêm dự án'
                  : section === 'configs'
                    ? 'Thêm cấu hình'
                    : 'Thêm công việc'}
              </button>
            )}
          </div>
          {query && (
            <div className="search-result-info">
              Đang lọc theo “{query}” <button onClick={() => setQuery('')}>Xóa tìm kiếm</button>
            </div>
          )}
          <LiveUpdates enabled={mode === 'cloud'} onRefresh={refresh} />
          {(['home', 'projects', 'tasks', 'settings'] as string[]).includes(section) && (
            <ConnectedDashboard
              snapshot={snapshot}
              mode={mode}
              view={section as 'home' | 'projects' | 'tasks' | 'settings'}
              onRefresh={refresh}
              notify={(text, error) => setNotice({ text, error })}
            />
          )}
          {section === 'home' && (
            <>
              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Sun size={15} />{' '}
                    {now
                      ? new Intl.DateTimeFormat('vi-VN', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          timeZone: 'Asia/Bangkok',
                        }).format(now)
                      : 'NGÀY MỚI CỦA BẠN'}
                  </span>
                  <h2>
                    Một ngày mới.
                    <br />
                    Một bước tiến mới<span>.</span>
                  </h2>
                  <p>
                    {buckets.today.length
                      ? `Có ${buckets.today.length} việc đang chờ bạn hôm nay. Bắt đầu từ một việc nhỏ nhé.`
                      : 'Chọn một việc quan trọng và dành sự tập trung cho nó.'}
                  </p>
                  <button
                    className="button hero-button"
                    onClick={() => {
                      go('tasks');
                      setTaskFilter('today');
                    }}
                  >
                    Xem việc hôm nay <ChevronRight size={17} />
                  </button>
                </div>
                <div className="hero-orbit" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="orbit-core">
                    <span>FOCUS</span>
                    <strong>{String(buckets.today.length).padStart(2, '0')}</strong>
                    <span>VIỆC HÔM NAY</span>
                  </div>
                  <span className="orbit-label top">MAKE ROOM FOR WHAT MATTERS</span>
                  <span className="orbit-label bottom">ONE THING AT A TIME</span>
                  <span className="orbit-cross">+</span>
                </div>
              </section>
              <DeadlineSummary snapshot={snapshot} />
              <section className="stats-grid" aria-label="Thống kê">
                <button className="stat-card" onClick={() => go('projects')}>
                  <span className="stat-icon cyan">
                    <FolderKanban size={19} />
                  </span>
                  <div>
                    <span>Dự án đang làm</span>
                    <strong>
                      {String(data.projects.filter((p) => p.status === 'active').length).padStart(
                        2,
                        '0',
                      )}
                    </strong>
                  </div>
                  <small>Đang phát triển</small>
                </button>
                <button
                  className="stat-card"
                  onClick={() => {
                    go('tasks');
                    setTaskFilter('today');
                  }}
                >
                  <span className="stat-icon purple">
                    <CheckSquare size={19} />
                  </span>
                  <div>
                    <span>Đến hạn hôm nay</span>
                    <strong>{String(buckets.today.length).padStart(2, '0')}</strong>
                  </div>
                  <small>Việc chưa hoàn thành</small>
                </button>
                <button
                  className="stat-card"
                  onClick={() => {
                    go('tasks');
                    setTaskFilter('overdue');
                  }}
                >
                  <span className="stat-icon orange">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <span>Cần chú ý</span>
                    <strong>{String(buckets.overdue.length).padStart(2, '0')}</strong>
                  </div>
                  <small>Công việc quá hạn</small>
                </button>
                <button
                  className="stat-card"
                  onClick={() => {
                    go('tasks');
                    setTaskFilter('done');
                  }}
                >
                  <span className="stat-icon green">
                    <CheckCheck size={19} />
                  </span>
                  <div>
                    <span>Đã hoàn thành</span>
                    <strong>{String(done).padStart(2, '0')}</strong>
                  </div>
                  <small>{completion}% tổng công việc</small>
                </button>
              </section>
              <div className="home-columns">
                <section className="panel today-panel">
                  <div className="panel-heading">
                    <h2>
                      <span className="heading-line" /> Việc cần tập trung{' '}
                      <span className="count-badge">
                        {buckets.today.length + buckets.overdue.length}
                      </span>
                    </h2>
                    <button className="text-button" onClick={() => go('tasks')}>
                      Tất cả <ChevronRight size={15} />
                    </button>
                  </div>
                  {[...buckets.overdue, ...buckets.today]
                    .filter((t) => matches(t.title))
                    .slice(0, 5)
                    .map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  {![...buckets.overdue, ...buckets.today].filter((t) => matches(t.title)).length &&
                    emptyState(
                      'Một khoảng trống để bắt đầu',
                      'Chưa có việc đến hạn. Thêm công việc và chọn ngày bạn muốn làm.',
                    )}
                  <button
                    className="add-inline"
                    disabled={!ready}
                    onClick={() => setEditor({ entity: 'tasks' })}
                  >
                    <Plus size={16} /> Thêm một việc cần làm
                  </button>
                </section>
                <section className="assistant-card">
                  <div className="assistant-card-head">
                    <span className="assistant-emblem">
                      <Bot size={25} />
                    </span>
                    <span className="tiny-tag">TRỢ LÝ CÁ NHÂN</span>
                  </div>
                  <h2>
                    Mọi thứ đã ở đây.
                    <br />
                    Cứ hỏi mình.
                  </h2>
                  <p>Tra cứu nhanh những điều trong không gian của bạn.</p>
                  <button
                    className="prompt-link"
                    onClick={() => {
                      go('chat');
                      setChatSeed('Hôm nay còn gì?');
                    }}
                  >
                    Hôm nay còn gì? <ChevronRight size={16} />
                  </button>
                  <button
                    className="prompt-link"
                    onClick={() => {
                      go('chat');
                      setChatSeed('Có những dự án nào?');
                    }}
                  >
                    Có những dự án nào? <ChevronRight size={16} />
                  </button>
                  <div className="assistant-footnote">
                    <Circle size={7} fill="currentColor" /> Đọc dữ liệu · Ghi có hoàn tác
                  </div>
                </section>
              </div>
              <section className="projects-preview">
                <div className="panel-heading">
                  <h2>
                    <span className="heading-line" /> Dự án của bạn
                  </h2>
                  <button className="text-button" onClick={() => go('projects')}>
                    Xem tất cả <ChevronRight size={15} />
                  </button>
                </div>
                <div className="project-grid">
                  {projects.slice(0, 3).map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                  {!projects.length &&
                    emptyState(
                      'Ý tưởng tiếp theo là gì?',
                      'Thêm dự án đầu tiên để gom công việc và đường dẫn vào một nơi.',
                    )}
                </div>
              </section>
            </>
          )}
          {section === 'projects' && (
            <>
              <div className="filter-bar">
                {[
                  ['all', 'Tất cả'],
                  ['personal', 'Cá nhân'],
                  ['school', 'Học tập'],
                  ['work', 'Công việc'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={projectFilter === id ? 'filter active' : 'filter'}
                    onClick={() => setProjectFilter(id)}
                  >
                    {label}
                  </button>
                ))}
                <span className="result-count">{projects.length} dự án</span>
              </div>
              <div className="project-grid full">
                {projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
                {!projects.length &&
                  emptyState('Chưa có dự án phù hợp', 'Thử bộ lọc khác hoặc thêm một dự án mới.')}
              </div>
            </>
          )}
          {section === 'tasks' && (
            <>
              <div className="filter-bar">
                <select
                  className="task-project-filter"
                  aria-label="Lọc công việc theo dự án"
                  value={taskProject}
                  onChange={(e) => setTaskProject(e.target.value)}
                >
                  <option value="all">Mọi dự án</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {[
                  ['open', 'Đang mở'],
                  ['today', 'Hôm nay'],
                  ['upcoming', 'Sắp tới'],
                  ['overdue', 'Quá hạn'],
                  ['done', 'Đã xong'],
                  ['all', 'Tất cả'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={taskFilter === id ? 'filter active' : 'filter'}
                    onClick={() => setTaskFilter(id)}
                  >
                    {label}
                  </button>
                ))}
                <span className="result-count">{tasks.length} công việc</span>
              </div>
              <section className="panel task-list">
                {tasks
                  .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                {!tasks.length &&
                  emptyState(
                    'Bạn đã có thêm khoảng trống',
                    'Chưa có công việc trong danh sách này. Thử bộ lọc khác hoặc tạo công việc mới.',
                  )}
              </section>
            </>
          )}
          {section === 'configs' && (
            <div className="config-list">
              {configs.map((c) => (
                <article className="panel config-card" key={c.id}>
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">
                        {data.projects.find((p) => p.id === c.project_id)?.name}
                      </span>
                      <h2>{c.title}</h2>
                    </div>
                    <div className="config-actions">
                      <button
                        className="button secondary"
                        onClick={() => setEditor({ entity: 'project_configs', record: c })}
                      >
                        Chỉnh sửa
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Lưu trữ ${c.title}`}
                        onClick={() => setArchiving({ entity: 'project_configs', record: c })}
                      >
                        <Archive size={18} />
                      </button>
                    </div>
                  </div>
                  {c.runtime && <span className="runtime-tag">{c.runtime}</span>}
                  <div className="config-columns">
                    <div>
                      <h3>Chạy local</h3>
                      <pre>{c.run_steps || 'Chưa thêm hướng dẫn.'}</pre>
                      <h3>Triển khai</h3>
                      <p className="pre-wrap">{c.deploy_steps || 'Chưa thêm hướng dẫn.'}</p>
                    </div>
                    <div>
                      <h3>Tên biến môi trường</h3>
                      <pre>{c.env_var_names || 'Chưa khai báo.'}</pre>
                      <h3>Lỗi & cách sửa</h3>
                      <p className="pre-wrap">{c.troubleshooting || 'Chưa có ghi chú.'}</p>
                    </div>
                  </div>
                </article>
              ))}
              {!configs.length &&
                emptyState(
                  'Để lần sau không phải tìm lại',
                  'Thêm cách chạy, cách deploy và những lỗi đã sửa cho từng dự án.',
                )}
            </div>
          )}
          {section === 'chat' && (
            <AssistantChat
              key={chatSeed}
              initialPrompt={chatSeed}
              snapshot={snapshot}
              mode={mode}
              onBatch={batchSave}
              onRefresh={refresh}
              onUndo={undo}
            />
          )}
          {section === 'settings' && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <h2>
                  <Sun size={20} /> Giao diện
                </h2>
                <p>Chọn không gian phù hợp với bạn.</p>
                <div className="theme-options">
                  {[
                    ['auto', 'Theo buổi'],
                    ['dark', 'Tối'],
                    ['light', 'Sáng'],
                  ].map(([id, label]) => (
                    <button
                      className={theme === id ? 'theme-option active' : 'theme-option'}
                      key={id}
                      onClick={() => changeTheme(id)}
                    >
                      <span className={`theme-swatch ${id}`} />
                      {label}
                      {theme === id && <Check size={15} />}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Múi giờ: Asia/Bangkok (UTC+7). Lựa chọn giao diện lưu riêng trên trình duyệt.
                </p>
              </section>
              <section className="panel settings-card">
                <h2>
                  <Download size={20} /> Dữ liệu của bạn
                </h2>
                <p>
                  {mode === 'demo'
                    ? 'Dữ liệu mẫu và thay đổi chỉ nằm trên trình duyệt này. Không đồng bộ giữa các thiết bị.'
                    : 'Dữ liệu lưu trong Supabase của tài khoản đã đăng nhập.'}
                </p>
                <button className="button secondary" onClick={exportData}>
                  <Download size={16} /> Xuất dữ liệu JSON
                </button>
                <p className="hint">
                  Bản xuất dành cho dữ liệu ứng dụng. Sao lưu và khôi phục database theo README.
                </p>
                <div className="connection-label">
                  <span className="status-dot" />
                  {mode === 'demo' ? 'Chế độ dùng thử' : 'Đã kết nối Supabase'}
                </div>
              </section>
              {mode === 'cloud' && <MfaSettings />}
              <section className="panel settings-card">
                <h2>Khôi phục JSON</h2>
                <p>Nhập bản sao ứng dụng sau khi xem trước. Dữ liệu hiện có được giữ nguyên.</p>
                <BackupRestore
                  snapshot={snapshot}
                  onRestore={restoreFromFile}
                  notify={(text, error) => setNotice({ text, error })}
                />
              </section>
              <section className="panel settings-card history-card">
                <h2>
                  <Activity size={20} /> Lịch sử thay đổi
                </h2>
                <p>Hoàn tác khả dụng khi bản ghi chưa có thay đổi mới hơn.</p>
                {snapshot.changes.slice(0, 30).map((c) => (
                  <div className="history-row" key={c.id}>
                    <div>
                      <strong>
                        {c.action === 'create'
                          ? 'Thêm'
                          : c.action === 'archive'
                            ? 'Lưu trữ'
                            : 'Sửa'}{' '}
                        {labels[c.entity]}
                      </strong>
                      <small>
                        {new Intl.DateTimeFormat('vi-VN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'Asia/Bangkok',
                        }).format(new Date(c.created_at))}
                        {c.undone_at ? ' · Đã hoàn tác' : ''}
                      </small>
                    </div>
                    <button
                      className="button secondary small"
                      disabled={
                        busy ||
                        !!c.undone_at ||
                        snapshot[c.entity].find((r) => r.id === c.record_id)?.version !==
                          c.after_version
                      }
                      onClick={() => undo(c.id)}
                    >
                      <Undo2 size={14} /> Hoàn tác
                    </button>
                  </div>
                ))}
                {!snapshot.changes.length && (
                  <p className="hint">Các thao tác lưu dữ liệu sẽ xuất hiện tại đây.</p>
                )}
              </section>
            </div>
          )}
          {['study', 'gym', 'ai-usage', 'vault', 'monitor', 'news', 'review', 'settings'].includes(
            section,
          ) && (
            <ModuleDashboard
              section={section}
              snapshot={snapshot}
              mode={mode}
              query={query}
              onSave={save}
              onBatch={batchSave}
              onRefresh={refresh}
              notify={(text, error) => setNotice({ text, error })}
            />
          )}
          {section === 'home' && <SocialStats snapshot={snapshot} />}
          <footer className="page-footer">
            <span>
              J.A.R.V.I.S. <span className="footer-divider">/</span> MỘT KHÔNG GIAN. NHIỀU KHẢ NĂNG.
            </span>
            <span>
              {now
                ? new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Bangkok',
                  }).format(now)
                : '—'}{' '}
              <span className="footer-divider">·</span> UTC+7
            </span>
          </footer>
        </main>
      </div>
      {now && (
        <Greeting
          period={period}
          day={today}
          enabled={data.settings[0]?.greeting ?? true}
          tasks={buckets.today.length}
        />
      )}
      {celebration && <CallingCard message={celebration} onClose={() => setCelebration('')} />}
      {commands && (
        <CommandPalette
          snapshot={snapshot}
          navigate={go}
          createTask={() => setEditor({ entity: 'tasks' })}
          onClose={() => setCommands(false)}
        />
      )}
      {editor && (
        <Editor
          entity={editor.entity}
          record={editor.record}
          data={data}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {archiving && (
        <Modal
          title="Lưu trữ mục này?"
          onClose={() => {
            if (!busy) setArchiving(null);
          }}
        >
          <p>
            Mục sẽ ẩn khỏi danh sách. Bạn có thể hoàn tác trong lịch sử nếu chưa có thay đổi liên
            quan.
          </p>
          <p className="confirm-name">
            {'name' in archiving.record ? archiving.record.name : archiving.record.title}
          </p>
          <div className="form-footer">
            <button className="button secondary" disabled={busy} onClick={() => setArchiving(null)}>
              Giữ lại
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await save({
                    entity: archiving.entity,
                    action: 'archive',
                    id: archiving.record.id,
                    expectedVersion: archiving.record.version,
                    data: {},
                  })
                )
                  setArchiving(null);
              }}
            >
              Lưu trữ
            </button>
          </div>
        </Modal>
      )}
      {notice && (
        <div
          className={`toast ${notice.error ? 'error-toast' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.error ? <Circle size={18} /> : <Check size={18} />}</span>
          <p>{notice.text}</p>
          {notice.changeId && (
            <button disabled={busy} onClick={() => undo(notice.changeId!)}>
              <Undo2 size={15} /> Hoàn tác
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Đóng thông báo"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
