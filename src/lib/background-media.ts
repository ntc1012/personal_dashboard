export const backgroundMedia = {
  welcome: '/media/welcome-makoto-14dd9c7ed0d9.mp4',
  welcomeStill: '/media/welcome-dive-still.png',
  disc: '/media/color-your-night-disc.jpg',
  sunset: '/media/sunset-train-eccc4e895c21.png',
  video: '/media/color-your-night-55e3ce1e6324.mp4',
  audio: '/media/color-your-night-3461b3e453d8.mp3',
  title: 'Color Your Night',
} as const;
export type MediaPreferences = {
  music: boolean;
  motion: boolean;
  volume: number;
  background: 'night' | 'sunset';
};
export const mediaPreferencesKey = 'jarvis-background-media-v1';
export function mediaPreferences(
  value: unknown,
  reduceMotion = false,
  saveData = false,
): MediaPreferences {
  const p = value && typeof value === 'object' ? (value as Partial<MediaPreferences>) : {};
  return {
    background: p.background === 'sunset' ? 'sunset' : 'night',
    music: typeof p.music === 'boolean' ? p.music : true,
    motion: typeof p.motion === 'boolean' ? p.motion : !reduceMotion && !saveData,
    volume:
      typeof p.volume === 'number' && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(0.5, p.volume))
        : 0.15,
  };
}
export function backgroundPeriod(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Bangkok',
    }).format(date),
  );
  return hour >= 5 && hour < 11
    ? 'morning'
    : hour < 14 && hour >= 11
      ? 'noon'
      : hour >= 14 && hour < 18
        ? 'afternoon'
        : 'night';
}
