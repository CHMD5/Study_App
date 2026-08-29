import * as React from 'react';
import { cn } from '@/lib/cn';

/*
 * A small hand-rolled primitive set in the shadcn/ui shape.
 *
 * The plan called for shadcn/ui; its CLI is interactive and pulls a Radix tree
 * we would use perhaps 5% of. These cover every control stages 0-5 need, with
 * the same prop API, so swapping in the real thing later is a file deletion.
 */

const buttonVariants = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  accent: 'bg-accent-500 text-slate-900 hover:bg-accent-400 active:bg-accent-600 disabled:bg-slate-300',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 active:bg-red-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
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
          'h-9 w-full rounded-md bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300',
          'placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-500',
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
        'w-full rounded-md bg-white p-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300',
        'placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500',
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
        'h-9 w-full rounded-md bg-white px-2.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300',
        'focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100',
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500', className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg bg-white shadow-sm ring-1 ring-slate-200', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-slate-200 px-5 py-3.5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold text-slate-900', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

const badgeTones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
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
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
    brand: 'bg-brand-50 text-brand-800 ring-brand-200',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p> : null}
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
