'use client';

import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open]);

  return (
    <div className={cn('relative inline-block text-left', className)} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Current theme: ${theme}. Click to change.`}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="size-4 text-brand-400 transition-transform" />
        ) : (
          <Sun className="size-4 text-amber-500 transition-transform" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-36 origin-top-right rounded-lg border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-800 dark:ring-white/5">
          <button
            type="button"
            onClick={() => {
              setTheme('system');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              theme === 'system'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white',
            )}
          >
            <Laptop className="size-3.5" />
            <span>System</span>
            {theme === 'system' && <Check className="ml-auto size-3.5 text-brand-600 dark:text-brand-400" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('light');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              theme === 'light'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white',
            )}
          >
            <Sun className="size-3.5 text-amber-500" />
            <span>Light</span>
            {theme === 'light' && <Check className="ml-auto size-3.5 text-brand-600 dark:text-brand-400" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              theme === 'dark'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white',
            )}
          >
            <Moon className="size-3.5 text-brand-400" />
            <span>Dark</span>
            {theme === 'dark' && <Check className="ml-auto size-3.5 text-brand-600 dark:text-brand-400" />}
          </button>
        </div>
      )}
    </div>
  );
}
