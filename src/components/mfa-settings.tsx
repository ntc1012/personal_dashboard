'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { beginMfaEnrollment, finishMfaEnrollment, getMfaStatus } from '@/app/actions';
export default function MfaSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let live = true;
    getMfaStatus().then((r) => {
      if (live) {
        if (r.ok) setEnabled(r.value);
        else setError(r.error);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  async function start() {
    setPending(true);
    setError('');
    try {
      const r = await beginMfaEnrollment();
      if (r.ok) setEnrollment(r.value);
      else setError(r.error);
    } catch {
      setError('Không kết nối được. Hãy thử lại.');
    } finally {
      setPending(false);
    }
  }
  async function finish(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      const r = await finishMfaEnrollment(enrollment!.factorId, code);
      if (r.ok) {
        setEnabled(true);
        setEnrollment(null);
        setCode('');
      } else setError(r.error);
    } catch {
      setError('Không kết nối được. Hãy thử lại.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel settings-card">
      <h2>
        <ShieldCheck size={20} /> Xác thực hai lớp
      </h2>
      <p>
        {enabled
          ? 'Đã bật TOTP. Những lần đăng nhập tiếp theo cần thêm mã từ ứng dụng xác thực.'
          : 'Bảo vệ tài khoản bằng mã từ ứng dụng xác thực trên điện thoại.'}
      </p>
      {enabled === false && !enrollment && (
        <button className="button secondary" disabled={pending} onClick={start}>
          {pending ? 'Đang chuẩn bị…' : 'Thiết lập ứng dụng xác thực'}
        </button>
      )}
      {enrollment && (
        <form className="form-stack" onSubmit={finish}>
          <p className="hint">
            Quét mã bằng ứng dụng xác thực. Giữ quyền truy cập ứng dụng này để tránh mất khả năng
            đăng nhập.
          </p>
          <img
            className="mfa-qr"
            alt="Mã QR thiết lập ứng dụng xác thực, không chia sẻ mã này"
            width={200}
            height={200}
            src={enrollment.qr}
          />
          <label>
            Mã 6 số
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={pending}>
            {pending ? 'Đang kiểm tra…' : 'Xác nhận thiết lập'}
          </button>
        </form>
      )}
      {enabled === null && !error && <p role="status">Đang kiểm tra…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
