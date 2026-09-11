import * as React from 'react';
import { cn } from '@/lib/cn';

export * from './Toast';
export * from './Dialog';
export * from './Tabs';
export * from './Pagination';

/*
 * Design system UI primitives with full dark mode support, accessibility & rich styling.
 */

/* -------------------------------------------------------------------------- */
/*                                  BUTTON                                    */
/* -------------------------------------------------------------------------- */

const buttonVariants = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-400',
  secondary:
    'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 active:bg-slate-100 dark:active:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500',
  accent:
    'bg-accent-500 text-slate-900 hover:bg-accent-400 active:bg-accent-600 disabled:bg-slate-300 dark:disabled:bg-slate-700',
  danger:
    'bg-white dark:bg-slate-800 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-300 dark:ring-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 active:bg-red-100 dark:active:bg-red-900/50',
  ghost:
    'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',
} as const;

const buttonSizes = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(
    'inline-flex select-none items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed',
    buttonVariants[variant],
    buttonSizes[size],
    extra,
  );
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

/* -------------------------------------------------------------------------- */
/*                                   BADGE                                    */
/* -------------------------------------------------------------------------- */

const badgeVariants = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-800',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800',
  red: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-800',
  accent: 'bg-accent-50 text-accent-800 ring-accent-200 dark:bg-accent-950 dark:text-accent-300 dark:ring-accent-800',
  purple: 'bg-purple-50 text-purple-800 ring-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:ring-purple-800',
} as const;

export type BadgeTone = keyof typeof badgeVariants;

export function Badge({
  tone = 'slate',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        badgeVariants[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   CARD                                     */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100', className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 text-sm', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-850/50',
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   ALERT                                    */
/* -------------------------------------------------------------------------- */

const alertVariants = {
  slate: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200',
  red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200',
  brand: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-200',
} as const;

export function Alert({
  tone = 'slate',
  title,
  children,
  className,
  role = 'alert',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: keyof typeof alertVariants;
  title?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-3.5 text-xs', alertVariants[tone], className)} role={role} {...props}>
      {title ? <p className="mb-1 font-bold">{title}</p> : null}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   INPUTS                                   */
/* -------------------------------------------------------------------------- */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-500 dark:focus:ring-brand-500 dark:disabled:bg-slate-800',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-xs transition-colors focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-brand-500 dark:focus:ring-brand-500 dark:disabled:bg-slate-800',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-500 dark:focus:ring-brand-500 dark:disabled:bg-slate-800',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300', className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                EMPTY STATE                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900/50">
      {icon ? <div className="mx-auto mb-3 text-slate-400 dark:text-slate-500">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  SPINNER                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 animate-spin text-current', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   TABLE                                    */
/* -------------------------------------------------------------------------- */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-left text-xs', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-slate-100 dark:divide-slate-800/80', className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn(
        'border-t border-slate-200 bg-slate-50 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-850/80 dark:text-slate-300',
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 align-middle', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 align-middle text-slate-700 dark:text-slate-300', className)} {...props} />
  );
}

/* -------------------------------------------------------------------------- */
/*                                SKELETONS                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-slate-200 dark:bg-slate-800', className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={cn('p-5 space-y-4', className)}>
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={3} />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 STAT TILE                                  */
/* -------------------------------------------------------------------------- */

export type StatTileTone = 'brand' | 'emerald' | 'amber' | 'purple' | 'red' | 'blue' | 'slate';

const statTileTones: Record<StatTileTone, { text: string; bg: string }> = {
  brand: { text: 'text-brand-700 dark:text-brand-400', bg: 'bg-brand-50/50 dark:bg-brand-950/30 border-brand-100 dark:border-brand-900/50' },
  emerald: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50' },
  amber: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50' },
  purple: { text: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50/50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/50' },
  red: { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50/50 dark:bg-red-950/30 border-red-100 dark:border-red-900/50' },
  blue: { text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50' },
  slate: { text: 'text-slate-900 dark:text-slate-100', bg: 'bg-slate-50/50 dark:bg-slate-900 border-slate-200 dark:border-slate-800' },
};

export function StatTile({
  label,
  value,
  tone = 'slate',
  subtext,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatTileTone;
  subtext?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const t = statTileTones[tone];
  return (
    <Card className={cn('border transition-shadow hover:shadow-xs', t.bg, className)}>
      <CardBody className="py-3 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span>{label}</span>
        </div>
        <p className={cn('tnum mt-1 text-2xl font-black', t.text)}>{value}</p>
        {subtext ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
