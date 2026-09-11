import Image from 'next/image';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BRAND } from '@/config/branding';
import { getSession } from '@/lib/session';
import { homeFor } from '@/lib/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Student Sign In | SRSMA' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 transition-colors dark:bg-[#090d16]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src={BRAND.logoMark}
            alt=""
            width={72}
            height={72}
            priority
            className="size-16 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
          />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{BRAND.orgName}</h1>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{BRAND.productName}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Student Portal</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {process.env.NODE_ENV !== 'production' ? (
          <div className="mt-6 rounded-xl bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200 transition-colors dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
            <p className="font-semibold text-slate-700 dark:text-slate-300">Quick Demo Access</p>
            <p className="mt-1">
              Enter any 10-digit mobile number or demo student number{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-300">
                9876543210
              </code>
              . No password needed.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
