'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export type ToastOptions = {
  id?: string;
  title?: string;
  tone?: ToastTone;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export type ToastItem = {
  id: string;
  message: React.ReactNode;
  title?: string;
  tone: ToastTone;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type ToastContextValue = {
  toast: {
    (message: React.ReactNode, options?: ToastOptions): string;
    success: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) => string;
    error: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) => string;
    info: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) => string;
    warning: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) => string;
  };
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toneIcons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
  error: <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />,
  warning: <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />,
  info: <Info className="size-4 shrink-0 text-brand-600 dark:text-brand-400" />,
};

const toneCardStyles: Record<ToastTone, string> = {
  success: 'border-l-4 border-l-emerald-500',
  error: 'border-l-4 border-l-red-500',
  warning: 'border-l-4 border-l-amber-500',
  info: 'border-l-4 border-l-brand-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = React.useCallback(() => {
    setToasts([]);
  }, []);

  const addToast = React.useCallback(
    (message: React.ReactNode, options?: ToastOptions): string => {
      const id = options?.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tone = options?.tone || 'info';
      const duration = options?.duration !== undefined ? options.duration : 4000;

      const newToast: ToastItem = {
        id,
        message,
        title: options?.title,
        tone,
        duration,
        action: options?.action,
      };

      setToasts((prev) => [...prev.filter((t) => t.id !== id), newToast]);
      return id;
    },
    [],
  );

  const toastApi = React.useMemo(() => {
    return Object.assign(
      (message: React.ReactNode, options?: ToastOptions) => addToast(message, options),
      {
        success: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) =>
          addToast(message, { ...options, tone: 'success' }),
        error: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) =>
          addToast(message, { ...options, tone: 'error' }),
        info: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) =>
          addToast(message, { ...options, tone: 'info' }),
        warning: (message: React.ReactNode, options?: Omit<ToastOptions, 'tone'>) =>
          addToast(message, { ...options, tone: 'warning' }),
      },
    );
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast: toastApi, dismiss, clear }}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm w-full flex-col gap-2 p-2 sm:bottom-6 sm:right-6"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  React.useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(onDismiss, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-lg bg-white p-3.5 shadow-lg ring-1 ring-slate-200 transition-all dark:bg-slate-900 dark:ring-slate-800',
        toneCardStyles[item.tone],
      )}
    >
      <div className="mt-0.5">{toneIcons[item.tone]}</div>
      <div className="flex-1 min-w-0">
        {item.title ? (
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
        ) : null}
        <div className={cn('text-xs text-slate-700 dark:text-slate-300', item.title && 'mt-0.5')}>
          {item.message}
        </div>
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="size-5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
