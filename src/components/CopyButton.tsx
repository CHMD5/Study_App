'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from './ui';
import { cn } from '@/lib/cn';

/**
 * The button you will press a hundred times during digitization. Backs every
 * copy affordance in the teacher UI: the extraction prompt (full page and
 * collapsed-on-ingest), the truncation-recovery prompt, and the download link.
 *
 * navigator.clipboard requires a secure context; localhost qualifies, so this
 * should always take the fast path. The execCommand fallback exists only for
 * an unexpected 127.0.0.1-vs-localhost edge case.
 */
export function CopyButton({
  text,
  label = 'Copy prompt',
  copiedLabel = 'Copied',
  variant = 'primary',
  size = 'md',
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        legacyCopy(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        legacyCopy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setFailed(true);
        setTimeout(() => setFailed(false), 2500);
      }
    }
  }

  return (
    <Button
      type="button"
      variant={failed ? 'danger' : copied ? 'secondary' : variant}
      size={size}
      onClick={copy}
      className={cn('shrink-0', className)}
      aria-live="polite"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {failed ? 'Copy failed — select & Ctrl+C' : copied ? copiedLabel : label}
    </Button>
  );
}

function legacyCopy(text: string): void {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('execCommand copy failed');
}
