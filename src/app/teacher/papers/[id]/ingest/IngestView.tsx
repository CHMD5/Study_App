'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileWarning } from 'lucide-react';
import { Alert, Badge, Button, buttonClass, Card, CardBody, CardHeader, CardTitle, Textarea } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { IngestPayload } from '@/lib/zod/ingest';
import type { ValidationIssue } from '@/lib/http';
import type { Paper } from '@/db/schema';
import type { PromptVersion } from '@/lib/prompts';

export function IngestView({
  paper,
  prompts,
  truncationPrompt,
}: {
  paper: Paper;
  prompts: PromptVersion[];
  truncationPrompt: string;
}) {
  const activePrompt = prompts[0];
  const [promptOpen, setPromptOpen] = useState(false);
  const [showTruncationHint, setShowTruncationHint] = useState(false);

  const [raw, setRaw] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [validCount, setValidCount] = useState<number | null>(null);
  const [staging, setStaging] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const questionCount = useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.questions) ? parsed.questions.length : null;
    } catch {
      return null;
    }
  }, [raw]);

  function validateClientSide(): boolean {
    setServerError(null);
    setResult(null);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (err) {
      setIssues([{ path: '(root)', message: `Not valid JSON: ${(err as Error).message}` }]);
      setValidCount(null);
      return false;
    }

    const parsed = IngestPayload.safeParse(parsedJson);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((issue) => ({
          path: issue.path.length ? issue.path.join('.') : '(root)',
          message: issue.message,
        })),
      );
      setValidCount(null);
      return false;
    }

    setIssues([]);
    setValidCount(parsed.data.questions.length);
    return true;
  }

  async function onStage() {
    if (!validateClientSide()) return;
    setStaging(true);
    setServerError(null);

    try {
      const res = await fetch(`/api/papers/${paper.id}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...JSON.parse(raw), promptVersion: activePrompt?.version }),
      });
      const body = await res.json();

      if (!res.ok) {
        if (body.issues) {
          setIssues(body.issues);
        } else {
          setServerError(body.message ?? 'Ingest failed.');
        }
        return;
      }

      setResult({ created: body.created });
      setRaw('');
      setIssues([]);
      setValidCount(null);
    } catch {
      setServerError('Could not reach the server.');
    } finally {
      setStaging(false);
    }
  }

  function jumpToIssue(issue: ValidationIssue) {
    // Best-effort: find the sourceQno referenced by the path (e.g.
    // "questions[7].type") and scroll/select that question's block in the
    // textarea, since line numbers in pasted JSON are otherwise meaningless to
    // the teacher.
    const idxMatch = issue.path.match(/^questions\[(\d+)\]/);
    if (!idxMatch || !textareaRef.current) return;
    try {
      const parsed = JSON.parse(raw);
      const q = parsed.questions?.[Number(idxMatch[1])];
      if (!q) return;
      const needle = JSON.stringify(q).slice(0, 40);
      const at = raw.indexOf(needle.replace(/^\{"/, '{\n  "'));
      const fallbackAt = raw.indexOf(`"sourceQno":${q.sourceQno}`);
      const pos = at >= 0 ? at : fallbackAt;
      if (pos >= 0) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos + needle.length);
        textareaRef.current.scrollTop =
          (pos / raw.length) * textareaRef.current.scrollHeight - textareaRef.current.clientHeight / 2;
      }
    } catch {
      // best-effort only
    }
  }

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card>
          <button
            className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left"
            onClick={() => setPromptOpen((v) => !v)}
            aria-expanded={promptOpen}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {promptOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              Extraction prompt ({activePrompt?.version ?? 'none found'})
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              {activePrompt ? <CopyButton text={activePrompt.text} size="sm" /> : null}
            </span>
          </button>
          {promptOpen && activePrompt ? (
            <CardBody className="border-t border-slate-200 pt-3">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200">
                {activePrompt.text}
              </pre>
              <Link href="/teacher/extraction-prompt" className="mt-2 inline-block text-xs text-brand-700 hover:underline">
                View all prompt versions →
              </Link>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Paste Gemini&rsquo;s JSON output</CardTitle>
            {questionCount !== null ? <Badge tone="brand">{questionCount} question(s) detected</Badge> : null}
          </CardHeader>
          <CardBody className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{ "paperMeta": {...}, "questions": [ ... ] }'
              rows={16}
              className="font-mono text-xs"
              spellCheck={false}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={validateClientSide} disabled={!raw.trim()}>
                Validate
              </Button>
              <Button onClick={onStage} disabled={!raw.trim() || staging}>
                {staging ? 'Staging…' : 'Validate & stage as drafts'}
              </Button>
              <button
                type="button"
                onClick={() => setShowTruncationHint((v) => !v)}
                className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <FileWarning className="size-3.5" aria-hidden />
                Output truncated?
              </button>
            </div>

            {showTruncationHint ? (
              <Alert tone="amber">
                <p className="mb-2">
                  Paste this into the same chat, then stitch its array elements onto the truncated list
                  before pasting here.
                </p>
                <pre className="whitespace-pre-wrap rounded-md bg-white/60 p-2 font-mono text-[11px] ring-1 ring-inset ring-amber-200">
                  {truncationPrompt}
                </pre>
                <CopyButton text={truncationPrompt} label="Copy fix-up prompt" variant="secondary" size="sm" className="mt-2" />
              </Alert>
            ) : null}

            {validCount !== null && issues.length === 0 ? (
              <Alert tone="green">{validCount} question(s) passed validation. Ready to stage.</Alert>
            ) : null}

            {serverError ? <Alert tone="red">{serverError}</Alert> : null}

            {result ? (
              <Alert tone="green" title="Staged">
                {result.created} draft question(s) created.{' '}
                <Link href={`/teacher/questions?paperId=${paper.id}`} className="underline">
                  Open the question bank →
                </Link>
              </Alert>
            ) : null}

            {issues.length > 0 ? (
              <div className="rounded-md bg-red-50 ring-1 ring-inset ring-red-200">
                <p className="border-b border-red-200 px-3 py-2 text-xs font-semibold text-red-800">
                  {issues.length} issue(s) — nothing was saved
                </p>
                <ul className="max-h-64 divide-y divide-red-100 overflow-auto">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        onClick={() => jumpToIssue(issue)}
                        className="block w-full px-3 py-2 text-left text-xs text-red-800 hover:bg-red-100"
                      >
                        <span className="font-mono">{issue.path}</span> — {issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Workflow</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2 text-sm text-slate-600">
              <li>1. Copy the prompt above</li>
              <li>2. Open Gemini Pro with the same PDF attached</li>
              <li>3. Run the prompt, copy its JSON reply</li>
              <li>4. Paste it here and Validate</li>
              <li>5. Stage as drafts, then review in the question editor</li>
            </ol>
            <Link href={`/api/papers/${paper.id}/pdf`} target="_blank" className={buttonClass('secondary', 'sm', 'mt-3 w-full')}>
              Open source PDF
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
