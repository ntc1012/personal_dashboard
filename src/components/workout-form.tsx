'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';
import Modal from './modal';
import { extraSchemas, type Workout } from '@/lib/modules';
import { dateKey } from '@/lib/domain';
import type { Mutation } from '@/lib/types';
export default function WorkoutForm({
  record,
  copy,
  onClose,
  onSave,
}: {
  record?: Workout;
  copy?: Workout;
  onClose: () => void;
  onSave: (m: Mutation) => Promise<boolean>;
}) {
  const initial = record || copy;
  const [title, setTitle] = useState(initial?.title || 'Buổi tập'),
    [date, setDate] = useState(record?.date || dateKey()),
    [duration, setDuration] = useState(initial?.duration_min || 0),
    [notes, setNotes] = useState(initial?.notes || ''),
    [sets, setSets] = useState(initial?.sets || [{ exercise: '', reps: 8, weight_kg: 0 }]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function update(i: number, field: 'exercise' | 'reps' | 'weight_kg', value: string | number) {
    setSets((s) => s.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = extraSchemas.workouts.parse({
        date,
        title,
        duration_min: duration,
        sets,
        notes,
      });
      if (
        await onSave({
          entity: 'workouts',
          action: record ? 'update' : 'create',
          id: record?.id || crypto.randomUUID(),
          expectedVersion: record?.version,
          data,
        })
      )
        onClose();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues[0]?.message || 'Kiểm tra các set.'
          : 'Không lưu được buổi tập.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? 'Sửa buổi tập' : copy ? 'Sao chép buổi trước' : 'Ghi buổi tập'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Tên buổi tập
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Ngày
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Thời lượng (phút)
            <input
              type="number"
              min={0}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="workout-sets">
          <div className="set-grid set-heading">
            <span>Bài tập</span>
            <span>Reps</span>
            <span>Kg</span>
            <span />
          </div>
          {sets.map((set, i) => (
            <div className="set-grid" key={i}>
              <input
                aria-label={`Bài tập set ${i + 1}`}
                required
                maxLength={100}
                placeholder="Tên bài"
                value={set.exercise}
                onChange={(e) => update(i, 'exercise', e.target.value)}
              />
              <input
                aria-label={`Reps set ${i + 1}`}
                type="number"
                min={1}
                max={1000}
                value={set.reps}
                onChange={(e) => update(i, 'reps', Number(e.target.value))}
              />
              <input
                aria-label={`Kg set ${i + 1}`}
                type="number"
                min={0}
                max={1000}
                step={0.5}
                value={set.weight_kg}
                onChange={(e) => update(i, 'weight_kg', Number(e.target.value))}
              />
              <button
                type="button"
                className="icon-button"
                disabled={sets.length === 1}
                aria-label={`Xóa set ${i + 1}`}
                onClick={() => setSets((s) => s.filter((_, j) => i !== j))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            disabled={sets.length >= 100}
            onClick={() => setSets((s) => [...s, { ...s[s.length - 1] }])}
          >
            <Plus size={16} /> Thêm set giống trước
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={sets.length >= 100}
            onClick={() => setSets((s) => [...s, { exercise: '', reps: 8, weight_kg: 0 }])}
          >
            Bài khác
          </button>
        </div>
        <label>
          Ghi chú
          <textarea value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu buổi tập'}
        </button>
      </form>
    </Modal>
  );
}
