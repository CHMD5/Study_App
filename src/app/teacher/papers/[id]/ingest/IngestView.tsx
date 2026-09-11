'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  FileQuestion,
  FileWarning,
  Layers,
  Lightbulb,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Textarea,
} from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { parseIngestJson } from '@/lib/json-repair';
import { IngestPayload, IngestSolutionsPayload } from '@/lib/zod/ingest';
import type { ValidationIssue } from '@/lib/http';
import type { Paper } from '@/db/schema';
import type { PromptKind, PromptVersion } from '@/lib/prompts';

export function IngestView({
  paper,
  promptsByKind,
  truncationPrompt,
}: {
  paper: Paper;
  promptsByKind: Record<PromptKind, PromptVersion[]>;
  truncationPrompt: string;
}) {
  const [mode, setMode] = useState<PromptKind>('questions');
  const [promptOpen, setPromptOpen] = useState(false);
  const [showTruncationHint, setShowTruncationHint] = useState(false);

  const [raw, setRaw] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [validCount, setValidCount] = useState<number | null>(null);
  const [staging, setStaging] = useState(false);
  const [questionResult, setQuestionResult] = useState<{ created: number } | null>(null);
  const [solutionResult, setSolutionResult] = useState<{
    updated: number;
    totalSolutions: number;
    unmatchedQnos: number[];
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activePrompt = promptsByKind[mode]?.[0];

  const detectedCount = useMemo(() => {
    try {
      const { parsed } = parseIngestJson<any>(raw);
      if (mode === 'solutions') {
        return Array.isArray(parsed?.solutions) ? parsed.solutions.length : null;
      }
      return Array.isArray(parsed?.questions) ? parsed.questions.length : null;
    } catch {
      return null;
    }
  }, [raw, mode]);

  function handleModeChange(newMode: PromptKind) {
    setMode(newMode);
    setIssues([]);
    setValidCount(null);
    setQuestionResult(null);
    setSolutionResult(null);
    setServerError(null);
  }

  function validateClientSide(): { valid: boolean; data?: any } {
    setServerError(null);
    setQuestionResult(null);
    setSolutionResult(null);
    let parsedJson: unknown;
    try {
      const { parsed } = parseIngestJson(raw);
      parsedJson = parsed;
    } catch (err) {
      setIssues([{ path: '(root)', message: `Not valid JSON: ${(err as Error).message}` }]);
      setValidCount(null);
      return { valid: false };
    }

    if (mode === 'solutions') {
      const parsed = IngestSolutionsPayload.safeParse(parsedJson);
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
      setValidCount(parsed.data.solutions.length);
      return { valid: true, data: parsed.data };
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
      const res = await fetch(`/api/papers/${paper.id}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, promptVersion: activePrompt?.version }),
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

      if (mode === 'solutions') {
        setSolutionResult({
          updated: body.updated,
          totalSolutions: body.totalSolutions,
          unmatchedQnos: body.unmatchedQnos ?? [],
        });
      } else {
        setQuestionResult({ created: body.created });
      }

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
    const idxMatch = issue.path.match(/^(?:questions|solutions)\[(\d+)\]/);
    if (!idxMatch || !textareaRef.current) return;
    try {
      const { parsed } = parseIngestJson<any>(raw);
      const list = mode === 'solutions' ? parsed.solutions : parsed.questions;
      const item = list?.[Number(idxMatch[1])];
      if (!item) return;
      const needle = JSON.stringify(item).slice(0, 40);
      const at = raw.indexOf(needle.replace(/^\{"/, '{\n  "'));
      const fallbackAt = raw.indexOf(`"sourceQno":${item.sourceQno}`);
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

  const placeholderText = useMemo(() => {
    if (mode === 'solutions') {
      return `{\n  "solutions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "answer": "B",\n      "solution": "Step 1: Mitochondria are known as powerhouses of the cell...",\n      "imagePlaceholders": []\n    }\n  ]\n}`;
    }
    if (mode === 'both') {
      return `{\n  "questions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "type": "mcq",\n      "body": "Which cell organelle is the powerhouse?",\n      "options": [\n        { "key": "A", "body": "Ribosome" },\n        { "key": "B", "body": "Mitochondria" },\n        { "key": "C", "body": "Golgi apparatus" },\n        { "key": "D", "body": "Nucleus" }\n      ],\n      "answer": "B",\n      "solution": "Step 1: Cellular respiration takes place inside mitochondria...",\n      "imagePlaceholders": []\n    }\n  ]\n}`;
    }
    return `{\n  "questions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "type": "mcq",\n      "body": "Which cell organelle is the powerhouse?",\n      "options": [\n        { "key": "A", "body": "Ribosome" },\n        { "key": "B", "body": "Mitochondria" },\n        { "key": "C", "body": "Golgi apparatus" },\n        { "key": "D", "body": "Nucleus" }\n      ],\n      "imagePlaceholders": []\n    }\n  ]\n}`;
  }, [mode]);

  return (
    <div className="mt-6 space-y-6">
      {/* Mode Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/70">
        <button
          type="button"
          onClick={() => handleModeChange('questions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            mode === 'questions'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FileQuestion className="size-4" />
          <span>Upload Questions Only</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('solutions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            mode === 'solutions'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Lightbulb className="size-4 text-amber-500" />
          <span>Upload Solutions</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('both')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            mode === 'both'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="size-4 text-emerald-500" />
          <span>Upload Both at Once</span>
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <div className="flex w-full items-center justify-between gap-2 px-5 py-3">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
                onClick={() => setPromptOpen((v) => !v)}
                aria-expanded={promptOpen}
              >
                {promptOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                <span>
                  {mode === 'solutions'
                    ? 'Solutions Extraction Prompt'
                    : mode === 'both'
                      ? 'Unified (Questions & Solutions) Prompt'
                      : 'Questions Extraction Prompt'}
                </span>
                <span className="text-xs font-normal text-slate-500">
                  ({activePrompt?.version ?? 'none found'})
                </span>
              </button>
              {activePrompt ? <CopyButton text={activePrompt.text} label="Copy prompt" size="sm" /> : null}
            </div>
            {promptOpen && activePrompt ? (
              <CardBody className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800">
                  {activePrompt.text}
                </pre>
                <Link
                  href="/teacher/extraction-prompt"
                  className="mt-2 inline-block text-xs text-brand-700 hover:underline dark:text-brand-400"
                >
                  View full prompt documentation →
                </Link>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {mode === 'solutions'
                  ? 'Paste JSON Solutions Array'
                  : mode === 'both'
                    ? 'Paste Unified Questions & Solutions JSON'
                    : 'Paste JSON Questions Array'}
              </CardTitle>
              {detectedCount !== null ? (
                <Badge tone={mode === 'solutions' ? 'amber' : mode === 'both' ? 'green' : 'brand'}>
                  {detectedCount} {mode === 'solutions' ? 'solution(s)' : 'question(s)'} detected
                </Badge>
              ) : null}
            </CardHeader>
            <CardBody className="space-y-3">
              <Textarea
                ref={textareaRef}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={placeholderText}
                rows={16}
                className="font-mono text-xs"
                spellCheck={false}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={validateClientSide} disabled={!raw.trim()}>
                  Validate
                </Button>
                <Button onClick={onStage} disabled={!raw.trim() || staging}>
                  {staging
                    ? 'Processing…'
                    : mode === 'solutions'
                      ? 'Validate & update solutions'
                      : mode === 'both'
                        ? 'Validate & stage questions + solutions'
                        : 'Validate & stage questions'}
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
                  <CopyButton
                    text={truncationPrompt}
                    label="Copy fix-up prompt"
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                  />
                </Alert>
              ) : null}

              {validCount !== null && issues.length === 0 ? (
                <Alert tone="green">
                  {validCount} {mode === 'solutions' ? 'solution(s)' : 'question(s)'} passed validation. Ready to {mode === 'solutions' ? 'update' : 'stage'}.
                </Alert>
              ) : null}

              {serverError ? <Alert tone="red">{serverError}</Alert> : null}

              {questionResult ? (
                <Alert tone="green" title="Staged Successfully">
                  {questionResult.created} draft question(s){mode === 'both' ? ' with worked solutions' : ''} saved for this paper.{' '}
                  <Link href={`/teacher/papers/${paper.id}/verify`} className="font-semibold underline">
                    Open Verify Studio →
                  </Link>
                </Alert>
              ) : null}

              {solutionResult ? (
                <Alert tone="green" title="Solutions Updated">
                  Updated {solutionResult.updated} question(s) in this paper with worked solutions and answer keys.
                  {solutionResult.unmatchedQnos.length > 0 && (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Note: {solutionResult.unmatchedQnos.length} solution(s) had question numbers that did not match questions in this paper: Q{solutionResult.unmatchedQnos.join(', Q')}.
                    </p>
                  )}
                  <Link href={`/teacher/papers/${paper.id}/verify`} className="mt-1 inline-block font-semibold underline">
                    Open Verify Studio to review →
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

        {/* Paper Info & Verify Studio Link */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Verify Studio</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                After staging questions or uploading solutions, verify them side-by-side with the PDF paper.
              </p>
              <Link href={`/teacher/papers/${paper.id}/verify`} className={buttonClass('primary', 'sm', 'w-full')}>
                <Columns2 className="size-4" />
                Open Verify Studio
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supported Subjects</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-wrap gap-1.5">
              <Badge tone="brand">Physics</Badge>
              <Badge tone="green">Chemistry</Badge>
              <Badge tone="amber">Maths</Badge>
              <Badge tone="purple">Biology</Badge>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
