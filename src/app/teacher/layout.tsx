import { requireTeacher } from '@/lib/auth';
import { AppShell, type NavItem } from '@/components/AppShell';

const NAV: NavItem[] = [
  { href: '/teacher', label: 'Overview', exact: true },
  { href: '/teacher/papers', label: 'Papers' },
  { href: '/teacher/questions', label: 'Question bank' },
  { href: '/teacher/extraction-prompt', label: 'Extraction prompt' },
  { href: '/teacher/tests', label: 'Tests' },
  { href: '/teacher/analytics', label: 'Analytics' },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTeacher();
  return (
    <AppShell session={session} nav={NAV}>
      {children}
    </AppShell>
  );
}
