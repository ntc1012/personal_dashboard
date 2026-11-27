'use client';
import { useState } from 'react';
import { z } from 'zod';
import Modal from './modal';
import { extraSchemas, type ExtraEntity, type ModuleRecord } from '@/lib/modules';
import { dateKey } from '@/lib/domain';
import type { Mutation, Snapshot } from '@/lib/types';
export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'boolean' | 'list' | 'url';
  options?: [string, string][];
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
};
const languages: [string, string][] = [
  ['en', 'Tiếng Anh'],
  ['zh', 'Tiếng Trung'],
];
export const moduleFields: Partial<Record<ExtraEntity, Field[]>> = {
  study_logs: [
    { key: 'language', label: 'Ngôn ngữ', type: 'select', options: languages },
    { key: 'date', label: 'Ngày học', type: 'date', required: true },
    { key: 'minutes', label: 'Số phút học', type: 'number', min: 1, max: 1440, required: true },
    { key: 'notes', label: 'Ghi chú', type: 'textarea' },
  ],
  vocab_cards: [
    { key: 'language', label: 'Ngôn ngữ', type: 'select', options: languages },
    { key: 'front', label: 'Từ / cụm từ', required: true },
    { key: 'back', label: 'Nghĩa', required: true },
    { key: 'phonetic', label: 'Phiên âm' },
    { key: 'example', label: 'Câu ví dụ', type: 'textarea' },
    { key: 'due_date', label: 'Ngày ôn tiếp', type: 'date', required: true },
  ],
  body_metrics: [
    { key: 'date', label: 'Ngày ghi', type: 'date', required: true },
    {
      key: 'weight_kg',
      label: 'Cân nặng (kg, tùy chọn)',
      type: 'number',
      min: 1,
      max: 500,
      step: 0.1,
    },
    { key: 'notes', label: 'Ghi chú', type: 'textarea' },
  ],
  ai_usage: [
    { key: 'date', label: 'Ngày', type: 'date', required: true },
    { key: 'tool', label: 'Công cụ', required: true },
    { key: 'model', label: 'Model' },
    { key: 'project_id', label: 'Dự án', type: 'select' },
    { key: 'input_tokens', label: 'Token vào', type: 'number', min: 0 },
    { key: 'output_tokens', label: 'Token ra', type: 'number', min: 0 },
    { key: 'cost_usd', label: 'Chi phí (USD)', type: 'number', min: 0, step: 0.000001 },
    { key: 'notes', label: 'Ghi chú', type: 'textarea' },
  ],
  monitors: [
    { key: 'name', label: 'Tên website', required: true },
    { key: 'url', label: 'URL cần kiểm tra', type: 'url', required: true },
    { key: 'project_id', label: 'Dự án', type: 'select' },
    { key: 'expected_status', label: 'HTTP mong đợi', type: 'number', min: 100, max: 599 },
    {
      key: 'interval_minutes',
      label: 'Khoảng kiểm tra (phút)',
      type: 'number',
      min: 5,
      max: 1440,
      hint: 'Lịch chạy thực tế phụ thuộc bộ lập lịch đã cấu hình.',
    },
    { key: 'failure_threshold', label: 'Số lỗi liên tiếp để báo', type: 'number', min: 2, max: 10 },
    { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', min: 1000, max: 10000 },
    { key: 'enabled', label: 'Bật giám sát', type: 'boolean' },
  ],
  news_sources: [
    { key: 'name', label: 'Tên nguồn', required: true },
    { key: 'url', label: 'URL RSS / Atom', type: 'url', required: true },
    { key: 'keywords', label: 'Từ khóa (mỗi dòng một từ)', type: 'list' },
    { key: 'enabled', label: 'Bật nguồn tin', type: 'boolean' },
  ],
  settings: [
    {
      key: 'theme',
      label: 'Giao diện',
      type: 'select',
      options: [
        ['auto', 'Theo buổi'],
        ['dark', 'Tối'],
        ['light', 'Sáng'],
      ],
    },
    { key: 'sound', label: 'Âm thanh khi hoàn thành', type: 'boolean' },
    { key: 'greeting', label: 'Popup chào theo buổi', type: 'boolean' },
    { key: 'keywords', label: 'Từ khóa bảo mật', type: 'list' },
    {
      key: 'ai_monthly_budget',
      label: 'Ngân sách API / tháng (USD)',
      type: 'number',
      min: 0,
      step: 0.01,
    },
    { key: 'ai_daily_tokens', label: 'Giới hạn token API / ngày', type: 'number', min: 0 },
    {
      key: 'ai_input_per_million',
      label: 'Giá token vào (USD / 1 triệu)',
      type: 'number',
      min: 0,
      step: 0.000001,
      hint: 'Điền giá theo model của nhà cung cấp trước khi bật LLM.',
    },
    {
      key: 'ai_output_per_million',
      label: 'Giá token ra (USD / 1 triệu)',
      type: 'number',
      min: 0,
      step: 0.000001,
    },
    {
      key: 'notifications',
      label: 'Cho phép thông báo định kỳ tới kênh đã cấu hình',
      type: 'boolean',
    },
  ],
};
export default function ModuleForm({
  entity,
  record,
  defaults = {},
  snapshot,
  onSave,
  onClose,
}: {
  entity: ExtraEntity;
  record?: ModuleRecord;
  defaults?: Record<string, unknown>;
  snapshot: Snapshot;
  onSave: (m: Mutation) => Promise<boolean>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const fields = moduleFields[entity] || [];
  const initial: Record<string, unknown> = {
    date: dateKey(),
    due_date: dateKey(),
    language: 'en',
    minutes: 20,
    expected_status: 200,
    interval_minutes: 15,
    failure_threshold: 2,
    timeout_ms: 8000,
    enabled: true,
    theme: 'auto',
    sound: false,
    greeting: true,
    notifications: false,
    keywords: ['Next.js', 'Supabase'],
    ai_monthly_budget: 5,
    ai_daily_tokens: 20000,
    ai_input_per_million: 0,
    ai_output_per_million: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    ...record,
    ...defaults,
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      const form = new FormData(e.currentTarget);
      const input: Record<string, unknown> = {};
      for (const key of Object.keys(extraSchemas[entity].shape))
        if (initial[key] !== undefined) input[key] = initial[key];
      for (const field of fields) {
        const raw = form.get(field.key);
        input[field.key] =
          field.type === 'boolean'
            ? raw === 'on'
            : field.type === 'number'
              ? raw === '' && field.key === 'weight_kg'
                ? null
                : Number(raw)
              : field.type === 'list'
                ? String(raw || '')
                    .split(/[\n,]/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                : field.key === 'project_id'
                  ? raw || null
                  : String(raw || '');
      }
      const data = extraSchemas[entity].parse(input);
      if (
        await onSave({
          entity,
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
          ? e.issues[0]?.message || 'Kiểm tra dữ liệu.'
          : e instanceof Error
            ? e.message
            : 'Không lưu được.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={record ? 'Chỉnh sửa' : 'Thêm bản ghi'}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.key}>
            {f.label}
            {f.type === 'boolean' ? (
              <input type="checkbox" name={f.key} defaultChecked={Boolean(initial[f.key])} />
            ) : f.type === 'select' ? (
              <select name={f.key} defaultValue={String(initial[f.key] ?? '')}>
                {f.key === 'project_id' ? (
                  <>
                    <option value="">Không gắn dự án</option>
                    {snapshot.projects
                      .filter((p) => !p.archived_at)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </>
                ) : (
                  f.options?.map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))
                )}
              </select>
            ) : f.type === 'textarea' || f.type === 'list' ? (
              <textarea
                name={f.key}
                rows={3}
                required={f.required}
                defaultValue={
                  Array.isArray(initial[f.key])
                    ? (initial[f.key] as string[]).join('\n')
                    : String(initial[f.key] ?? '')
                }
              />
            ) : (
              <input
                name={f.key}
                type={f.type || 'text'}
                required={f.required}
                min={f.min}
                max={f.max}
                step={f.step ?? (f.type === 'number' ? 1 : undefined)}
                defaultValue={String(initial[f.key] ?? '')}
              />
            )}{' '}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button className="button secondary" type="button" disabled={pending} onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
