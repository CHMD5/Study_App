'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Filter,
  FolderEdit,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Label,
  Pagination,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';
import { QuestionBody } from '@/components/Katex';
import type { Question } from '@/db/schema';

const SUBJECTS = ['physics', 'chemistry', 'maths', 'biology'] as const;
const STATUSES = ['draft', 'verified', 'archived'] as const;
const TYPES = ['mcq', 'integer'] as const;

const STATUS_TONE = { draft: 'amber', verified: 'green', archived: 'slate' } as const;

export function QuestionsListView() {
  const initialParams = useSearchParams();
  const { toast } = useToast();

  const [subject, setSubject] = useState(initialParams.get('subject') ?? '');
  const [status, setStatus] = useState(initialParams.get('status') ?? '');
  const [type, setType] = useState(initialParams.get('type') ?? '');
  const [chapter, setChapter] = useState(initialParams.get('chapter') ?? '');
  const [search, setSearch] = useState(initialParams.get('q') ?? '');
  const [paperId, setPaperId] = useState(initialParams.get('paperId') ?? '');
  const [unresolvedImages, setUnresolvedImages] = useState(initialParams.get('unresolvedImages') ?? '');

  const [rows, setRows] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Taxonomy options
  const [taxonomyChapters, setTaxonomyChapters] = useState<Array<{ subject: string; chapter: string; count: number }>>([]);
  const [taxonomyPapers, setTaxonomyPapers] = useState<Array<{ id: string; title: string; code: string }>>([]);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action modals
  const [bulkActionSubmitting, setBulkActionSubmitting] = useState(false);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [bulkChapter, setBulkChapter] = useState('');
  const [bulkTopic, setBulkTopic] = useState('');

  const [difficultyModalOpen, setDifficultyModalOpen] = useState(false);
  const [bulkDifficulty, setBulkDifficulty] = useState('5');

  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Single delete
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load taxonomy
  useEffect(() => {
    fetch('/api/questions/taxonomy')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setTaxonomyChapters(data.chapters ?? []);
          setTaxonomyPapers(data.papers ?? []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [subject, status, type, chapter, search, paperId, unresolvedImages]);

  function loadQuestions() {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (chapter) params.set('chapter', chapter);
    if (search) params.set('q', search);
    if (paperId) params.set('paperId', paperId);
    if (unresolvedImages) params.set('unresolvedImages', unresolvedImages);
    params.set('page', String(page));

    setLoading(true);
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
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      loadQuestions();
    }, 250);

    return () => clearTimeout(handle);
  }, [subject, status, type, chapter, search, paperId, unresolvedImages, page]);

  // Selection handlers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  // Bulk Verify
  async function handleBulkVerify() {
    if (selectedIds.size === 0) return;
    setBulkActionSubmitting(true);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: Array.from(selectedIds),
          action: 'verify',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Bulk verify failed');

      toast.success(json.message);
      setSelectedIds(new Set());
      loadQuestions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkActionSubmitting(false);
    }
  }

  // Bulk Archive
  async function handleBulkArchive() {
    if (selectedIds.size === 0) return;
    setBulkActionSubmitting(true);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: Array.from(selectedIds),
          action: 'archive',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Bulk archive failed');

      toast.success(json.message);
      setSelectedIds(new Set());
      loadQuestions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkActionSubmitting(false);
    }
  }

  // Bulk Set Chapter
  async function handleBulkSetChapter(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    setBulkActionSubmitting(true);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: Array.from(selectedIds),
          action: 'set_chapter',
          chapter: bulkChapter.trim() || null,
          topic: bulkTopic.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Bulk update failed');

      toast.success(json.message);
      setChapterModalOpen(false);
      setSelectedIds(new Set());
      setBulkChapter('');
      setBulkTopic('');
      loadQuestions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkActionSubmitting(false);
    }
  }

  // Bulk Set Difficulty
  async function handleBulkSetDifficulty(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    setBulkActionSubmitting(true);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: Array.from(selectedIds),
          action: 'set_difficulty',
          difficulty: Number(bulkDifficulty),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Bulk difficulty update failed');

      toast.success(json.message);
      setDifficultyModalOpen(false);
      setSelectedIds(new Set());
      loadQuestions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkActionSubmitting(false);
    }
  }

  // Bulk Delete
  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkActionSubmitting(true);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: Array.from(selectedIds),
          action: 'delete',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Bulk delete failed');

      toast.success(json.message);
      setBulkDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      loadQuestions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkActionSubmitting(false);
    }
  }

  // Single Delete
  async function performDelete(q: Question) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/questions/${q.id}`, { method: 'DELETE' });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== q.id));
        setTotal((t) => t - 1);
        toast.success(`Deleted question ${q.humanCode ?? q.id}`);
        setDeleteTarget(null);
      } else {
        const body = await res.json().catch(() => ({}));
        const msg = body.message ?? 'Could not delete this question.';
        setError(msg);
        toast.error(msg);
      }
    } catch {
      toast.error('Network error: Could not connect to server.');
    } finally {
      setDeleting(false);
    }
  }

  const filteredTaxonomyChapters = subject
    ? taxonomyChapters.filter((c) => c.subject === subject)
    : taxonomyChapters;

  return (
    <div className="mt-6 space-y-4">
      {/* Filters Toolbar */}
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

          <Select value={chapter} onChange={(e) => setChapter(e.target.value)} aria-label="Chapter">
            <option value="">All chapters</option>
            {filteredTaxonomyChapters.map((c) => (
              <option key={`${c.subject}-${c.chapter}`} value={c.chapter}>
                {c.chapter} ({c.count})
              </option>
            ))}
          </Select>

          <Select value={paperId} onChange={(e) => setPaperId(e.target.value)} aria-label="Source paper">
            <option value="">All papers</option>
            {taxonomyPapers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.title}
              </option>
            ))}
          </Select>

          <Select
            value={unresolvedImages}
            onChange={(e) => setUnresolvedImages(e.target.value)}
            aria-label="Filter images"
          >
            <option value="">All image states</option>
            <option value="true">Has unresolved images</option>
          </Select>

          {(subject || status || type || chapter || search || paperId || unresolvedImages) && (
            <div className="flex items-center">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setSubject('');
                  setStatus('');
                  setType('');
                  setChapter('');
                  setSearch('');
                  setPaperId('');
                  setUnresolvedImages('');
                }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/90 p-3 shadow-md backdrop-blur-sm dark:border-brand-900 dark:bg-brand-950/90">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand-900 dark:text-brand-100">
              {selectedIds.size} question{selectedIds.size === 1 ? '' : 's'} selected
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs"
            >
              Clear
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkVerify}
              disabled={bulkActionSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 size-3.5" />
              Verify Selected
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setChapterModalOpen(true)}
              disabled={bulkActionSubmitting}
            >
              <FolderEdit className="mr-1.5 size-3.5" />
              Set Chapter
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDifficultyModalOpen(true)}
              disabled={bulkActionSubmitting}
            >
              <Sliders className="mr-1.5 size-3.5" />
              Set Difficulty
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkArchive}
              disabled={bulkActionSubmitting}
            >
              <Archive className="mr-1.5 size-3.5" />
              Archive
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkDeleteConfirmOpen(true)}
              disabled={bulkActionSubmitting}
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {error ? <Alert tone="red">{error}</Alert> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-8 text-brand-600 dark:text-brand-400" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No questions match these filters"
          hint="Try clearing a filter, or upload questions directly into the bank."
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
          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.size === rows.length && rows.length > 0}
                onChange={toggleSelectAll}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                aria-label="Select all questions on this page"
              />
              <span>Showing {rows.length} of {total} question{total === 1 ? '' : 's'}</span>
            </div>
          </div>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((q) => {
              const isSelected = selectedIds.has(q.id);
              return (
                <li
                  key={q.id}
                  className={`flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    isSelected ? 'bg-brand-50/30 dark:bg-brand-950/20' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(q.id)}
                    className="mt-1 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    aria-label={`Select question ${q.humanCode ?? q.id}`}
                  />

                  <Link href={`/teacher/questions/${q.id}`} className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand-800 dark:text-brand-300">
                        {q.humanCode ?? q.id.slice(0, 8)}
                      </span>
                      <Badge
                        tone={
                          q.subject === 'physics'
                            ? 'brand'
                            : q.subject === 'chemistry'
                              ? 'green'
                              : q.subject === 'maths'
                                ? 'amber'
                                : 'purple'
                        }
                      >
                        {q.subject}
                      </Badge>
                      <Badge tone="slate">{q.type.toUpperCase()}</Badge>
                      <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                      {q.difficulty ? <Badge tone="slate">D{q.difficulty}</Badge> : null}
                      {q.chapter ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">· {q.chapter}</span>
                      ) : null}
                    </div>

                    {/* KaTeX math rendered question preview */}
                    <div className="line-clamp-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      <QuestionBody
                        body={q.body}
                        renderImage={(imgId) => (
                          <span className="inline-flex items-center rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            [Figure: {imgId}]
                          </span>
                        )}
                      />
                    </div>
                  </Link>

                  <button
                    onClick={() => setDeleteTarget(q)}
                    aria-label={`Delete question ${q.humanCode ?? q.id}`}
                    className="mt-1 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <Pagination
              currentPage={page}
              totalPages={pageCount}
              pageSize={30}
              totalItems={total}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        </Card>
      )}

      {/* Bulk Set Chapter Modal */}
      <Dialog
        isOpen={chapterModalOpen}
        onClose={() => !bulkActionSubmitting && setChapterModalOpen(false)}
        title={`Set Chapter & Topic (${selectedIds.size} questions)`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={bulkActionSubmitting}
              onClick={() => setChapterModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="bulk-chapter-form" disabled={bulkActionSubmitting}>
              {bulkActionSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Update Questions
            </Button>
          </div>
        }
      >
        <form id="bulk-chapter-form" onSubmit={handleBulkSetChapter} className="space-y-3.5">
          <div>
            <Label>Chapter Name *</Label>
            <Input
              required
              value={bulkChapter}
              onChange={(e) => setBulkChapter(e.target.value)}
              placeholder="e.g. Thermodynamics, Rotational Motion…"
              list="chapter-options"
            />
            <datalist id="chapter-options">
              {taxonomyChapters.map((c) => (
                <option key={`${c.subject}-${c.chapter}`} value={c.chapter} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Topic Name (Optional)</Label>
            <Input
              value={bulkTopic}
              onChange={(e) => setBulkTopic(e.target.value)}
              placeholder="e.g. Carnot Engine, Moment of Inertia…"
            />
          </div>
        </form>
      </Dialog>

      {/* Bulk Set Difficulty Modal */}
      <Dialog
        isOpen={difficultyModalOpen}
        onClose={() => !bulkActionSubmitting && setDifficultyModalOpen(false)}
        title={`Set Difficulty (${selectedIds.size} questions)`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={bulkActionSubmitting}
              onClick={() => setDifficultyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="bulk-diff-form" disabled={bulkActionSubmitting}>
              {bulkActionSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Apply Difficulty
            </Button>
          </div>
        }
      >
        <form id="bulk-diff-form" onSubmit={handleBulkSetDifficulty} className="space-y-3.5">
          <div>
            <Label>Difficulty Level (1 = Easy, 10 = Hard)</Label>
            <Select value={bulkDifficulty} onChange={(e) => setBulkDifficulty(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                <option key={d} value={d}>
                  Difficulty {d} {d <= 3 ? '(Easy)' : d <= 7 ? '(Medium)' : '(Advanced)'}
                </option>
              ))}
            </Select>
          </div>
        </form>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => !bulkActionSubmitting && setBulkDeleteConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        loading={bulkActionSubmitting}
        title="Delete Selected Questions"
        description={`Are you sure you want to delete ${selectedIds.size} question(s)? Any questions already assigned to tests will be skipped automatically.`}
        confirmText="Delete Questions"
        tone="danger"
      />

      {/* Single Delete Question Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) return performDelete(deleteTarget);
        }}
        loading={deleting}
        title="Delete Question"
        description={`Are you sure you want to delete question ${deleteTarget?.humanCode ?? deleteTarget?.id}? This action cannot be undone.`}
        confirmText="Delete Question"
        tone="danger"
      />
    </div>
  );
}
