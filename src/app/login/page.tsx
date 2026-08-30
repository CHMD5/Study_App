import Image from 'next/image';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BRAND } from '@/config/branding';
import { getSession } from '@/lib/session';
import { homeFor } from '@/lib/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

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
          <p className="text-sm text-slate-500 dark:text-slate-400">{BRAND.productName}</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Development only. This block printed the working password to anyone
            who could load the sign-in page, in every environment. */}
        {process.env.NODE_ENV !== 'production' ? (
          <div className="mt-6 rounded-md bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200 transition-colors dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
            <p className="font-medium text-slate-700 dark:text-slate-300">Local build credentials</p>
            <p className="mt-1">
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800 dark:text-slate-200">Teacher</code> or{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800 dark:text-slate-200">Student</code>, password{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800 dark:text-slate-200">112345</code>.
            </p>
            <p className="mt-1.5 text-amber-700 dark:text-amber-400">
              Development credentials, shown only outside production. Delete these accounts before any deployment.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
