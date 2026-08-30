'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { CheckCircle2, Columns2, FileText, Trash2, UploadCloud } from 'lucide-react';
import { Alert, Badge, Button, buttonClass, Card, CardBody, EmptyState, Input, Label, Spinner } from '@/components/ui';
import type { Paper } from '@/db/schema';

export function PapersView({ initialPapers }: { initialPapers: Paper[] }) {
  const router = useRouter();
  const [papers, setPapers] = useState(initialPapers);
  const [showForm, setShowForm] = useState(initialPapers.length === 0);

  function onCreated(paper: Paper) {
    setPapers((prev) => [paper, ...prev]);
    setShowForm(false);
  }

  async function onDelete(paper: Paper) {
    if (!confirm(`Delete "${paper.title}"? This cannot be undone.`)) return;

    let res = await fetch(`/api/papers/${paper.id}`, { method: 'DELETE' });

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body.error === 'paper_has_questions') {
        const count = body.questionCount ?? 'some';
        const confirmCascade = confirm(
          `${count} question(s) were extracted from "${paper.title}" and still exist. ` +
            `Delete the paper AND all ${count} question(s)? This cannot be undone.`,
        );
        if (!confirmCascade) return;
        res = await fetch(`/api/papers/${paper.id}?cascade=true`, { method: 'DELETE' });
      }
    }

    if (res.ok) {
      setPapers((prev) => prev.filter((p) => p.id !== paper.id));
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? 'Could not delete this paper.');
    }
  }

  return (
    <div className="space-y-5">
      {showForm ? (
        <UploadForm onCreated={onCreated} onCancel={() => papers.length > 0 && setShowForm(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={() => setShowForm(true)}>
            <UploadCloud className="size-4" aria-hidden />
            Register a paper
          </Button>

          <Link href="/teacher/questions/upload" className={buttonClass('secondary', 'sm')}>
            Upload standalone questions
          </Link>
        </div>
      )}

      {papers.length === 0 ? (
        <EmptyState title="No papers registered yet" hint="Upload a scanned JEE paper PDF to get started." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {papers.map((paper) => (
            <Card key={paper.id} className="transition-all hover:shadow-md hover:ring-brand-200 dark:hover:ring-brand-800">
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                    <div>
                      <p className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">{paper.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{paper.code}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(paper)}
                    aria-label={`Delete ${paper.title}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {paper.examYear ? <Badge tone="brand">{paper.examYear}</Badge> : null}
                  {paper.pdfPages ? <Badge>{paper.pdfPages} pages</Badge> : null}
                  <Badge>{(paper.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</Badge>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Link
                    href={`/teacher/papers/${paper.id}/verify`}
                    className={buttonClass('primary', 'sm', 'w-full')}
                  >
                    <Columns2 className="size-3.5" />
                    Verify Questions (Split View)
                  </Link>

                  <div className="flex gap-2">
                    <Link
                      href={`/teacher/papers/${paper.id}/ingest`}
                      className={buttonClass('secondary', 'sm', 'flex-1')}
                    >
                      Ingest questions
                    </Link>
                    <Link
                      href={`/api/papers/${paper.id}/pdf`}
                      target="_blank"
                      className={buttonClass('secondary', 'sm')}
                    >
                      PDF
                    </Link>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadForm({ onCreated, onCancel }: { onCreated: (p: Paper) => void; onCancel: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [examYear, setExamYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a PDF file.');
      return;
    }

    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('title', title);
    if (examYear) form.set('examYear', examYear);
    form.set('file', file);

    try {
      const res = await fetch('/api/papers', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? 'Upload failed.');
        return;
      }
      onCreated(body);
      setTitle('');
      setExamYear('');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="red">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="JEE Main 2023 Jan 24 Shift 1"
                required
              />
            </div>
            <div>
              <Label htmlFor="examYear">Exam year (optional)</Label>
              <Input
                id="examYear"
                type="number"
                inputMode="numeric"
                value={examYear}
                onChange={(e) => setExamYear(e.target.value)}
                placeholder="2023"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="file">PDF file</Label>
            <input
              ref={fileRef}
              id="file"
              type="file"
              accept="application/pdf"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:text-slate-300 dark:file:bg-brand-950/80 dark:file:text-brand-300"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Uploading…
                </>
              ) : (
                'Register paper'
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
