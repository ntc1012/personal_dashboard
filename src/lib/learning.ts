import Papa from 'papaparse';
import { day, extraSchemas, type VocabCard } from './modules';
import { dateKey } from './domain';
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function reviewCard(card: VocabCard, quality: number, today = dateKey()) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5)
    throw new Error('Điểm ôn tập không hợp lệ.');
  let repetitions = card.repetitions,
    interval = card.interval_days;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.ceil(interval * card.ease);
    repetitions++;
  }
  const ease =
    quality < 3
      ? card.ease
      : Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return {
    repetitions,
    interval_days: Math.min(interval, 36500),
    ease: Math.min(ease, 5),
    due_date: addDays(today, Math.min(interval, 36500)),
    last_reviewed: new Date().toISOString(),
  };
}
export function studyStreak(dates: string[], today = dateKey()) {
  const days = new Set(dates);
  let cursor = days.has(today) ? today : addDays(today, -1),
    count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function parseVocabCsv(csv: string, language: 'en' | 'zh', today = dateKey()) {
  if (csv.length > 500000) throw new Error('CSV quá lớn. Tối đa 500 KB.');
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length) throw new Error('CSV không hợp lệ. Kiểm tra dấu nháy và số cột.');
  if (!parsed.meta.fields?.includes('front') || !parsed.meta.fields?.includes('back'))
    throw new Error('CSV cần cột front,back; tùy chọn phonetic,example.');
  if (parsed.data.length > 200) throw new Error('Nhập tối đa 200 thẻ mỗi lần.');
  const unique = new Map<string, ReturnType<typeof extraSchemas.vocab_cards.parse>>();
  for (const row of parsed.data) {
    const card = extraSchemas.vocab_cards.parse({
      language,
      front: row.front,
      back: row.back,
      phonetic: row.phonetic || '',
      example: row.example || '',
      due_date: today,
    });
    unique.set(card.front.toLocaleLowerCase(), card);
  }
  return [...unique.values()];
}
export function weekStart(date = dateKey()) {
  day.parse(date);
  const d = new Date(date + 'T12:00:00Z');
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
