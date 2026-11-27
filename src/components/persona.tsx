'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Snapshot, Section } from '@/lib/types';
import { visible } from '@/lib/domain';
import Modal from './modal';
export function Greeting({
  period,
  day,
  enabled,
  tasks,
}: {
  period: string;
  day: string;
  enabled: boolean;
  tasks: number;
}) {
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false);
  const activeKey = useRef('');
  const reduced = useReducedMotion();
  useEffect(() => {
    const update = () => setEntered(document.body.dataset.mediaEntered === 'true');
    update();
    window.addEventListener('jarvis:media-entered', update);
    return () => window.removeEventListener('jarvis:media-entered', update);
  }, []);
  useEffect(() => {
    if (!enabled || !entered) return;
    const key = `jarvis-greet:${day}:${period}`;
    try {
      if (localStorage.getItem('jarvis-greet-last') === key && activeKey.current !== key) return;
      activeKey.current = key;
      localStorage.setItem('jarvis-greet-last', key);
    } catch {
      return;
    }
    setShown(true);
    const timer = setTimeout(() => setShown(false), 2400);
    const close = () => setShown(false);
    window.addEventListener('keydown', close, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', close);
    };
  }, [period, day, enabled, entered]);
  const labels: Record<string, string> = {
    morning: 'CHÀO BUỔI SÁNG',
    noon: 'MỘT CHÚT NGHỈ TRƯA',
    afternoon: 'CHÀO BUỔI CHIỀU',
    night: 'BUỔI TỐI CỦA BẠN',
  };
  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          className="greeting-overlay"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          onClick={() => setShown(false)}
          aria-label="Đóng lời chào"
        >
          <span>J.A.R.V.I.S. / PERSONAL SYSTEM</span>
          <strong>{labels[period] || 'CHÀO BẠN'}</strong>
          <p>
            {tasks
              ? `${tasks} việc đang chờ. Bắt đầu bằng một bước nhỏ.`
              : 'Một khoảng trống cho điều quan trọng tiếp theo.'}
          </p>
          <small>Bấm phím bất kỳ hoặc chạm để tiếp tục</small>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
export function CallingCard({ message, onClose }: { message: string; onClose: () => void }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(onClose, 2200);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <motion.button
      className="calling-card"
      initial={reduced ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      onClick={onClose}
    >
      <span>PROGRESS, NOT PERFECTION</span>
      <strong>{message}</strong>
      <small>Một bước nữa đã hoàn thành.</small>
    </motion.button>
  );
}
export function SocialStats({ snapshot }: { snapshot: Snapshot }) {
  const s = visible(snapshot),
    knowledge =
      Math.floor(s.study_logs.reduce((a, l) => a + l.minutes, 0) / 10) +
      s.vocab_cards.reduce((a, c) => a + c.repetitions, 0),
    guts = s.workouts.length * 5,
    proficiency = s.tasks.filter((t) => t.status === 'done').length * 3;
  return (
    <section className="social-stats" aria-label="Điểm hoạt động">
      <span>NHỊP TIẾN BỘ</span>
      {[
        ['Knowledge', knowledge],
        ['Guts', guts],
        ['Proficiency', proficiency],
      ].map(([label, n]) => (
        <div key={label}>
          <strong>{n}</strong>
          <small>{label}</small>
        </div>
      ))}
      <p>Điểm chỉ phản ánh hoạt động đã ghi, không đánh giá khả năng của bạn.</p>
    </section>
  );
}
export function Moon({ date }: { date: Date }) {
  const phase =
    ((((date.valueOf() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588853) + 29.530588853) %
    29.530588853;
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return (
    <span title="Pha mặt trăng ước tính" aria-label="Pha mặt trăng ước tính">
      {icons[Math.round((phase / 29.530588853) * 8) % 8]}
    </span>
  );
}
export function CommandPalette({
  snapshot,
  navigate,
  createTask,
  onClose,
}: {
  snapshot: Snapshot;
  navigate: (s: Section) => void;
  createTask: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const s = visible(snapshot);
  const pages: [Section, string][] = [
    ['home', 'Tổng quan'],
    ['projects', 'Dự án'],
    ['tasks', 'Công việc'],
    ['study', 'Học ngoại ngữ'],
    ['gym', 'Gym'],
    ['ai-usage', 'Chi phí AI'],
    ['configs', 'Sổ cấu hình'],
    ['monitor', 'Giám sát website'],
    ['news', 'Tin bảo mật'],
    ['review', 'Review tuần'],
    ['vault', 'Vault'],
    ['chat', 'J.A.R.V.I.S.'],
    ['settings', 'Cài đặt'],
  ];
  const entries = [
    ...pages.map(([section, label]) => ({ label, kind: 'Trang', run: () => navigate(section) })),
    { label: 'Thêm công việc mới', kind: 'Tạo', run: createTask },
    ...s.projects.map((p) => ({ label: p.name, kind: 'Dự án', run: () => navigate('projects') })),
    ...s.tasks.map((t) => ({ label: t.title, kind: 'Công việc', run: () => navigate('tasks') })),
    ...s.project_configs.map((c) => ({
      label: c.title,
      kind: 'Cấu hình',
      run: () => navigate('configs'),
    })),
  ]
    .filter((x) => x.label.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
    .slice(0, 16);
  return (
    <Modal title="Lệnh nhanh" onClose={onClose}>
      <label className="command-search">
        Tìm trang, công việc, dự án
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bạn muốn làm gì?"
        />
      </label>
      <div
        className="command-results"
        onKeyDown={(e) => {
          if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
          e.preventDefault();
          const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[
            (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }}
      >
        {entries.map((entry, i) => (
          <button
            key={i}
            onClick={() => {
              entry.run();
              onClose();
            }}
          >
            <span>{entry.label}</span>
            <small>{entry.kind}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}
export function playSuccess(enabled: boolean) {
  if (!enabled || typeof AudioContext === 'undefined') return;
  try {
    const context = new AudioContext();
    const osc = context.createOscillator(),
      gain = context.createGain();
    gain.gain.value = 0.025;
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.1);
    osc.onended = () => void context.close();
  } catch {
    /* Sound stays optional. */
  }
}
