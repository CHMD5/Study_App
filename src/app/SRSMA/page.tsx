import Image from 'next/image';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BRAND } from '@/config/branding';
import { getSession } from '@/lib/session';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TeacherLoginForm } from './TeacherLoginForm';

export const metadata = { title: 'Faculty Portal | SRSMA' };

export default async function TeacherSecretLoginPage() {
  const session = await getSession();
  if (session && session.role === 'teacher') {
    redirect('/teacher');
  }

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
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Faculty & Administration Portal</p>
          <div className="mt-2 inline-flex items-center rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            Restricted Staff Access
          </div>
        </div>

        <Suspense>
          <TeacherLoginForm />
        </Suspense>

        {process.env.NODE_ENV !== 'production' ? (
          <div className="mt-6 rounded-xl bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200 transition-colors dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
            <p className="font-semibold text-slate-700 dark:text-slate-300">Staff Development Credentials</p>
            <p className="mt-1">
              Username: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">Teacher</code>,
              Password: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">112345</code>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
