import * as React from 'react';
import { cn } from '@/lib/cn';

/*
 * A small hand-rolled primitive set in the shadcn/ui shape with dark mode support.
 */

const buttonVariants = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-400',
  secondary:
    'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 active:bg-slate-100 dark:active:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500',
  accent: 'bg-accent-500 text-slate-900 hover:bg-accent-400 active:bg-accent-600 disabled:bg-slate-300 dark:disabled:bg-slate-700',
  danger: 'bg-white dark:bg-slate-800 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-300 dark:ring-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 active:bg-red-100 dark:active:bg-red-900/50',
  ghost: 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',
} as const;

const buttonSizes = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

/** For a Link (or any non-<button> element) that should look like a Button. */
export function buttonClass(
  variant: keyof typeof buttonVariants = 'primary',
  size: keyof typeof buttonSizes = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex select-none items-center justify-center rounded-md font-medium transition-colors',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
});

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-700',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400',
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
        'w-full rounded-md bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-700',
        'placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500',
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md bg-white dark:bg-slate-900 px-2.5 text-sm text-slate-900 dark:text-slate-100 ring-1 ring-inset ring-slate-300 dark:ring-slate-700',
        'focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100 dark:disabled:bg-slate-800',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400', className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-slate-200 dark:border-slate-800 px-5 py-3.5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-slate-900 dark:text-slate-100', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

const badgeTones = {
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700',
  brand: 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 ring-brand-200 dark:ring-brand-800/60',
  green: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800/60',
  amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-800/60',
  red: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-800/60',
} as const;

export function Badge({
  tone = 'slate',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  tone = 'slate',
  title,
  children,
  className,
  ...rest
}: {
  tone?: keyof typeof badgeTones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const tones = {
    slate: 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700',
    brand: 'bg-brand-50 dark:bg-brand-950/60 text-brand-800 dark:text-brand-200 ring-brand-200 dark:ring-brand-800',
    green: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 ring-amber-200 dark:ring-amber-800',
    red: 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-200 ring-red-200 dark:ring-red-800',
  } as const;
  return (
    <div className={cn('rounded-md px-3.5 py-3 text-sm ring-1 ring-inset', tones[tone], className)} {...rest}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]',
        className,
      )}
    />
  );
}
