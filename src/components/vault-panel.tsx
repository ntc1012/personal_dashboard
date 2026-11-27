'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Eye, EyeOff, LockKeyhole, Plus, ShieldCheck } from 'lucide-react';
import {
  createVault,
  decryptVault,
  encryptVault,
  unlockVault,
  encryptedBackupSchema,
  metaFields,
  itemFields,
} from '@/lib/crypto/vault';
import type { VaultItem, VaultMeta } from '@/lib/modules';
import type { Mutation, Snapshot } from '@/lib/types';
import Modal from './modal';
type Props = {
  snapshot: Snapshot;
  onSave: (m: Mutation) => Promise<boolean>;
  onBatch: (m: Mutation[]) => Promise<boolean>;
  notify: (s: string, error?: boolean) => void;
};
export default function VaultPanel({ snapshot, onSave, onBatch, notify }: Props) {
  const meta = snapshot.vault_meta.find((m) => !m.archived_at);
  const keyRef = useRef<CryptoKey | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    epoch = useRef(0);
  const [unlocked, setUnlocked] = useState(false),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(false),
    [selected, setSelected] = useState<VaultItem | null>(null),
    [secret, setSecret] = useState('');
  const [label, setLabel] = useState(''),
    [category, setCategory] = useState('Cá nhân'),
    [location, setLocation] = useState<'vault' | 'bitwarden'>('vault'),
    [value, setValue] = useState('');
  const importer = useRef<HTMLInputElement>(null);
  function lock() {
    epoch.current++;
    keyRef.current = null;
    setUnlocked(false);
    setPassword('');
    setConfirm('');
    setSecret('');
    setValue('');
    setSelected(null);
    setEditor(false);
  }
  useEffect(() => {
    function reset() {
      if (timer.current) clearTimeout(timer.current);
      if (keyRef.current) timer.current = setTimeout(lock, 180000);
    }
    function hidden() {
      if (document.hidden) lock();
    }
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      epoch.current++;
      keyRef.current = null;
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const generation = epoch.current;
    try {
      let derived: CryptoKey;
      if (meta) derived = await unlockVault(password, meta);
      else {
        if (password !== confirm) throw new Error('Password mismatch');
        const id = crypto.randomUUID();
        const created = await createVault(password, id);
        if (!(await onSave({ entity: 'vault_meta', action: 'create', id, data: created.meta })))
          return;
        derived = created.key;
      }
      if (generation !== epoch.current || document.hidden) return;
      keyRef.current = derived;
      setUnlocked(true);
      setPassword('');
      setConfirm('');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, 180000);
    } catch {
      notify('Không mở được vault. Kiểm tra master password (ít nhất 12 ký tự).', true);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const encrypted = await encryptVault(
        keyRef.current,
        location === 'bitwarden' ? 'Tham chiếu trong Bitwarden' : value,
        id,
      );
      if (
        await onSave({
          entity: 'vault_items',
          action: 'create',
          id,
          data: { label, category, location, ...encrypted },
        })
      ) {
        setEditor(false);
        setValue('');
        setLabel('');
      }
    } catch {
      notify('Không mã hóa được. Hãy mở lại vault.', true);
    } finally {
      setBusy(false);
    }
  }
  async function reveal(item: VaultItem) {
    if (!keyRef.current) return;
    const generation = epoch.current;
    try {
      const plaintext = await decryptVault(keyRef.current, item, item.id);
      if (generation !== epoch.current || !keyRef.current || document.hidden) return;
      setSecret(plaintext);
      setSelected(item);
    } catch {
      notify('Không giải mã được mục này. Kiểm tra khóa hoặc bản sao lưu.', true);
    }
  }
  function backup() {
    if (!meta) return;
    const data = {
      format: 'jarvis-encrypted-vault-v1',
      meta,
      items: snapshot.vault_items.filter((i) => !i.archived_at),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jarvis-vault-encrypted.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Đã xuất vault mã hóa. Bản này vẫn cần master password để giải mã.');
  }
  async function restore(file: File) {
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error('Tệp quá lớn.');
      const backup = encryptedBackupSchema.parse(JSON.parse(await file.text()));
      if (meta && meta.id !== backup.meta.id)
        throw new Error('Vault khác khóa. Chỉ nhập vào vault trống hoặc đúng vault gốc.');
      if (meta && JSON.stringify(metaFields(meta)) !== JSON.stringify(metaFields(backup.meta)))
        throw new Error('Tham số khóa không khớp.');
      const existing = new Set(snapshot.vault_items.map((i) => i.id));
      const ops: Mutation[] = [];
      if (!meta)
        ops.push({
          entity: 'vault_meta',
          action: 'create',
          id: backup.meta.id,
          data: metaFields(backup.meta),
        });
      for (const item of backup.items)
        if (!existing.has(item.id))
          ops.push({
            entity: 'vault_items',
            action: 'create',
            id: item.id,
            data: itemFields(item),
          });
      if (ops.length > 2001) throw new Error('Tối đa 2000 mục vault mỗi lần.');
      if (!ops.length) {
        notify('Không có mục mới để nhập.');
        return;
      }
      if (await onBatch(ops)) {
        lock();
        notify('Đã khôi phục dữ liệu mã hóa. Dùng master password gốc để mở.');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không nhập được vault.', true);
    } finally {
      setBusy(false);
      if (importer.current) importer.current.value = '';
    }
  }
  return (
    <div className="vault-layout">
      <div className="panel module-panel">
        <div className="module-toolbar">
          <h2>
            <LockKeyhole size={22} /> Vault cá nhân
          </h2>
          <div className="button-row">
            <button className="button secondary" disabled={!meta} onClick={backup}>
              <Download size={16} /> Xuất mã hóa
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => importer.current?.click()}
            >
              Nhập bản sao
            </button>
            {unlocked && (
              <button className="button secondary" onClick={lock}>
                Khóa ngay
              </button>
            )}
          </div>
        </div>
        <input
          hidden
          type="file"
          accept=".json"
          ref={importer}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
          }}
        />
        {!unlocked ? (
          <form className="form-stack vault-unlock" onSubmit={open}>
            <ShieldCheck size={38} />
            <h3>{meta ? 'Mở không gian mã hóa' : 'Tạo master password'}</h3>
            <p>Mật khẩu chỉ dùng trong trình duyệt, không gửi tới server hoặc chatbot.</p>
            <label>
              Master password
              <input
                type="password"
                minLength={12}
                autoComplete={meta ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {!meta && (
              <label>
                Nhập lại mật khẩu
                <input
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Đang xử lý…' : meta ? 'Mở vault' : 'Tạo vault'}
            </button>
          </form>
        ) : (
          <>
            <div className="module-toolbar">
              <p>Đã mở · tự khóa sau 3 phút không hoạt động hoặc khi rời tab.</p>
              <button className="button primary" onClick={() => setEditor(true)}>
                <Plus size={16} /> Thêm mục
              </button>
            </div>
            <div className="vault-grid">
              {snapshot.vault_items
                .filter((i) => !i.archived_at)
                .map((item) => (
                  <article key={item.id} className="panel module-card">
                    <span className="eyebrow">{item.category}</span>
                    <h3>{item.label}</h3>
                    <p>
                      {item.location === 'bitwarden'
                        ? 'Lưu trong Bitwarden'
                        : 'Được mã hóa trên thiết bị'}
                    </p>
                    <button className="button secondary" onClick={() => reveal(item)}>
                      <Eye size={16} />{' '}
                      {item.location === 'bitwarden' ? 'Xem vị trí' : 'Hiện nội dung'}
                    </button>
                  </article>
                ))}
            </div>
            {!snapshot.vault_items.some((i) => !i.archived_at) && (
              <p className="module-empty">Vault chưa có mục nào.</p>
            )}
          </>
        )}
      </div>
      <aside className="panel module-panel">
        <h3>Giữ bí mật ở đúng chỗ.</h3>
        <p>
          Chỉ dùng vault này cho thông tin ít quan trọng. Tài khoản email chính, ngân hàng, hosting
          và công ty nên nằm trong trình quản lý mật khẩu chuyên dụng.
        </p>
        <p>Quên master password sẽ không giải mã được dữ liệu, kể cả khi còn bản sao lưu mã hóa.</p>
      </aside>
      {editor && (
        <Modal
          title="Thêm mục mã hóa"
          onClose={() => {
            if (!busy) {
              setEditor(false);
              setValue('');
            }
          }}
        >
          <form className="form-stack" onSubmit={save}>
            <label>
              Nhãn
              <input
                value={label}
                maxLength={160}
                required
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              Danh mục
              <input
                value={category}
                maxLength={60}
                required
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label>
              Vị trí
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as 'vault' | 'bitwarden')}
              >
                <option value="vault">Vault (thông tin ít quan trọng)</option>
                <option value="bitwarden">Chỉ dẫn tới Bitwarden</option>
              </select>
            </label>
            {location === 'vault' && (
              <label>
                Nội dung bí mật
                <textarea
                  value={value}
                  maxLength={50000}
                  required
                  rows={5}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            )}
            <p className="hint">
              Nhãn và danh mục là metadata có thể tìm kiếm. Không nhập bí mật vào nhãn.
            </p>
            <button className="button primary" disabled={busy}>
              Mã hóa & lưu
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.label}
          onClose={() => {
            setSelected(null);
            setSecret('');
          }}
        >
          <p className="vault-secret">{secret}</p>
          <div className="form-footer">
            <button
              className="button secondary"
              onClick={() => {
                setSelected(null);
                setSecret('');
              }}
            >
              <EyeOff size={16} /> Ẩn
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  notify('Đã sao chép. Nội dung có thể còn trong lịch sử clipboard của thiết bị.');
                } catch {
                  notify('Trình duyệt không cho phép sao chép.', true);
                }
              }}
            >
              <Copy size={16} /> Sao chép
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
