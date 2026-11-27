export const mediaMotion = {
  audioFadeMs: 1500,
  backdropMs: 500,
  controlMs: 120,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export const motionDefaults = { hover: 120, tab: 170, enter: 450, open: 500, exit: 300 };
export type MotionKind = keyof typeof motionDefaults;
export type MotionTimings = Record<MotionKind, number>;
export const motionLabels: Record<MotionKind, string> = {
  hover: 'Hover / con trỏ',
  tab: 'Đổi tab',
  enter: 'Vào module',
  open: 'Mở dashboard',
  exit: 'Quay lại',
};
export const motionRanges: Record<MotionKind, readonly [number, number]> = {
  hover: [40, 300],
  tab: [80, 400],
  enter: [200, 900],
  open: [200, 900],
  exit: [100, 600],
};
export const motionStorageKey = 'jarvis-motion-v1';
export function readMotionTimings(input: unknown): MotionTimings {
  const value = input && typeof input === 'object' ? (input as Partial<MotionTimings>) : {};
  return Object.fromEntries(
    (Object.keys(motionDefaults) as MotionKind[]).map((key) => {
      const v = value[key],
        [min, max] = motionRanges[key];
      return [
        key,
        typeof v === 'number' && Number.isFinite(v)
          ? Math.max(min, Math.min(max, Math.round(v / 10) * 10))
          : motionDefaults[key],
      ];
    }),
  ) as MotionTimings;
}
