import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/config/branding';
import type { Session } from '@/lib/session';
import { LogoutButton } from './LogoutButton';
import { NavLink } from './NavLink';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = { href: string; label: string; exact?: boolean };

export function AppShell({
  session,
  nav,
  children,
}: {
  session: Session;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-[#090d16] dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href={session.role === 'teacher' ? '/teacher' : '/student'} className="flex shrink-0 items-center gap-2.5">
            <Image
              src={BRAND.logoLockup}
              alt={`${BRAND.orgName} — ${BRAND.productName}`}
              width={160}
              height={44}
              priority
              className="h-8.5 w-auto rounded object-contain shadow-xs"
            />
            <span className="hidden font-bold tracking-tight text-brand-700 sm:inline dark:text-brand-400">
              {BRAND.shortName}
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-800 dark:text-slate-200">{session.fullName}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{session.role}</p>
            </div>
            <LogoutButton />
          </div>
        </div>

        {/* Nav collapses to a scrollable strip rather than a hamburger */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 pb-1.5 pt-1 md:hidden dark:border-slate-800">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">{children}</main>

      <footer className="border-t border-slate-200 px-4 py-3 text-center text-[11px] text-slate-400 sm:px-6 dark:border-slate-800 dark:text-slate-500">
        {BRAND.orgName} · local build · all data stored on this machine
      </footer>
    </div>
  );
}
