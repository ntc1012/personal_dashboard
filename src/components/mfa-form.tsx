'use client';
import { useActionState } from 'react';
import { verifyMfa } from '@/app/actions';
export default function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfa, { error: '' });
  return (
    <form action={action} className="form-stack">
      <label>
        Mã xác thực
        <input
          autoFocus
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          placeholder="000000"
        />
      </label>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? 'Đang xác thực…' : 'Xác thực'}
      </button>
    </form>
  );
}
