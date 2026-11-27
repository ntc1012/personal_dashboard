import { dateKey, visible } from './domain';
import { addDays, weekStart } from './learning';
import type { Snapshot } from './types';
export function buildWeeklyReview(snapshot: Snapshot, start = weekStart(), today = dateKey()) {
  const s = visible(snapshot),
    end = addDays(start, 7),
    inWeek = (date: string) => date >= start && date < end;
  const done = s.tasks.filter((t) => t.done_at && inWeek(dateKey(new Date(t.done_at)))).length;
  const pending = s.tasks.filter(
    (t) => t.status === 'todo' && t.due_date && t.due_date < end,
  ).length;
  const minutes = s.study_logs.filter((l) => inWeek(l.date)).reduce((a, l) => a + l.minutes, 0);
  const workouts = s.workouts.filter((w) => inWeek(w.date)).length;
  const cost = s.ai_usage.filter((u) => inWeek(u.date)).reduce((a, u) => a + Number(u.cost_usd), 0);
  const incidents = s.incidents.filter((i) => inWeek(dateKey(new Date(i.opened_at)))).length;
  return {
    week_start: start,
    metrics: {
      tasks_done: done,
      tasks_pending: pending,
      study_minutes: minutes,
      workouts,
      ai_cost_usd: cost,
      incidents,
    },
    summary: `Tuần ${start} – ${addDays(end, -1)}: hoàn thành ${done} công việc, ${minutes} phút học, ${workouts} buổi tập. Chi phí AI $${cost.toFixed(4)}; ${incidents} sự cố website. ${pending} công việc đến hạn còn mở.`,
    suggestions: [
      pending
        ? `Chọn tối đa 3 việc trong ${pending} việc đang mở để ưu tiên đầu tuần.`
        : 'Chọn một mục tiêu cụ thể cho tuần tới.',
      minutes
        ? 'Giữ khung giờ học ngắn mà bạn dễ duy trì.'
        : 'Chọn một khoảng thời gian ngắn để bắt đầu học đều.',
      incidents
        ? 'Xem lại nguyên nhân các sự cố và thời điểm kiểm tra gần nhất.'
        : cost
          ? 'Đối chiếu chi phí AI với ngân sách đã đặt.'
          : 'Sắp xếp một khoảng thời gian vận động phù hợp lịch của bạn.',
    ],
    source: 'deterministic' as const,
  };
}
