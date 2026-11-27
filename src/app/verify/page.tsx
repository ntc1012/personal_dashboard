import { redirect } from 'next/navigation';
import { ownerSession } from '@/lib/supabase/server';
import MfaForm from '@/components/mfa-form';
import { logout } from '@/app/actions';
export const dynamic = 'force-dynamic';
export default async function Verify() {
  let needsMfa = false;
  try {
    needsMfa = (await ownerSession()).needsMfa;
  } catch {
    redirect('/login');
  }
  if (!needsMfa) redirect('/');
  return (
    <main className="setup-page">
      <div className="wordmark">
        J.A.R.V.I.S<span> / PERSONAL SYSTEM</span>
      </div>
      <div className="setup-card">
        <span className="eyebrow">THÊM MỘT LỚP BẢO VỆ</span>
        <h1>
          Xác thực
          <br />
          để tiếp tục.
        </h1>
        <p>Nhập mã 6 số từ ứng dụng xác thực của bạn.</p>
        <MfaForm />
        <form action={logout}>
          <button className="button secondary" style={{ marginTop: 20 }}>
            Đăng xuất
          </button>
        </form>
      </div>
    </main>
  );
}
