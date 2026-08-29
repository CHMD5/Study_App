import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { homeFor } from '@/lib/auth';

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? homeFor(session.role) : '/login');
}
