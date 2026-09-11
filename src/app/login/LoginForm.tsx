'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Input, Label } from '@/components/ui';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 India (+91)' },
  { code: '+1', label: '🇺🇸 US / Canada (+1)' },
  { code: '+44', label: '🇬🇧 UK (+44)' },
  { code: '+971', label: '🇦🇪 UAE (+971)' },
  { code: '+65', label: '🇸🇬 Singapore (+65)' },
  { code: '+61', label: '🇦🇺 Australia (+61)' },
  { code: '+966', label: '🇸🇦 Saudi Arabia (+966)' },
  { code: '+974', label: '🇶🇦 Qatar (+974)' },
  { code: '+968', label: '🇴🇲 Oman (+968)' },
  { code: '+965', label: '🇰🇼 Kuwait (+965)' },
  { code: '+973', label: '🇧🇭 Bahrain (+973)' },
  { code: '+49', label: '🇩🇪 Germany (+49)' },
  { code: '+33', label: '🇫🇷 France (+33)' },
  { code: '+81', label: '🇯🇵 Japan (+81)' },
  { code: '+60', label: '🇲🇾 Malaysia (+60)' },
  { code: '+977', label: '🇳🇵 Nepal (+977)' },
  { code: '+880', label: '🇧🇩 Bangladesh (+880)' },
  { code: '+94', label: '🇱🇰 Sri Lanka (+94)' },
  { code: 'other', label: '🌐 Other (Enter code)' },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [selectedCode, setSelectedCode] = useState('+91');
  const [customCode, setCustomCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notice =
    params.get('reason') === 'session_expired'
      ? 'Your session expired. Please sign in again.'
      : null;

  const effectiveCountryCode = selectedCode === 'other' ? customCode : selectedCode;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 7) {
      setError('Please enter a valid phone number (at least 7 digits).');
      setBusy(false);
      return;
    }

    if (selectedCode === 'other' && !customCode.trim()) {
      setError('Please enter your country code (e.g. +91).');
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanDigits,
          countryCode: effectiveCountryCode,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.message ?? 'Sign-in failed. Please verify your phone number.');
        return;
      }

      router.replace(body.homeUrl || '/student');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please check your internet connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-200/80 transition-colors dark:bg-slate-900 dark:ring-slate-800"
      aria-label="Student sign in"
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

      <div className="mb-5">
        <Label htmlFor="phone-input" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Mobile Number
        </Label>
        <div className="flex gap-2">
          {/* Country Code Selector */}
          <div className={selectedCode === 'other' ? 'w-28 flex-shrink-0' : 'w-36 flex-shrink-0'}>
            <select
              id="country-code-select"
              aria-label="Country Code"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* If 'other' is selected, provide custom country code text input */}
          {selectedCode === 'other' && (
            <div className="w-20 flex-shrink-0">
              <Input
                id="custom-country-code"
                placeholder="+XX"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                className="text-center font-mono text-sm"
                required
              />
            </div>
          )}

          {/* Phone Number Input */}
          <div className="flex-1">
            <Input
              id="phone-input"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              onChange={(e) => {
                // allow numbers and spaces
                const val = e.target.value.replace(/[^\d\s-]/g, '');
                setPhone(val);
              }}
              placeholder="e.g. 98765 43210"
              className="text-base tracking-wide"
              required
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Enter your registered or primary mobile number to sign in.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-xl bg-brand-700 py-2.5 text-base font-medium shadow-sm transition hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500"
        disabled={busy}
      >
        {busy ? 'Signing in…' : 'Sign in as Student'}
      </Button>
    </form>
  );
}
