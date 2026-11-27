'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Film,
  Pause,
  Play,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Sunset,
  MoonStar,
} from 'lucide-react';
import {
  backgroundMedia,
  backgroundPeriod,
  mediaPreferences,
  mediaPreferencesKey,
  type MediaPreferences,
} from '@/lib/background-media';
import { mediaMotion } from '@/lib/theme/motion';
import { dateKey } from '@/lib/domain';
import { useDashboardMotion } from './dashboard-motion';

const greetings = {
  morning: 'CHÀO BUỔI SÁNG',
  noon: 'MỘT CHÚT NGHỈ TRƯA',
  afternoon: 'CHÀO BUỔI CHIỀU',
  night: 'COLOR YOUR NIGHT',
};
export default function BackgroundMedia() {
  const motion = useDashboardMotion();
  const [welcomeFailed, setWelcomeFailed] = useState(false);
  const [sunsetReady, setSunsetReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null),
    gate = useRef<HTMLDialogElement>(null);
  const [entered, setEntered] = useState(false),
    [playing, setPlaying] = useState(false),
    [videoReady, setVideoReady] = useState(false);
  const [period, setPeriod] = useState<keyof typeof greetings>('night');
  const [prefs, setPrefs] = useState<MediaPreferences>(() => mediaPreferences(null));
  const activeBackground = entered ? prefs.background : 'night';
  const prefsRef = useRef(prefs),
    fade = useRef(0),
    playRequest = useRef(0),
    mounted = useRef(false);
  const [message, setMessage] = useState('');
  function save(next: MediaPreferences) {
    prefsRef.current = next;
    setPrefs(next);
    try {
      localStorage.setItem(mediaPreferencesKey, JSON.stringify(next));
    } catch {
      /* Playback still works without storage. */
    }
  }
  function stopFade() {
    cancelAnimationFrame(fade.current);
  }
  function startMusic() {
    const element = audio.current;
    if (!element) return;
    const node: HTMLAudioElement = element;
    stopFade();
    const request = ++playRequest.current;
    try {
      node.volume = 0;
    } catch {
      /* Some mobile browsers control volume at device level. */
    }
    // Called directly inside the user's click/key event, before any awaited work.
    void node
      .play()
      .then(() => {
        if (!mounted.current || playRequest.current !== request) return;
        setMessage('');
        const start = performance.now();
        function tick(now: number) {
          if (!mounted.current || node.paused || playRequest.current !== request) return;
          const fraction = Math.min(1, (now - start) / mediaMotion.audioFadeMs);
          try {
            node.volume = prefsRef.current.volume * fraction;
          } catch {
            /* Device volume is the fallback. */
          }
          if (fraction < 1) fade.current = requestAnimationFrame(tick);
        }
        fade.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (mounted.current && request === playRequest.current) {
          setPlaying(false);
          setMessage('Chưa phát được nhạc. Nhấn nút nhạc để thử lại.');
        }
      });
  }
  function stopMusic() {
    ++playRequest.current;
    stopFade();
    audio.current?.pause();
  }
  function enter(withMusic: boolean) {
    save({ ...prefsRef.current, music: withMusic });
    if (withMusic) startMusic();
    document.body.dataset.mediaEntered = 'true';
    try {
      localStorage.setItem('jarvis-greet-last', `jarvis-greet:${dateKey()}:${backgroundPeriod()}`);
    } catch {
      /* Optional greeting history. */
    }
    window.dispatchEvent(new Event('jarvis:media-entered'));
    setEntered(true);
    gate.current?.close();
    const content =
      document.querySelector<HTMLElement>('.app-shell') ||
      document.querySelector<HTMLElement>('.setup-card');
    motion.animate(content, 'open');
  }
  function toggleMusic() {
    if (!audio.current?.paused) {
      stopMusic();
      save({ ...prefsRef.current, music: false });
    } else {
      save({ ...prefsRef.current, music: true });
      startMusic();
    }
  }
  function toggleMotion() {
    if (prefsRef.current.background === 'sunset') return;
    save({ ...prefsRef.current, motion: !prefsRef.current.motion });
  }
  function switchBackground() {
    save({
      ...prefsRef.current,
      background: prefsRef.current.background === 'night' ? 'sunset' : 'night',
    });
  }
  useEffect(() => {
    mounted.current = true;
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(mediaPreferencesKey) || 'null');
    } catch {
      /* Defaults handle malformed storage. */
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const next = mediaPreferences(saved, reduced.matches, Boolean(connection?.saveData));
    prefsRef.current = next;
    setPrefs(next);
    const updatePeriod = () => setPeriod(backgroundPeriod());
    updatePeriod();
    const timer = setInterval(updatePeriod, 60000);
    const changed = () => {
      if (reduced.matches) save({ ...prefsRef.current, motion: false });
    };
    reduced.addEventListener('change', changed);
    gate.current?.showModal();
    const sound = audio.current,
      picture = video.current;
    return () => {
      mounted.current = false;
      ++playRequest.current;
      cancelAnimationFrame(fade.current);
      sound?.pause();
      picture?.pause();
      clearInterval(timer);
      reduced.removeEventListener('change', changed);
      gate.current?.close();
      delete document.body.dataset.mediaReady;
      delete document.body.dataset.mediaEntered;
    };
  }, []);
  useEffect(() => {
    document.body.dataset.background = activeBackground;
    document.body.dataset.mediaReady = String(
      prefs.background === 'sunset' ? sunsetReady : videoReady,
    );
    return () => {
      delete document.body.dataset.mediaReady;
      delete document.body.dataset.background;
    };
  }, [videoReady, sunsetReady, activeBackground]);
  useEffect(() => {
    if (!entered) return;
    function update() {
      const node = video.current;
      if (!node) return;
      if (prefsRef.current.background !== 'night' || !prefsRef.current.motion || document.hidden)
        node.pause();
      else
        void node.play().catch(() => {
          if (mounted.current) setMessage('Nền đang tạm dừng. Có thể bật lại bằng nút nền động.');
        });
    }
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [entered, prefs.motion, prefs.background]);
  useEffect(() => {
    if (!entered) return;
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]') ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleMusic();
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleMotion();
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [entered]);
  return (
    <>
      <div
        className="background-media"
        data-period={period}
        data-background={activeBackground}
        aria-hidden="true"
      >
        {entered && prefs.background === 'sunset' && (
          <img
            className={sunsetReady ? 'background-sunset ready' : 'background-sunset'}
            src={backgroundMedia.sunset}
            alt=""
            width="736"
            height="414"
            onLoad={() => setSunsetReady(true)}
            onError={() => {
              setSunsetReady(false);
              setMessage('Không tải được ảnh hoàng hôn; đang dùng nền màu dự phòng.');
            }}
          />
        )}
        <video
          ref={video}
          className={videoReady ? 'background-video ready' : 'background-video'}
          src={
            entered && prefs.background === 'night' && (prefs.motion || videoReady)
              ? backgroundMedia.video
              : undefined
          }
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          onLoadedData={() => setVideoReady(true)}
          onError={() => {
            setVideoReady(false);
            setMessage('Không tải được video; đang dùng nền tĩnh.');
          }}
        />
        <div className="background-shade" />
      </div>
      <audio
        ref={audio}
        src={backgroundMedia.audio}
        loop
        preload="none"
        onPlaying={() => setPlaying(true)}
        onWaiting={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setMessage('Không tải được nhạc. Bạn vẫn có thể dùng dashboard.');
        }}
      />
      <dialog
        ref={gate}
        className="media-entrance"
        aria-labelledby="media-welcome"
        onCancel={(e) => {
          e.preventDefault();
          enter(false);
        }}
      >
        {!entered && (
          <div className="welcome-art" aria-hidden="true">
            <img
              src={
                motion.reduced || !prefs.motion || welcomeFailed
                  ? backgroundMedia.welcomeStill
                  : backgroundMedia.welcome
              }
              alt=""
              width="682"
              height="384"
              onError={() => setWelcomeFailed(true)}
            />
            <div className="welcome-art-shade" />
          </div>
        )}
        <div className="media-entrance-copy">
          <span>J.A.R.V.I.S. / PERSONAL SYSTEM</span>
          <h2 id="media-welcome">{greetings[period]}</h2>
          <p>Một khoảng riêng, theo nhịp của bạn.</p>
          <div className="media-entry-actions">
            <button
              autoFocus
              className="button primary"
              onClick={() => enter(prefsRef.current.music)}
            >
              <Play size={18} />
              Nhấn để vào{prefs.music ? ' · có nhạc' : ''}
            </button>
            {prefs.music && (
              <button className="button secondary" onClick={() => enter(false)}>
                Vào không nhạc
              </button>
            )}
            <button type="button" className="button secondary" onClick={motion.openPanel}>
              <SlidersHorizontal size={16} />
              Chỉnh chuyển động
            </button>
          </div>
          <small>
            {backgroundMedia.title} · âm lượng khởi đầu thấp
            <br />
            M: bật/tắt nhạc · B: bật/tắt nền động
          </small>
        </div>
      </dialog>
      {entered && (
        <div className="media-controls" role="group" aria-label="Nhạc và video nền">
          <button
            type="button"
            onClick={toggleMusic}
            aria-pressed={playing}
            aria-label={playing ? 'Tắt nhạc nền (M)' : 'Bật nhạc nền (M)'}
            title={playing ? 'Tắt nhạc · M' : 'Bật nhạc · M'}
          >
            {playing ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <label className="media-volume">
            <span className="sr-only">Âm lượng nhạc nền</span>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={prefs.volume}
              aria-valuetext={`${Math.round(prefs.volume * 100)} phần trăm`}
              onChange={(e) => {
                stopFade();
                const volume = Number(e.target.value);
                save({ ...prefsRef.current, volume });
                if (audio.current) {
                  try {
                    audio.current.volume = volume;
                  } catch {
                    /* Use device volume. */
                  }
                }
              }}
            />
          </label>
          <span className="media-control-divider" />
          <button
            type="button"
            onClick={toggleMotion}
            disabled={prefs.background === 'sunset'}
            aria-pressed={prefs.background === 'night' && prefs.motion}
            aria-label={
              prefs.background === 'sunset'
                ? 'Nền hoàng hôn là ảnh tĩnh'
                : prefs.motion
                  ? 'Tạm dừng nền động (B)'
                  : 'Bật nền động (B)'
            }
            title={
              prefs.background === 'sunset'
                ? 'Nền hoàng hôn là ảnh tĩnh'
                : prefs.motion
                  ? 'Tạm dừng nền · B'
                  : 'Bật nền · B'
            }
          >
            {prefs.background === 'night' && prefs.motion ? (
              <Pause size={17} />
            ) : (
              <Film size={17} />
            )}
          </button>
          <div
            className="media-now-playing"
            aria-label={
              playing
                ? 'Đang phát ' + backgroundMedia.title
                : 'Đã tạm dừng ' + backgroundMedia.title
            }
          >
            <span
              className="record-disc"
              style={{ animationPlayState: playing ? 'running' : 'paused' }}
              aria-hidden="true"
            >
              <img src={backgroundMedia.disc} alt="" width="48" height="48" />
            </span>
            <span className="media-track" title={backgroundMedia.title}>
              {backgroundMedia.title}
            </span>
          </div>
          <button
            type="button"
            onClick={motion.openPanel}
            aria-label="Chỉnh chuyển động (T)"
            title="Chỉnh chuyển động · T"
          >
            <SlidersHorizontal size={17} />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.background === 'sunset'}
            aria-label="Nền hoàng hôn"
            title={
              prefs.background === 'sunset' ? 'Chuyển sang nền đêm' : 'Chuyển sang nền hoàng hôn'
            }
            onClick={switchBackground}
          >
            {prefs.background === 'sunset' ? <Sunset size={18} /> : <MoonStar size={18} />}
          </button>
        </div>
      )}
      {message && (
        <p className="media-message" role="status">
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Đóng thông báo media">
            ×
          </button>
        </p>
      )}
    </>
  );
}
