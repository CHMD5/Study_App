'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Select } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import type { PromptVersion } from '@/lib/prompts';

const WORKFLOW = [
  'Register the paper under Papers → the PDF is stored locally',
  'Copy the prompt below',
  'Open Gemini Pro (AI Studio or the Gemini app) in a new tab',
  'Attach the same PDF — 20–25 pages per request, split by subject, not the whole paper',
  'Paste the prompt, run it',
  'Copy the JSON it returns',
  'Paste it into that paper’s ingest screen → Validate',
];

export function ExtractionPromptView({
  prompts,
  truncationPrompt,
}: {
  prompts: PromptVersion[];
  truncationPrompt: string;
}) {
  const [versionIdx, setVersionIdx] = useState(0);
  const active = prompts[versionIdx];

  function download() {
    const blob = new Blob([active.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.filename}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <Card>
        <CardHeader className="sticky top-14 z-10 flex flex-row flex-wrap items-center justify-between gap-3 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <CardTitle>Extraction prompt</CardTitle>
            <Select
              aria-label="Prompt version"
              value={versionIdx}
              onChange={(e) => setVersionIdx(Number(e.target.value))}
              className="h-8 w-auto"
            >
              {prompts.map((p, i) => (
                <option key={p.version} value={i}>
                  {p.version}
                  {i === 0 ? ' (latest)' : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={download}>
              <Download className="size-3.5" aria-hidden />
              Download .txt
            </Button>
            <CopyButton text={active.text} size="sm" />
          </div>
        </CardHeader>
        <CardBody>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-[12.5px] leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200">
            {active.text}
          </pre>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Workflow</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2.5 text-sm text-slate-700">
              {WORKFLOW.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
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
            <Badge tone="amber">common on 75-Q papers</Badge>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Paste this into the same chat, then stitch its array elements onto the truncated list
              before pasting into the ingest box.
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800 ring-1 ring-inset ring-slate-200">
              {truncationPrompt}
            </pre>
            <CopyButton text={truncationPrompt} label="Copy fix-up prompt" variant="secondary" size="sm" className="w-full" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
