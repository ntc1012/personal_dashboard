import { redirect } from 'next/navigation';
import { isConfigured } from '@/lib/supabase/server';
import LoginForm from '@/components/login-form';
export const dynamic = 'force-dynamic';
export default function Login() {
  if (!isConfigured()) redirect('/');
  return (
    <main className="setup-page">
      <a className="wordmark" href="/">
        J.A.R.V.I.S<span> / PERSONAL SYSTEM</span>
      </a>
      <div className="setup-card">
        <span className="eyebrow">KHÔNG GIAN RIÊNG CỦA BẠN</span>
        <h1>Chào mừng trở lại.</h1>
        <p>Đăng nhập để tiếp tục những điều đang làm.</p>
        <LoginForm />
      </div>
    </main>
  );
}
