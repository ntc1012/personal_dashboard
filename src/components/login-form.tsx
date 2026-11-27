'use client';
import { useActionState } from 'react';
import { login } from '@/app/actions';
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: '' });
  return (
    <form action={action} className="form-stack">
      <label>
        Email
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label>
        Mật khẩu
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
