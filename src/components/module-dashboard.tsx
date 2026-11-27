'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  Download,
  Dumbbell,
  ExternalLink,
  Plus,
  RefreshCw,
  Settings2,
  Volume2,
} from 'lucide-react';
import Papa from 'papaparse';
import {
  extraSchemas,
  moduleLabels,
  type ExtraEntity,
  type ModuleRecord,
  type VocabCard,
  type Workout,
} from '@/lib/modules';
import { visible, dateKey } from '@/lib/domain';
import { addDays, parseVocabCsv, reviewCard, studyStreak, weekStart } from '@/lib/learning';
import { buildWeeklyReview } from '@/lib/review';
import type { Mutation, Snapshot, Section, RecordBase } from '@/lib/types';
import { triggerJob, connectionStatus } from '@/app/module-actions';
import ModuleForm from './module-form';
import WorkoutForm from './workout-form';
import VaultPanel from './vault-panel';
import Modal from './modal';
type Props = {
  section: Section;
  snapshot: Snapshot;
  mode: 'demo' | 'cloud';
  query: string;
  onSave: (m: Mutation) => Promise<boolean>;
  onBatch: (m: Mutation[]) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
};
function download(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Heatmap({ dates }: { dates: string[] }) {
  const today = dateKey(),
    counts = new Map<string, number>();
  dates.forEach((d) => counts.set(d, (counts.get(d) || 0) + 1));
  return (
    <div className="heatmap" aria-label="Lịch hoạt động 12 tuần">
      {Array.from({ length: 84 }, (_, i) => {
        const date = addDays(today, i - 83),
          n = counts.get(date) || 0;
        return (
          <span
            key={date}
            className={n ? 'heat-cell filled' : 'heat-cell'}
            style={n ? { opacity: Math.min(1, 0.4 + n * 0.2) } : undefined}
            title={`${date}: ${n} hoạt động`}
            aria-label={`${date}: ${n} hoạt động`}
          />
        );
      })}
    </div>
  );
}
function weeklyStreak(dates: string[]) {
  const weeks = new Set(dates.map((d) => weekStart(d)));
  let cursor = weeks.has(weekStart()) ? weekStart() : addDays(weekStart(), -7),
    count = 0;
  while (weeks.has(cursor)) {
    count++;
    cursor = addDays(cursor, -7);
  }
  return count;
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel module-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function MoneyChart({ usage }: { usage: Snapshot['ai_usage'] }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(dateKey(), i - 13));
  const values = days.map((d) =>
    usage.filter((u) => u.date === d).reduce((a, u) => a + Number(u.cost_usd), 0),
  );
  const max = Math.max(0.0001, ...values);
  return (
    <div className="cost-chart" role="img" aria-label="Chi phí AI 14 ngày gần nhất">
      {days.map((d, i) => (
        <div className="chart-column" key={d} title={`${d}: $${values[i].toFixed(6)}`}>
          <span style={{ height: `${Math.max(2, (values[i] / max) * 100)}%` }} />
          <small>{d.slice(8)}</small>
        </div>
      ))}
    </div>
  );
}
export default function ModuleDashboard({
  section,
  snapshot,
  mode,
  query,
  onSave,
  onBatch,
  onRefresh,
  notify,
}: Props) {
  const s = visible(snapshot),
    today = dateKey();
  const [form, setForm] = useState<{
      entity: ExtraEntity;
      record?: ModuleRecord;
      defaults?: Record<string, unknown>;
    } | null>(null),
    [workout, setWorkout] = useState<{ record?: Workout; copy?: Workout } | null>(null),
    [archive, setArchive] = useState<{ entity: ExtraEntity; record: ModuleRecord } | null>(null),
    [language, setLanguage] = useState<'en' | 'zh'>('en'),
    [revealed, setRevealed] = useState(false),
    [working, setWorking] = useState(false),
    [lookupTerm, setLookupTerm] = useState(''),
    [definition, setDefinition] = useState(''),
    [connections, setConnections] = useState<Record<string, boolean>>({}),
    [newsFilter, setNewsFilter] = useState('unread');
  const importCards = useRef<HTMLInputElement>(null),
    importUsage = useRef<HTMLInputElement>(null);
  const match = (...values: string[]) =>
    !query || values.join(' ').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'));
  useEffect(() => {
    if (section === 'settings' && mode === 'cloud')
      connectionStatus()
        .then((r) => {
          if (r.ok) setConnections(r.value);
        })
        .catch(() => {});
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    };
  }, [section, mode]);
  useEffect(() => {
    setRevealed(false);
  }, [language]);
  async function job(kind: 'monitor' | 'news' | 'daily' | 'weekly') {
    if (working) return;
    if (mode === 'demo') {
      notify(
        'Job ngoài chạy ở chế độ cloud sau khi cấu hình khóa server; bản dùng thử không gọi dịch vụ.',
        true,
      );
      return;
    }
    setWorking(true);
    try {
      const r = await triggerJob(kind);
      if (!r.ok) throw new Error(r.error);
      notify(r.value);
      await onRefresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Job thất bại.', true);
    } finally {
      setWorking(false);
    }
  }
  function Actions({ entity, row }: { entity: ExtraEntity; row: ModuleRecord }) {
    return (
      <div className="row-actions">
        <button
          className="button secondary small"
          onClick={() =>
            entity === 'workouts'
              ? setWorkout({ record: row as Workout })
              : setForm({ entity, record: row })
          }
        >
          Sửa
        </button>
        <button
          className="icon-button"
          aria-label={`Lưu trữ ${moduleLabels[entity]}`}
          onClick={() => setArchive({ entity, record: row })}
        >
          <Archive size={16} />
        </button>
      </div>
    );
  }
  async function fileCards(file: File) {
    try {
      if (file.size > 500000) throw new Error('CSV tối đa 500 KB.');
      const cards = parseVocabCsv(await file.text(), language, today);
      const known = new Set(
        s.vocab_cards
          .filter((c) => c.language === language)
          .map((c) => c.front.toLocaleLowerCase()),
      );
      const fresh = cards.filter((c) => !known.has(c.front.toLocaleLowerCase()));
      if (!fresh.length) {
        notify('Không có thẻ mới; các từ trùng được giữ nguyên.');
        return;
      }
      await onBatch(
        fresh.map((data) => ({
          entity: 'vocab_cards',
          action: 'create',
          id: crypto.randomUUID(),
          data,
        })),
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không nhập được CSV.', true);
    } finally {
      if (importCards.current) importCards.current.value = '';
    }
  }
  async function fileUsage(file: File) {
    try {
      if (file.size > 500000) throw new Error('CSV tối đa 500 KB.');
      const p = Papa.parse<Record<string, string>>(await file.text(), {
        header: true,
        skipEmptyLines: 'greedy',
      });
      if (p.errors.length || p.data.length > 200)
        throw new Error('CSV không hợp lệ hoặc vượt 200 dòng.');
      const ops = p.data.map((row) => ({
        entity: 'ai_usage' as const,
        action: 'create' as const,
        id: crypto.randomUUID(),
        data: extraSchemas.ai_usage.parse({
          date: row.date,
          tool: row.tool,
          model: row.model || '',
          cost_usd: Number(row.cost_usd || 0),
          input_tokens: Number(row.input_tokens || 0),
          output_tokens: Number(row.output_tokens || 0),
          notes: row.notes || '',
          source: 'manual',
        }),
      }));
      await onBatch(ops);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không nhập được usage CSV.', true);
    } finally {
      if (importUsage.current) importUsage.current.value = '';
    }
  }
  async function lookup() {
    setWorking(true);
    try {
      const res = await fetch(
        `/api/dictionary?language=${language}&term=${encodeURIComponent(lookupTerm)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không tra được từ.');
      setDefinition(data.definitions.join('\n'));
    } catch (e) {
      setDefinition(e instanceof Error ? e.message : 'Không tra được từ.');
    } finally {
      setWorking(false);
    }
  }
  const learning = s.study_logs.filter((l) => l.language === language),
    cards = s.vocab_cards.filter((c) => c.language === language),
    due = cards.filter((c) => c.due_date <= today),
    card = due[0];
  const month = today.slice(0, 7),
    usage = s.ai_usage.filter((u) => u.date.startsWith(month)),
    total = usage.reduce((a, u) => a + Number(u.cost_usd), 0),
    settings = s.settings[0];
  return (
    <>
      {section === 'study' && (
        <>
          <div className="module-toolbar">
            <div className="filter-bar">
              {[
                ['en', 'Tiếng Anh'],
                ['zh', 'Tiếng Trung'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={language === id ? 'filter active' : 'filter'}
                  onClick={() => setLanguage(id as 'en' | 'zh')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => setForm({ entity: 'study_logs', defaults: { language } })}
              >
                <Plus size={16} /> Ghi phút học
              </button>
              <button
                className="button secondary"
                onClick={() => setForm({ entity: 'vocab_cards', defaults: { language } })}
              >
                Thêm từ
              </button>
              <button className="button secondary" onClick={() => importCards.current?.click()}>
                Nhập CSV
              </button>
            </div>
          </div>
          <input
            hidden
            ref={importCards}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fileCards(f);
            }}
          />
          <div className="module-stats">
            <Stat
              label="Chuỗi ngày học"
              value={`${studyStreak(learning.map((l) => l.date))} ngày`}
            />
            <Stat
              label="Học hôm nay"
              value={`${learning.filter((l) => l.date === today).reduce((a, l) => a + l.minutes, 0)} phút`}
            />
            <Stat label="Thẻ đến lượt ôn" value={due.length} />
            <Stat label="Tổng từ vựng" value={cards.length} />
          </div>
          <div className="module-columns">
            <section className="panel module-panel">
              <div className="module-toolbar">
                <h2>
                  <BookOpen size={20} /> Ôn tập SM-2
                </h2>
                <span>{due.length} thẻ còn lại</span>
              </div>
              {card ? (
                <div className="flashcard">
                  <span className="eyebrow">{language === 'en' ? 'ENGLISH' : '中文'}</span>
                  <h3>{card.front}</h3>
                  <p>{card.phonetic}</p>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (typeof speechSynthesis === 'undefined') {
                          notify('Trình duyệt không hỗ trợ phát âm.', true);
                          return;
                        }
                        speechSynthesis.cancel();
                        const u = new SpeechSynthesisUtterance(card.front);
                        u.lang = language === 'en' ? 'en-US' : 'zh-CN';
                        speechSynthesis.speak(u);
                      }}
                    >
                      <Volume2 size={17} /> Phát âm
                    </button>
                    <button className="button secondary" onClick={() => setRevealed(!revealed)}>
                      {revealed ? 'Ẩn đáp án' : 'Hiện đáp án'}
                    </button>
                  </div>
                  {revealed && (
                    <>
                      <h4>{card.back}</h4>
                      <p>{card.example}</p>
                      <div className="rating-buttons">
                        {[
                          [0, 'Quên'],
                          [3, 'Khó'],
                          [4, 'Nhớ'],
                          [5, 'Dễ'],
                        ].map(([q, label]) => (
                          <button
                            className="button secondary"
                            key={q}
                            disabled={working}
                            onClick={async () => {
                              setWorking(true);
                              try {
                                if (
                                  await onSave({
                                    entity: 'vocab_cards',
                                    action: 'update',
                                    id: card.id,
                                    expectedVersion: card.version,
                                    data: reviewCard(card, Number(q)),
                                  })
                                )
                                  setRevealed(false);
                              } finally {
                                setWorking(false);
                              }
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="module-empty">
                  Đã hết thẻ đến hạn. Có thể thêm từ mới hoặc quay lại ngày mai.
                </p>
              )}
              <p className="hint">
                CSV cần cột front,back; tùy chọn phonetic,example. Thuật toán dựa vào điểm tự đánh
                giá, không tự chấm kiến thức.
              </p>
            </section>
            <section className="panel module-panel">
              <h2>Nhịp học 12 tuần</h2>
              <Heatmap dates={learning.map((l) => l.date)} />
              <h3>Tra từ</h3>
              <div className="lookup-form">
                <input
                  value={lookupTerm}
                  maxLength={60}
                  onChange={(e) => setLookupTerm(e.target.value)}
                  aria-label="Từ cần tra"
                  placeholder={language === 'en' ? 'hello' : '你好'}
                />
                <button
                  className="button secondary"
                  disabled={working || !lookupTerm.trim()}
                  onClick={lookup}
                >
                  Tra
                </button>
              </div>
              <p className="pre-wrap">{definition}</p>
              <small>
                {language === 'en' ? 'Free Dictionary API' : 'CC-CEDICT · MDBG · CC BY-SA 4.0'}
              </small>
            </section>
          </div>
          <section className="panel module-panel">
            <h2>Nhật ký học</h2>
            {learning
              .filter((l) => match(l.notes, l.date))
              .map((l) => (
                <div className="module-row" key={l.id}>
                  <div>
                    <strong>
                      {l.date} · {l.minutes} phút
                    </strong>
                    <p>{l.notes || 'Một chút tiến bộ mỗi ngày.'}</p>
                  </div>
                  <Actions entity="study_logs" row={l} />
                </div>
              ))}
            {!learning.length && <p className="module-empty">Chưa có nhật ký học.</p>}
          </section>
          <section className="panel module-panel">
            <h2>Kho từ vựng</h2>
            {cards
              .filter((c) => match(c.front, c.back))
              .map((c) => (
                <div className="module-row" key={c.id}>
                  <div>
                    <strong>
                      {c.front} · {c.back}
                    </strong>
                    <p>
                      Ôn tiếp: {c.due_date} · {c.interval_days} ngày
                    </p>
                  </div>
                  <Actions entity="vocab_cards" row={c} />
                </div>
              ))}
          </section>
        </>
      )}
      {section === 'gym' && (
        <>
          <div className="module-toolbar">
            <h2>
              <Dumbbell size={22} /> Nhật ký tập luyện
            </h2>
            <div className="button-row">
              <button className="button primary" onClick={() => setWorkout({})}>
                <Plus size={16} /> Ghi buổi tập
              </button>
              <button
                className="button secondary"
                disabled={!s.workouts.length}
                onClick={() => setWorkout({ copy: s.workouts[0] })}
              >
                Sao chép buổi trước
              </button>
              <button
                className="button secondary"
                onClick={() => setForm({ entity: 'body_metrics' })}
              >
                Ghi chỉ số tùy chọn
              </button>
            </div>
          </div>
          <div className="module-stats">
            <Stat
              label="Buổi tập tuần này"
              value={s.workouts.filter((w) => w.date >= weekStart()).length}
            />
            <Stat label="Tổng buổi đã ghi" value={s.workouts.length} />
            <Stat
              label="Số bài khác nhau"
              value={
                new Set(s.workouts.flatMap((w) => w.sets.map((x) => x.exercise.toLowerCase()))).size
              }
            />
            <Stat label="Chuỗi tuần tập" value={weeklyStreak(s.workouts.map((w) => w.date))} />
          </div>
          <section className="panel module-panel">
            <h2>Lịch tập 12 tuần</h2>
            <Heatmap dates={s.workouts.map((w) => w.date)} />
          </section>
          <div className="module-columns">
            <div>
              {s.workouts
                .filter((w) => match(w.title, w.notes))
                .map((w) => (
                  <article className="panel module-panel" key={w.id}>
                    <div className="module-toolbar">
                      <div>
                        <span className="eyebrow">
                          {w.date} · {w.duration_min} phút
                        </span>
                        <h3>{w.title}</h3>
                      </div>
                      <Actions entity="workouts" row={w} />
                    </div>
                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Bài tập</th>
                            <th>Reps</th>
                            <th>Kg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.sets.map((set, i) => (
                            <tr key={i}>
                              <td>{set.exercise}</td>
                              <td>{set.reps}</td>
                              <td>{set.weight_kg}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="hint">{w.notes}</p>
                  </article>
                ))}
            </div>
            <section className="panel module-panel">
              <h2>Mức tạ cao nhất đã ghi</h2>
              {[...new Set(s.workouts.flatMap((w) => w.sets.map((x) => x.exercise)))].map(
                (name) => (
                  <div className="module-row" key={name}>
                    <strong>{name}</strong>
                    <span>
                      {Math.max(
                        ...s.workouts.flatMap((w) =>
                          w.sets.filter((x) => x.exercise === name).map((x) => x.weight_kg),
                        ),
                      )}{' '}
                      kg
                    </span>
                  </div>
                ),
              )}
              <h3>Chỉ số cá nhân (tùy chọn)</h3>
              {s.body_metrics.map((m) => (
                <div className="module-row" key={m.id}>
                  <div>
                    <strong>
                      {m.date}
                      {m.weight_kg ? ` · ${m.weight_kg} kg` : ''}
                    </strong>
                    <p>{m.notes}</p>
                  </div>
                  <Actions entity="body_metrics" row={m} />
                </div>
              ))}
              <p className="hint">
                Đây là nhật ký cá nhân, không đặt mục tiêu cân nặng hoặc tự đề xuất mức tạ.
              </p>
            </section>
          </div>
        </>
      )}
      {section === 'ai-usage' && (
        <>
          <div className="module-toolbar">
            <h2>Chi phí AI · {month}</h2>
            <div className="button-row">
              <button className="button primary" onClick={() => setForm({ entity: 'ai_usage' })}>
                <Plus size={16} /> Ghi chi phí
              </button>
              <button className="button secondary" onClick={() => importUsage.current?.click()}>
                Nhập CSV
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    'jarvis-ai-usage.csv',
                    Papa.unparse(
                      s.ai_usage.map(
                        ({ date, tool, model, input_tokens, output_tokens, cost_usd, notes }) => ({
                          date,
                          tool,
                          model,
                          input_tokens,
                          output_tokens,
                          cost_usd,
                          notes,
                        }),
                      ),
                      { escapeFormulae: true },
                    ),
                  )
                }
              >
                <Download size={16} /> Xuất CSV
              </button>
              <button
                className="button secondary"
                onClick={() => setForm({ entity: 'settings', record: settings })}
              >
                Ngân sách
              </button>
            </div>
          </div>
          <input
            hidden
            ref={importUsage}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fileUsage(f);
            }}
          />
          <div className="module-stats">
            <Stat label="Chi phí đã ghi tháng này" value={`$${total.toFixed(4)}`} />
            <Stat
              label="Token vào"
              value={usage.reduce((a, u) => a + Number(u.input_tokens), 0).toLocaleString()}
            />
            <Stat
              label="Token ra"
              value={usage.reduce((a, u) => a + Number(u.output_tokens), 0).toLocaleString()}
            />
            <Stat
              label="Ngân sách API / tháng"
              value={settings ? `$${settings.ai_monthly_budget}` : 'Chưa đặt'}
            />
          </div>
          <section className="panel module-panel">
            <h2>Chi phí 14 ngày</h2>
            <MoneyChart usage={s.ai_usage} />
          </section>
          <div className="module-columns">
            <section className="panel module-panel">
              <h2>Theo model / công cụ</h2>
              {[...new Set(usage.map((u) => u.model || u.tool))].map((model) => (
                <div className="module-row" key={model}>
                  <strong>{model}</strong>
                  <span>
                    $
                    {usage
                      .filter((u) => (u.model || u.tool) === model)
                      .reduce((a, u) => a + Number(u.cost_usd), 0)
                      .toFixed(4)}
                  </span>
                </div>
              ))}
            </section>
            <section className="panel module-panel">
              <h2>Theo dự án</h2>
              {[...new Set(usage.map((u) => u.project_id))].map((pid) => (
                <div className="module-row" key={pid || 'none'}>
                  <strong>{s.projects.find((p) => p.id === pid)?.name || 'Không gắn dự án'}</strong>
                  <span>
                    $
                    {usage
                      .filter((u) => u.project_id === pid)
                      .reduce((a, u) => a + Number(u.cost_usd), 0)
                      .toFixed(4)}
                  </span>
                </div>
              ))}
            </section>
          </div>
          <section className="panel module-panel">
            <h2>Lịch sử chi phí</h2>
            <p className="hint">
              Dữ liệu API được ghi tự động; công cụ ngoài app cần ghi tay/CSV. Giá là ước tính theo
              cấu hình, không phải hóa đơn nhà cung cấp.
            </p>
            {s.ai_usage
              .filter((u) => match(u.tool, u.model, u.notes))
              .map((u) => (
                <div className="module-row" key={u.id}>
                  <div>
                    <strong>
                      {u.tool} · {u.model || '—'} · ${Number(u.cost_usd).toFixed(6)}
                    </strong>
                    <p>
                      {u.date} · {u.source === 'api' ? 'Tự động' : 'Ghi tay'} · {u.notes}
                    </p>
                  </div>
                  {u.source === 'manual' && <Actions entity="ai_usage" row={u} />}
                </div>
              ))}
          </section>
        </>
      )}
      {section === 'vault' && (
        <VaultPanel snapshot={snapshot} onSave={onSave} onBatch={onBatch} notify={notify} />
      )}
      {section === 'monitor' && (
        <>
          <div className="module-toolbar">
            <h2>Website & sự cố</h2>
            <div className="button-row">
              <button className="button primary" onClick={() => setForm({ entity: 'monitors' })}>
                <Plus size={16} /> Thêm monitor
              </button>
              <button
                className="button secondary"
                disabled={working}
                onClick={() => job('monitor')}
              >
                <RefreshCw size={16} /> Kiểm tra đến lịch
              </button>
            </div>
          </div>
          <p className="module-notice">
            Chỉ kiểm tra URL công khai. Luôn xem thời điểm kiểm tra; không có kết quả hoặc kết quả
            cũ không đồng nghĩa website đang hoạt động.
          </p>
          <div className="module-grid">
            {s.monitors
              .filter((m) => match(m.name, m.url))
              .map((m) => {
                const last = s.monitor_checks.find((c) => c.monitor_id === m.id),
                  stale =
                    last &&
                    (Date.now() - new Date(last.checked_at).valueOf() >
                      m.interval_minutes * 120000 ||
                      new Date(last.checked_at).valueOf() < new Date(m.updated_at).valueOf());
                return (
                  <article className="panel module-card" key={m.id}>
                    <div className="module-toolbar">
                      <span
                        className={`monitor-badge ${!m.enabled || !last || stale ? 'unknown' : last.ok ? 'up' : 'down'}`}
                      >
                        {!m.enabled
                          ? 'Đã tắt'
                          : !last
                            ? 'Chưa kiểm tra'
                            : stale
                              ? 'Dữ liệu cũ'
                              : last.ok
                                ? 'Bình thường'
                                : 'Đang lỗi'}
                      </span>
                      <Actions entity="monitors" row={m} />
                    </div>
                    <h3>{m.name}</h3>
                    <p>
                      <a href={m.url} target="_blank" rel="noreferrer">
                        {m.url}
                      </a>
                    </p>
                    <p>
                      {last
                        ? `${last.status_code || 'Không có HTTP'} · ${last.latency_ms} ms · ${new Date(last.checked_at).toLocaleString('vi-VN')}`
                        : 'Chưa có dữ liệu từ bộ lập lịch.'}
                    </p>
                    <p>
                      SSL: {last?.ssl_expires_at?.slice(0, 10) || 'Không rõ'}
                      <br />
                      Domain: {last?.domain_expires_at?.slice(0, 10) || 'Không rõ'}
                    </p>
                    <p className="hint">
                      Lịch mong muốn {m.interval_minutes} phút · Báo sau {m.failure_threshold} lỗi
                      liên tiếp
                    </p>
                    {last?.error && <p className="error">{last.error}</p>}
                    <details>
                      <summary>Lịch sử gần nhất</summary>
                      {s.monitor_checks
                        .filter((c) => c.monitor_id === m.id)
                        .slice(0, 15)
                        .map((c) => (
                          <p key={c.id}>
                            {c.checked_at} · {c.ok ? 'OK' : 'Lỗi'} · {c.latency_ms}ms
                          </p>
                        ))}
                    </details>
                  </article>
                );
              })}
          </div>
          <section className="panel module-panel">
            <h2>Sự cố</h2>
            {s.incidents.map((i) => (
              <div className="module-row" key={i.id}>
                <div>
                  <strong>
                    {s.monitors.find((m) => m.id === i.monitor_id)?.name || 'Monitor'} ·{' '}
                    {i.resolved_at ? 'Đã phục hồi' : 'Chưa phục hồi'}
                  </strong>
                  <p>
                    {i.reason} · {i.opened_at}
                    {i.resolved_at ? ' → ' + i.resolved_at : ''}
                  </p>
                </div>
              </div>
            ))}
            {!s.incidents.length && <p className="module-empty">Chưa ghi nhận sự cố.</p>}
          </section>
        </>
      )}
      {section === 'news' && (
        <>
          <div className="module-toolbar">
            <div className="filter-bar">
              {[
                ['unread', 'Chưa đọc'],
                ['all', 'Tất cả'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  className={newsFilter === v ? 'filter active' : 'filter'}
                  onClick={() => setNewsFilter(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => setForm({ entity: 'news_sources' })}
              >
                Thêm nguồn RSS
              </button>
              <button className="button secondary" disabled={working} onClick={() => job('news')}>
                <RefreshCw size={16} /> Nạp tin
              </button>
            </div>
          </div>
          <div className="module-columns news-columns">
            <section>
              {s.news_items
                .filter(
                  (n) =>
                    (newsFilter === 'all' || !n.read) &&
                    match(n.title, n.summary, n.tags.join(' ')),
                )
                .map((n) => (
                  <article className="panel module-panel news-card" key={n.id}>
                    <span className="eyebrow">
                      {s.news_sources.find((x) => x.id === n.source_id)?.name || 'Nguồn bên ngoài'}{' '}
                      · {n.published_at?.slice(0, 10) || 'Không rõ ngày'}
                    </span>
                    <h3>
                      <a href={n.url} target="_blank" rel="noreferrer">
                        {n.title} <ExternalLink size={15} />
                      </a>
                    </h3>
                    <p>{n.summary}</p>
                    <div className="module-toolbar">
                      <div className="tag-list">
                        {n.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <button
                        className="button secondary small"
                        onClick={() =>
                          onSave({
                            entity: 'news_items',
                            action: 'update',
                            id: n.id,
                            expectedVersion: n.version,
                            data: { read: !n.read },
                          })
                        }
                      >
                        {n.read ? 'Đánh dấu chưa đọc' : 'Đã đọc'}
                      </button>
                    </div>
                  </article>
                ))}
              {!s.news_items.length && (
                <p className="module-empty">
                  Thêm nguồn RSS / Atom, rồi nạp tin khi đã cấu hình job server.
                </p>
              )}
            </section>
            <aside className="panel module-panel">
              <h2>Nguồn theo dõi</h2>
              {s.news_sources.map((source) => (
                <div className="source-row" key={source.id}>
                  <h3>{source.name}</h3>
                  <p>
                    {source.enabled ? 'Đang bật' : 'Đã tắt'} ·{' '}
                    {source.keywords.join(', ') || 'Dùng từ khóa chung'}
                  </p>
                  <Actions entity="news_sources" row={source} />
                </div>
              ))}
              <p className="hint">
                Tin ngoài luôn là dữ liệu không đáng tin. Tiêu đề, mô tả và link không thể cấp quyền
                cho agent.
              </p>
            </aside>
          </div>
        </>
      )}
      {section === 'review' && (
        <>
          <div className="module-toolbar">
            <h2>Review theo tuần</h2>
            <button
              className="button primary"
              onClick={async () => {
                const review = buildWeeklyReview(snapshot);
                const existing = s.weekly_reviews.find((r) => r.week_start === review.week_start);
                await onSave({
                  entity: 'weekly_reviews',
                  action: existing ? 'update' : 'create',
                  id: existing?.id || crypto.randomUUID(),
                  expectedVersion: existing?.version,
                  data: review,
                });
              }}
            >
              Tổng hợp tuần này
            </button>
          </div>
          {s.weekly_reviews
            .filter((r) => match(r.summary, r.week_start))
            .sort((a, b) => b.week_start.localeCompare(a.week_start))
            .map((r) => (
              <article className="panel module-panel" key={r.id}>
                <span className="eyebrow">
                  TUẦN {r.week_start} · {r.source === 'llm' ? 'TÓM TẮT AI' : 'TỔNG HỢP TỪ SỐ LIỆU'}
                </span>
                <h3>Nhìn lại để bước tiếp.</h3>
                <p className="pre-wrap">{r.summary}</p>
                <div className="review-metrics">
                  {Object.entries(r.metrics).map(([key, value]) => (
                    <span key={key}>
                      {key.replaceAll('_', ' ')}
                      <strong>{Number(value).toFixed(key.includes('cost') ? 4 : 0)}</strong>
                    </span>
                  ))}
                </div>
                <ol>
                  {r.suggestions.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ol>
              </article>
            ))}
          {!s.weekly_reviews.length && (
            <p className="module-empty">
              Tạo bản tổng hợp đầu tiên. Cron tuần sẽ lưu tự động khi được cấu hình.
            </p>
          )}
        </>
      )}
      {section === 'settings' && (
        <>
          <section className="panel module-panel">
            <div className="module-toolbar">
              <h2>Cài đặt đồng bộ</h2>
              <button
                className="button secondary"
                onClick={() => setForm({ entity: 'settings', record: settings })}
              >
                <Settings2 size={16} /> Cấu hình
              </button>
            </div>
            <p>
              Ngân sách, từ khóa, popup chào và thông báo lưu cùng tài khoản. Token/khóa tích hợp
              chỉ đặt ở biến môi trường phía server.
            </p>
            <div className="connection-grid">
              {Object.entries(connections).map(([name, enabled]) => (
                <div key={name}>
                  <strong>{name.toUpperCase()}</strong>
                  <span>{enabled ? 'Đã có cấu hình' : 'Chưa cấu hình'}</span>
                </div>
              ))}
              {mode === 'demo' && <p>Bản dùng thử không kết nối dịch vụ bên ngoài.</p>}
            </div>
          </section>
          <section className="panel module-panel">
            <h2>Job & nhật ký agent</h2>
            <div className="button-row">
              <button className="button secondary" disabled={working} onClick={() => job('daily')}>
                Chạy job ngày
              </button>
              <button className="button secondary" disabled={working} onClick={() => job('weekly')}>
                Chạy review tuần
              </button>
            </div>
            {s.job_runs.slice(0, 15).map((j) => (
              <div key={j.id} className="module-row">
                <div>
                  <strong>
                    {j.name} · {j.status}
                  </strong>
                  <p>
                    {j.started_at} · {j.detail}
                  </p>
                </div>
              </div>
            ))}
            <details>
              <summary>Nhật ký tool gần nhất</summary>
              {s.agent_logs.slice(0, 40).map((l) => (
                <p key={l.id}>
                  {l.created_at} · {l.tool} · Bậc {l.tier} · {l.status}
                </p>
              ))}
            </details>
          </section>
        </>
      )}
      {form && (
        <ModuleForm
          entity={form.entity}
          record={form.record}
          defaults={form.defaults}
          snapshot={snapshot}
          onSave={onSave}
          onClose={() => setForm(null)}
        />
      )}
      {workout && (
        <WorkoutForm
          record={workout.record}
          copy={workout.copy}
          onSave={onSave}
          onClose={() => setWorkout(null)}
        />
      )}
      {archive && (
        <Modal title="Lưu trữ bản ghi?" onClose={() => setArchive(null)}>
          <p>Mục sẽ ẩn khỏi danh sách và có thể hoàn tác nếu chưa có thay đổi mới.</p>
          <div className="form-footer">
            <button className="button secondary" onClick={() => setArchive(null)}>
              Giữ lại
            </button>
            <button
              className="button primary"
              onClick={async () => {
                if (
                  await onSave({
                    entity: archive.entity,
                    action: 'archive',
                    id: archive.record.id,
                    expectedVersion: archive.record.version,
                    data: {},
                  })
                )
                  setArchive(null);
              }}
            >
              Lưu trữ
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
