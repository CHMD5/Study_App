import Image from 'next/image';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BRAND } from '@/config/branding';
import { getSession } from '@/lib/session';
import { homeFor } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src={BRAND.logoMark}
            alt=""
            width={64}
            height={64}
            priority
            className="size-14 rounded-xl shadow-sm"
          />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{BRAND.orgName}</h1>
          <p className="text-sm text-slate-500">{BRAND.productName}</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <div className="mt-6 rounded-md bg-white px-4 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200">
          <p className="font-medium text-slate-700">Local build credentials</p>
          <p className="mt-1">
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">Teacher</code> or{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">Student</code>, password{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">112345</code>.
          </p>
          <p className="mt-1.5 text-amber-700">
            Development credentials. Delete these accounts before any deployment.
          </p>
        </div>
      </div>
    </div>
  );
}
