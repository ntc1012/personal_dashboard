'use client';
import { Clock3 } from 'lucide-react';
import type { Snapshot } from '@/lib/types';
import { dateKey } from '@/lib/domain';
export default function DeadlineSummary({ snapshot }: { snapshot: Snapshot }) {
  const tasks = snapshot.tasks
    .filter((t) => !t.archived_at && t.status === 'todo' && t.due_date)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const task = tasks[0];
  if (!task) return null;
  const days = Math.round(
    (Date.parse(task.due_date! + 'T12:00:00Z') - Date.parse(dateKey() + 'T12:00:00Z')) / 86400000,
  );
  return (
    <section className={`deadline-summary ${days < 0 ? 'overdue' : ''}`}>
      <Clock3 size={20} />
      <div>
        <span>DEADLINE GẦN NHẤT</span>
        <strong>{task.title}</strong>
      </div>
      <p>
        {days < 0 ? `Quá hạn ${-days} ngày` : days === 0 ? 'Đến hạn hôm nay' : `Còn ${days} ngày`}
        <small>{task.due_date} · hạn theo ngày (UTC+7)</small>
      </p>
    </section>
  );
}
