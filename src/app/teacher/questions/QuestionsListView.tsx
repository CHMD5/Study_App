'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Input, Select, Spinner } from '@/components/ui';
import type { Question } from '@/db/schema';

const SUBJECTS = ['physics', 'chemistry', 'maths'] as const;
const STATUSES = ['draft', 'verified', 'archived'] as const;
const TYPES = ['mcq', 'integer'] as const;

const STATUS_TONE = { draft: 'amber', verified: 'green', archived: 'slate' } as const;

export function QuestionsListView() {
  const initialParams = useSearchParams();

  // Seed every filter from the URL, not just paperId. The Overview page links
  // to /teacher/questions?status=verified, and that parameter used to be read
  // and then ignored, so the tile silently did nothing.
  const [subject, setSubject] = useState(initialParams.get('subject') ?? '');
  const [status, setStatus] = useState(initialParams.get('status') ?? '');
  const [type, setType] = useState(initialParams.get('type') ?? '');
  const [search, setSearch] = useState(initialParams.get('q') ?? '');
  const [paperId] = useState(initialParams.get('paperId') ?? '');

  const [rows, setRows] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Changing a filter must reset to page 1, or you land on an out-of-range page
  // of the new result set.
  useEffect(() => {
    setPage(1);
  }, [subject, status, type, search, paperId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (search) params.set('q', search);
    if (paperId) params.set('paperId', paperId);
    params.set('page', String(page));

    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/questions?${params.toString()}`)
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.message ?? 'Could not load questions.');
          return body;
        })
        .then((body) => {
          setRows(body.questions ?? []);
          setTotal(body.total ?? 0);
          setPageCount(body.pageCount ?? 1);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not load questions.');
          setRows([]);
        })
        .finally(() => setLoading(false));
    }, 250); // debounce the free-text search

    return () => clearTimeout(handle);
  }, [subject, status, type, search, paperId, page]);

  async function onDelete(q: Question) {
    if (!confirm(`Delete question ${q.humanCode ?? q.id}? This cannot be undone.`)) return;
    const res = await fetch(`/api/questions/${q.id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== q.id));
      setTotal((t) => t - 1);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Could not delete this question.');
    }
  }

  const first = total === 0 ? 0 : (page - 1) * 30 + 1;
  const last = (page - 1) * 30 + rows.length;

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
            <option value="">All subjects</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text…"
            aria-label="Search"
          />
        </div>
      </Card>

      {error ? <Alert tone="red">{error}</Alert> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-brand-600 dark:text-brand-400" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No questions match these filters"
          hint="Try clearing a filter, or upload questions directly."
          action={
            <Link
              href="/teacher/questions/upload"
              className="inline-flex items-center justify-center rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Upload questions
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((q) => (
              <li key={q.id} className="flex items-start gap-1 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <Link href={`/teacher/questions/${q.id}`} className="flex min-w-0 flex-1 items-start gap-3 px-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800 dark:text-slate-200">{stripLatex(q.body)}</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {q.humanCode} · {q.subject} · {q.type}
                      {q.chapter ? ` · ${q.chapter}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {q.difficulty ? <Badge>D{q.difficulty}</Badge> : null}
                    <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                  </div>
                </Link>
                <button
                  onClick={() => onDelete(q)}
                  aria-label={`Delete question ${q.humanCode ?? q.id}`}
                  className="mt-2 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {/* Pagination. The API has always paged at 30 and returned a total,
              but nothing ever sent `page` — so the bank was capped at its first
              30 questions and everything beyond was unreachable. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
            <p className="tnum text-xs text-slate-400 dark:text-slate-500">
              Showing {first}–{last} of {total}
            </p>

            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <span className="tnum text-xs text-slate-500 dark:text-slate-400">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** A one-line plain-text digest of a question body for the list. */
function stripLatex(body: string): string {
  return body
    .replace(/\[\[IMG:[^\]]+\]\]/g, '[image]')
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    // Reduce LaTeX commands to something readable rather than leaving raw
    // `\frac{1}{2}` in the preview.
    .replace(/\\[a-zA-Z]+\s*/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
