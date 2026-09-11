'use client';

import { useState } from 'react';
import { Download, FileQuestion, Layers, Lightbulb } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Select } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import type { PromptKind, PromptVersion } from '@/lib/prompts';

const WORKFLOWS: Record<PromptKind, { title: string; steps: string[] }> = {
  questions: {
    title: 'Questions Extraction Workflow',
    steps: [
      'Register the paper under Papers → or use Standalone Questions upload',
      'Copy the prompt below',
      'Open Gemini Pro (AI Studio or the Gemini app) in a new tab',
      'Attach the scanned question paper PDF (split into 20–25 pages if large)',
      'Paste the prompt, run it, and copy the JSON it returns',
      'Paste into the ingest screen → Validate & stage questions',
    ],
  },
  solutions: {
    title: 'Solutions Extraction Workflow',
    steps: [
      'Have your questions already ingested or registered in the Question Bank',
      'Copy the solutions prompt below',
      'Open Gemini Pro in a new tab',
      'Attach your solution booklet, worked explanations, or answer key PDF',
      'Paste the prompt, run it, and copy the solutions JSON',
      'Paste into Upload Solutions → match against your target paper or standalone questions',
    ],
  },
  both: {
    title: 'Unified (Both) Extraction Workflow',
    steps: [
      'Obtain an examination paper that contains questions and worked solutions together',
      'Copy the unified extraction prompt below',
      'Open Gemini Pro in a new tab and attach your PDF',
      'Paste the prompt, run it, and copy the unified questions + solutions JSON',
      'Paste into the ingest screen → Validate & stage questions with solutions',
    ],
  },
};

export function ExtractionPromptView({
  promptsByKind,
  truncationPrompt,
}: {
  promptsByKind: Record<PromptKind, PromptVersion[]>;
  truncationPrompt: string;
}) {
  const [kind, setKind] = useState<PromptKind>('questions');
  const [versionIdx, setVersionIdx] = useState(0);

  const currentPrompts = promptsByKind[kind] ?? [];
  const active = currentPrompts[versionIdx] ?? currentPrompts[0];

  function handleKindChange(newKind: PromptKind) {
    setKind(newKind);
    setVersionIdx(0);
  }

  function download() {
    if (!active) return;
    const blob = new Blob([active.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.filename}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const workflow = WORKFLOWS[kind];

  return (
    <div className="mt-6 space-y-6">
      {/* Mode Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/70">
        <button
          type="button"
          onClick={() => handleKindChange('questions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            kind === 'questions'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FileQuestion className="size-4" />
          <span>Questions Prompt</span>
        </button>

        <button
          type="button"
          onClick={() => handleKindChange('solutions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            kind === 'solutions'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Lightbulb className="size-4 text-amber-500" />
          <span>Solutions Prompt</span>
        </button>

        <button
          type="button"
          onClick={() => handleKindChange('both')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            kind === 'both'
              ? 'bg-white text-brand-700 shadow-xs dark:bg-slate-800 dark:text-brand-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="size-4 text-emerald-500" />
          <span>Both (Questions & Solutions) Prompt</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader className="sticky top-14 z-10 flex flex-row flex-wrap items-center justify-between gap-3 bg-white/95 backdrop-blur dark:bg-slate-900/95">
            <div className="flex items-center gap-2">
              <CardTitle>
                {kind === 'solutions'
                  ? 'Solutions Extraction'
                  : kind === 'both'
                    ? 'Unified Extraction'
                    : 'Questions Extraction'}
              </CardTitle>
              {currentPrompts.length > 1 && (
                <Select
                  aria-label="Prompt version"
                  value={versionIdx}
                  onChange={(e) => setVersionIdx(Number(e.target.value))}
                  className="h-8 w-auto text-xs"
                >
                  {currentPrompts.map((p, i) => (
                    <option key={p.version} value={i}>
                      {p.version}
                      {i === 0 ? ' (latest)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={download} disabled={!active}>
                <Download className="size-3.5" aria-hidden />
                Download .txt
              </Button>
              {active && <CopyButton text={active.text} label="Copy prompt" size="sm" />}
            </div>
          </CardHeader>
          <CardBody>
            {active ? (
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800">
                {active.text}
              </pre>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">No prompt file found.</div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{workflow.title}</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {workflow.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700 dark:bg-brand-950/80 dark:text-brand-300">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>If output truncates</CardTitle>
              <Badge tone="amber">common on large PDFs</Badge>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Paste this into the same chat, then stitch its array elements onto the truncated list
                before pasting into the ingest box.
              </p>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-800">
                {truncationPrompt}
              </pre>
              <CopyButton
                text={truncationPrompt}
                label="Copy fix-up prompt"
                variant="secondary"
                size="sm"
                className="w-full"
              />
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
