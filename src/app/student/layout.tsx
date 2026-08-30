import { requireStudent } from '@/lib/auth';
import { AppShell, type NavItem } from '@/components/AppShell';

const NAV: NavItem[] = [
  { href: '/student', label: 'My tests', exact: true },
  { href: '/student/analytics', label: 'Analytics' },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStudent();
  return (
    <AppShell session={session} nav={NAV}>
      {children}
    </AppShell>
  );
}
