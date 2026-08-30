'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileWarning, UploadCloud } from 'lucide-react';
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Textarea } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { parseIngestJson } from '@/lib/json-repair';
import { IngestPayload } from '@/lib/zod/ingest';
import type { ValidationIssue } from '@/lib/http';
import type { PromptVersion } from '@/lib/prompts';

export function UploadQuestionsView({
  prompts,
  truncationPrompt,
}: {
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
      const { parsed } = parseIngestJson<any>(raw);
      return Array.isArray(parsed?.questions) ? parsed.questions.length : null;
    } catch {
      return null;
    }
  }, [raw]);

  function validateClientSide(): { valid: boolean; data?: any } {
    setServerError(null);
    setResult(null);
    let parsedJson: unknown;
    try {
      const { parsed } = parseIngestJson(raw);
      parsedJson = parsed;
    } catch (err) {
      setIssues([{ path: '(root)', message: `Not valid JSON: ${(err as Error).message}` }]);
      setValidCount(null);
      return { valid: false };
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
      return { valid: false };
    }

    setIssues([]);
    setValidCount(parsed.data.questions.length);
    return { valid: true, data: parsed.data };
  }

  async function onStage() {
    const { valid, data } = validateClientSide();
    if (!valid || !data) return;
    setStaging(true);
    setServerError(null);

    try {
      const res = await fetch('/api/questions/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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
    const idxMatch = issue.path.match(/^questions\[(\d+)\]/);
    if (!idxMatch || !textareaRef.current) return;
    try {
      const { parsed } = parseIngestJson<any>(raw);
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
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {promptOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              Extraction prompt ({activePrompt?.version ?? 'default'})
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              {activePrompt ? <CopyButton text={activePrompt.text} size="sm" /> : null}
            </span>
          </button>
          {promptOpen && activePrompt ? (
            <CardBody className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800">
                {activePrompt.text}
              </pre>
              <Link href="/teacher/extraction-prompt" className="mt-2 inline-block text-xs text-brand-700 hover:underline dark:text-brand-400">
                View all prompt versions →
              </Link>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Paste JSON questions array</CardTitle>
            {questionCount !== null ? <Badge tone="brand">{questionCount} question(s) detected</Badge> : null}
          </CardHeader>
          <CardBody className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='{ "questions": [ { "sourceQno": 1, "subject": "physics", "type": "mcq", "body": "...", "options": [...] } ] }'
              rows={16}
              className="font-mono text-xs"
              spellCheck={false}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={validateClientSide} disabled={!raw.trim()}>
                Validate
              </Button>
              <Button onClick={onStage} disabled={!raw.trim() || staging}>
                {staging ? 'Staging…' : 'Validate & stage questions'}
              </Button>
              <button
                type="button"
                onClick={() => setShowTruncationHint((v) => !v)}
                className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
                <pre className="whitespace-pre-wrap rounded-md bg-white/60 p-2 font-mono text-[11px] ring-1 ring-inset ring-amber-200 dark:bg-slate-900/60 dark:ring-amber-800">
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
              <Alert tone="green" title="Staged Successfully">
                {result.created} draft question(s) created without paper association.{' '}
                <Link href="/teacher/questions" className="font-semibold underline">
                  Open Question Bank →
                </Link>
              </Alert>
            ) : null}

            {issues.length > 0 ? (
              <div className="rounded-md bg-red-50 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:ring-red-800">
                <p className="border-b border-red-200 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:text-red-300">
                  {issues.length} issue(s) — nothing was saved
                </p>
                <ul className="max-h-64 divide-y divide-red-100 overflow-auto dark:divide-red-900/50">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        onClick={() => jumpToIssue(issue)}
                        className="block w-full px-3 py-2 text-left text-xs text-red-800 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
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
            <CardTitle>Direct Upload Workflow</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>1. Copy the extraction prompt</li>
              <li>2. Ask Gemini or extract questions directly</li>
              <li>3. Paste the generated JSON here</li>
              <li>4. Click <strong>Validate & stage questions</strong></li>
              <li>5. Review, verify, or add images in the Question Bank</li>
            </ol>
            <Link href="/teacher/questions" className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Go to Question Bank →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
