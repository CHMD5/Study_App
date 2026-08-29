'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from './ui';

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    start(() => {
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={signOut} disabled={busy || pending}>
      <LogOut className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
