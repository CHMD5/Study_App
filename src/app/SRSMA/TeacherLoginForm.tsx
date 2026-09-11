'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Input, Label } from '@/components/ui';

export function TeacherLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notice =
    params.get('reason') === 'session_expired'
      ? 'Your session expired. Please sign in again.'
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          teacherOnly: true,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.message ?? 'Faculty authentication failed. Check credentials.');
        return;
      }

      router.replace(body.homeUrl || '/teacher');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200/80 transition-colors dark:bg-slate-900 dark:ring-slate-800"
      aria-label="Faculty sign in"
    >
      {notice ? (
        <Alert tone="brand" className="mb-4 text-xs">
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="red" className="mb-4 text-xs" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className="mb-4">
        <Label htmlFor="teacher-username" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Faculty Username
        </Label>
        <Input
          id="teacher-username"
          name="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. Teacher"
          required
        />
      </div>

      <div className="mb-5">
        <Label htmlFor="teacher-password" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Password
        </Label>
        <Input
          id="teacher-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-xl bg-slate-900 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-500"
        disabled={busy}
      >
        {busy ? 'Authenticating…' : 'Sign in to Faculty Portal'}
      </Button>
    </form>
  );
}
