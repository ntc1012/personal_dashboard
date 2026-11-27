'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { planBackupRestore } from '@/lib/backup';
import { labels } from '@/lib/demo';
import type { Snapshot, Mutation } from '@/lib/types';
import Modal from './modal';
export default function BackupRestore({
  snapshot,
  onRestore,
  notify,
}: {
  snapshot: Snapshot;
  onRestore: (file: unknown) => Promise<boolean>;
  notify: (text: string, error?: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
      file: unknown;
      operations: Mutation[];
      skipped: number;
    } | null>(null),
    [busy, setBusy] = useState(false);
  async function read(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error('JSON tối đa 5 MB.');
      const data = JSON.parse(await file.text()),
        plan = planBackupRestore(data, snapshot);
      setPreview({ file: data, ...plan });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không đọc được bản sao lưu.', true);
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <button className="button secondary" onClick={() => input.current?.click()}>
        <Upload size={16} /> Nhập bản sao JSON
      </button>
      <input
        hidden
        type="file"
        accept=".json"
        ref={input}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
        }}
      />
      {preview && (
        <Modal
          title="Xem trước khôi phục dữ liệu"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <p>
            Thêm {preview.operations.length} bản ghi mới. Bỏ qua {preview.skipped} mục đã có, đã lưu
            trữ hoặc thuộc sổ ghi API tự động. Không ghi đè dữ liệu hiện tại.
          </p>
          <ul>
            {Object.entries(
              preview.operations.reduce<Record<string, number>>(
                (a, m) => ({ ...a, [m.entity]: (a[m.entity] || 0) + 1 }),
                {},
              ),
            ).map(([entity, n]) => (
              <li key={entity}>
                {labels[entity as keyof typeof labels]}: {n}
              </li>
            ))}
          </ul>
          <p className="hint">
            Lịch sử hệ thống và sổ ngân sách API không được nhập lại. Vault giữ nguyên ciphertext và
            ID gốc.
          </p>
          <div className="form-footer">
            <button className="button secondary" disabled={busy} onClick={() => setPreview(null)}>
              Hủy
            </button>
            <button
              className="button primary"
              disabled={busy || !preview.operations.length}
              onClick={async () => {
                setBusy(true);
                try {
                  if (await onRestore(preview.file)) setPreview(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Đang khôi phục…' : 'Khôi phục các bản ghi mới'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
