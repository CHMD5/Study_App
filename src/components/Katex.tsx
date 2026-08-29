'use client';

import 'katex/contrib/mhchem';
import katex from 'katex';
import { useMemo } from 'react';
import { parseBody } from '@/lib/question-render';

/** Renders a single LaTeX expression. Throws are caught and shown inline as a
 * red error rather than blowing up the whole page — the editor's live preview
 * (stage 5) relies on being able to catch this per-expression. */
export function KatexSpan({ tex, display = false }: { tex: string; display?: boolean }) {
  const result = useMemo(() => {
    try {
      const html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: true,
        strict: 'warn',
        trust: false,
      });
      return { ok: true as const, html };
    } catch (err) {
      return { ok: false as const, message: (err as Error).message };
    }
  }, [tex, display]);

  if (!result.ok) {
    return (
      <span
        className="rounded bg-red-50 px-1 font-mono text-xs text-red-700 ring-1 ring-inset ring-red-200"
        title={result.message}
      >
        LaTeX error: {tex}
      </span>
    );
  }
  // KaTeX's output is its own trusted, self-generated markup (trust:false above
  // means it also refuses \href/\includegraphics-style escapes within the TeX
  // itself) — safe to inject as-is.
  return <span dangerouslySetInnerHTML={{ __html: result.html }} />;
}

export type ImageResolver = (placeholderId: string) => React.ReactNode;

/**
 * Renders a full question `body`: plain text/markdown-lite passed through as-is
 * (line breaks, **bold**, tables), $inline$ and $$display$$ math via KaTeX, and
 * [[IMG:id]] placeholders via the caller-supplied resolver — the editor (stage
 * 5) resolves them to an <img>, the crop tool resolves them to "unresolved"
 * chips.
 */
export function QuestionBody({
  body,
  renderImage,
  className,
}: {
  body: string;
  renderImage: ImageResolver;
  className?: string;
}) {
  const segments = useMemo(() => parseBody(body), [body]);

  return (
    <div className={`q-render whitespace-pre-wrap break-words ${className ?? ''}`}>
      {segments.map((seg, i) => {
        if (seg.kind === 'math') return <KatexSpan key={i} tex={seg.tex} display={seg.display} />;
        if (seg.kind === 'image') return <span key={i}>{renderImage(seg.placeholderId)}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}
