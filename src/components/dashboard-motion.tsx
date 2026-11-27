'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { RotateCcw, Copy, Play } from 'lucide-react';
import Modal from './modal';
import {
  mediaMotion,
  motionDefaults,
  motionLabels,
  motionRanges,
  motionStorageKey,
  readMotionTimings,
  type MotionKind,
  type MotionTimings,
} from '@/lib/theme/motion';

type Origin = { x: number; y: number };
type MotionContextValue = {
  reduced: boolean;
  openPanel: () => void;
  animate: (target: HTMLElement | null, kind: MotionKind, origin?: Origin) => () => void;
};
const MotionContext = createContext<MotionContextValue | null>(null);
export function useDashboardMotion() {
  const context = useContext(MotionContext);
  if (!context) throw new Error('Motion provider missing');
  return context;
}
export default function DashboardMotion({ children }: { children: ReactNode }) {
  const [timings, setTimings] = useState<MotionTimings>(motionDefaults),
    [reduced, setReduced] = useState(true),
    [open, setOpen] = useState(false),
    [copied, setCopied] = useState('');
  const current = useRef({ timings, reduced }),
    animations = useRef(new Set<Animation>()),
    byTarget = useRef(new WeakMap<HTMLElement, Animation>());
  const preview = useRef<HTMLDivElement>(null),
    [previewKind, setPreviewKind] = useState<MotionKind>('enter');
  const currentPreview = useRef<() => void>(() => {});
  const openPanel = useCallback(() => setOpen(true), []);
  current.current = { timings, reduced };
  function save(next: MotionTimings) {
    const value = readMotionTimings(next);
    setTimings(value);
    try {
      localStorage.setItem(motionStorageKey, JSON.stringify(value));
    } catch {
      /* Still applies this session. */
    }
  }
  useEffect(() => {
    try {
      setTimings(readMotionTimings(JSON.parse(localStorage.getItem(motionStorageKey) || 'null')));
    } catch {
      /* Use defaults. */
    }
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      setReduced(query.matches);
      if (query.matches) for (const animation of animations.current) animation.cancel();
    };
    change();
    query.addEventListener('change', change);
    const active = animations.current;
    return () => {
      query.removeEventListener('change', change);
      for (const animation of active) animation.cancel();
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    for (const key of Object.keys(timings) as MotionKind[])
      root.style.setProperty('--t-' + key, `${reduced ? 120 : timings[key]}ms`);
    root.style.setProperty('--motion-ease', mediaMotion.easing);
    root.dataset.reducedMotion = String(reduced);
  }, [timings, reduced]);
  const animate = useCallback((target: HTMLElement | null, kind: MotionKind, origin?: Origin) => {
    if (!target) return () => {};
    byTarget.current.get(target)?.cancel();
    if (current.current.reduced || typeof target.animate !== 'function') return () => {};
    const r = target.getBoundingClientRect(),
      x = origin ? Math.max(0, Math.min(r.width, origin.x - r.left)) : Math.min(80, r.width / 2),
      y = origin ? Math.max(0, Math.min(r.height, origin.y - r.top)) : Math.min(100, r.height / 2);
    const radius = Math.ceil(Math.hypot(r.width, r.height));
    const frames: Keyframe[] =
      kind === 'open' || kind === 'enter'
        ? [
            { clipPath: `circle(0px at ${x}px ${y}px)`, opacity: 0.4 },
            { clipPath: `circle(${radius}px at ${x}px ${y}px)`, opacity: 1 },
          ]
        : kind === 'tab'
          ? [
              {
                opacity: 0.3,
                transform: 'translateX(10px)',
                clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)',
              },
              {
                opacity: 1,
                transform: 'translateX(0)',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
              },
            ]
          : [
              { opacity: 0, transform: 'translateX(-12px)' },
              { opacity: 1, transform: 'translateX(0)' },
            ];
    const animation = target.animate(frames, {
      duration: current.current.timings[kind],
      easing: mediaMotion.easing,
    });
    byTarget.current.set(target, animation);
    animations.current.add(animation);
    void animation.finished.then(
      () => animations.current.delete(animation),
      () => animations.current.delete(animation),
    );
    return () => animation.cancel();
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key.toLowerCase() !== 't' ||
        e.repeat ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]') ||
        document.querySelector('dialog[open]')
      )
        return;
      e.preventDefault();
      setOpen((value) => !value);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => () => currentPreview.current(), []);
  const contextValue = useMemo(
    () => ({ reduced, animate, openPanel }),
    [reduced, animate, openPanel],
  );
  return (
    <MotionContext.Provider value={contextValue}>
      {children}
      {open && (
        <Modal
          title="Chỉnh chuyển động"
          onClose={() => {
            currentPreview.current();
            setOpen(false);
            setCopied('');
          }}
        >
          <div className="motion-tuner">
            <p>Thời lượng áp dụng ngay cho menu, đổi tab và mở module. Lưu trên trình duyệt này.</p>
            {reduced && (
              <p role="status">
                Thiết bị đang bật giảm chuyển động: hiệu ứng quét và xoay được tắt.
              </p>
            )}
            {(Object.keys(motionDefaults) as MotionKind[]).map((key) => (
              <label key={key}>
                <span>{motionLabels[key]}</span>
                <input
                  type="range"
                  min={motionRanges[key][0]}
                  max={motionRanges[key][1]}
                  step="10"
                  value={timings[key]}
                  onChange={(e) => save({ ...timings, [key]: Number(e.target.value) })}
                />
                <output>{timings[key]} ms</output>
              </label>
            ))}
            <div className="motion-preview" aria-label="Xem thử chuyển động">
              <div ref={preview}>
                <span>J.A.R.V.I.S. / MOTION</span>
                <strong>{motionLabels[previewKind]}</strong>
                <p>Chọn một hiệu ứng để xem thử.</p>
              </div>
            </div>
            <div className="button-row">
              {(['open', 'enter', 'tab', 'exit'] as MotionKind[]).map((kind) => (
                <button
                  type="button"
                  className="button secondary small"
                  key={kind}
                  onClick={() => {
                    setPreviewKind(kind);
                    currentPreview.current = animate(preview.current, kind);
                  }}
                >
                  <Play size={14} />
                  {motionLabels[kind]}
                </button>
              ))}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  save({ ...motionDefaults });
                  setCopied('Đã đặt lại mặc định.');
                }}
              >
                <RotateCcw size={16} />
                Đặt lại
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(timings, null, 2));
                    setCopied('Đã sao chép thông số.');
                  } catch {
                    setCopied(
                      'Không truy cập được clipboard. Các thông số vẫn hiển thị trên bảng.',
                    );
                  }
                }}
              >
                <Copy size={16} />
                Sao chép thông số
              </button>
            </div>
            <p role="status">{copied}</p>
          </div>
        </Modal>
      )}
    </MotionContext.Provider>
  );
}
