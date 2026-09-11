'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileQuestion,
  FileWarning,
  Layers,
  Lightbulb,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Select,
  Textarea,
} from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { parseIngestJson } from '@/lib/json-repair';
import { IngestPayload, IngestSolutionsPayload } from '@/lib/zod/ingest';
import type { ValidationIssue } from '@/lib/http';
import type { PromptKind, PromptVersion } from '@/lib/prompts';

type PaperSummary = {
  id: string;
  code: string;
  title: string;
};

export function UploadQuestionsView({
  promptsByKind,
  truncationPrompt,
  papers,
}: {
  promptsByKind: Record<PromptKind, PromptVersion[]>;
  truncationPrompt: string;
  papers: PaperSummary[];
}) {
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get('mode') as PromptKind) || 'questions';
  const [mode, setMode] = useState<PromptKind>(
    initialMode === 'solutions' || initialMode === 'both' ? initialMode : 'questions',
  );

  const [promptOpen, setPromptOpen] = useState(false);
  const [showTruncationHint, setShowTruncationHint] = useState(false);
  const [targetPaperId, setTargetPaperId] = useState('');

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
      const payload =
        mode === 'solutions'
          ? {
              ...data,
              paperId: targetPaperId || undefined,
            }
          : data;

      const res = await fetch('/api/questions/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      return `{\n  "solutions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "answer": "B",\n      "solution": "Step 1: Mitochondria generate the most ATP through oxidative phosphorylation...",\n      "imagePlaceholders": []\n    }\n  ]\n}`;
    }
    if (mode === 'both') {
      return `{\n  "questions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "type": "mcq",\n      "body": "Which organelle is the primary site of ATP synthesis?",\n      "options": [\n        { "key": "A", "body": "Ribosome" },\n        { "key": "B", "body": "Mitochondria" },\n        { "key": "C", "body": "Golgi apparatus" },\n        { "key": "D", "body": "Lysosome" }\n      ],\n      "answer": "B",\n      "solution": "Step 1: Cellular respiration takes place within the mitochondrial matrix and cristae...",\n      "imagePlaceholders": []\n    }\n  ]\n}`;
    }
    return `{\n  "questions": [\n    {\n      "sourceQno": 1,\n      "subject": "biology",\n      "type": "mcq",\n      "body": "Which organelle is known as the powerhouse of the cell?",\n      "options": [\n        { "key": "A", "body": "Ribosome" },\n        { "key": "B", "body": "Mitochondria" },\n        { "key": "C", "body": "Golgi apparatus" },\n        { "key": "D", "body": "Lysosome" }\n      ],\n      "imagePlaceholders": []\n    }\n  ]\n}`;
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
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Current
          </span>
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
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Answers & Steps
          </span>
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
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Unified
          </span>
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Target Paper selector for Solutions Mode */}
          {mode === 'solutions' && (
            <Card className="border-amber-200/70 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Target Paper (Optional)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Match question numbers against a specific registered paper, or leave empty for standalone questions.
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <Select
                    value={targetPaperId}
                    onChange={(e) => setTargetPaperId(e.target.value)}
                    className="h-8 text-xs"
                    aria-label="Target paper"
                  >
                    <option value="">Standalone Questions (No paper)</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                  </Select>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Prompt Viewer Card */}
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
                  ({activePrompt?.version ?? 'default'})
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

          {/* JSON Paste & Action Card */}
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
                  {validCount} {mode === 'solutions' ? 'solution(s)' : 'question(s)'} passed validation.
                  Ready to {mode === 'solutions' ? 'update' : 'stage'}.
                </Alert>
              ) : null}

              {serverError ? <Alert tone="red">{serverError}</Alert> : null}

              {questionResult ? (
                <Alert tone="green" title="Staged Successfully">
                  {questionResult.created} draft question(s){mode === 'both' ? ' with worked solutions' : ''} created.{' '}
                  <Link href="/teacher/questions" className="font-semibold underline">
                    Open Question Bank →
                  </Link>
                </Alert>
              ) : null}

              {solutionResult ? (
                <Alert tone="green" title="Solutions Updated">
                  Successfully updated {solutionResult.updated} question(s) with worked solutions and answer keys.
                  {solutionResult.unmatchedQnos.length > 0 && (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Note: {solutionResult.unmatchedQnos.length} solution(s) had question numbers that did not match existing questions: Q{solutionResult.unmatchedQnos.join(', Q')}.
                    </p>
                  )}
                  <Link href="/teacher/questions" className="mt-1 inline-block font-semibold underline">
                    Open Question Bank to review →
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

        {/* Workflow Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {mode === 'solutions'
                  ? 'Solutions Upload Workflow'
                  : mode === 'both'
                    ? 'Unified Extraction Workflow'
                    : 'Questions Ingestion Workflow'}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {mode === 'solutions' ? (
                <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <li>1. Copy the <strong>Solutions Extraction Prompt</strong></li>
                  <li>2. Open Gemini and upload your solutions booklet or answer key PDF</li>
                  <li>3. Paste the prompt to generate structured solutions JSON</li>
                  <li>4. (Optional) Choose the target registered paper</li>
                  <li>5. Paste JSON here and click <strong>Validate & update solutions</strong></li>
                </ol>
              ) : mode === 'both' ? (
                <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <li>1. Copy the <strong>Unified (Both) Extraction Prompt</strong></li>
                  <li>2. Open Gemini and upload an exam paper containing solutions or answers</li>
                  <li>3. Paste the prompt to extract questions + step-by-step solutions together</li>
                  <li>4. Paste the generated JSON here</li>
                  <li>5. Click <strong>Validate & stage questions + solutions</strong></li>
                </ol>
              ) : (
                <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <li>1. Copy the <strong>Questions Extraction Prompt</strong></li>
                  <li>2. Open Gemini and attach your scanned exam paper PDF</li>
                  <li>3. Paste the prompt to extract questions, options, and placeholders</li>
                  <li>4. Paste the generated JSON here</li>
                  <li>5. Click <strong>Validate & stage questions</strong></li>
                </ol>
              )}
              <Link
                href="/teacher/questions"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Go to Question Bank →
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
