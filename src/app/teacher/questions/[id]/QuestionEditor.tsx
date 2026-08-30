'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { QuestionBody } from '@/components/Katex';
import { PdfCropViewer } from '@/components/pdf/PdfCropViewer';
import { extractAllImageTokens } from '@/lib/question-render';
import type { CropRect, Paper, Question, QuestionAnswer, QuestionImage, QuestionOption } from '@/db/schema';

type EditableFields = {
  body: string;
  options: QuestionOption[];
  answer: QuestionAnswer | null;
  solution: string;
  difficulty: number | null;
  expectedTimeS: number | null;
  topic: string;
  chapter: string;
  subject: Question['subject'];
  type: Question['type'];
};

function toEditable(q: Question): EditableFields {
  return {
    body: q.body,
    options: q.options ?? [],
    answer: q.answer,
    solution: q.solution ?? '',
    difficulty: q.difficulty,
    expectedTimeS: q.expectedTimeS,
    topic: q.topic ?? '',
    chapter: q.chapter ?? '',
    subject: q.subject,
    type: q.type,
  };
}

export function QuestionEditor({
  initialQuestion,
  initialImages,
  paper,
}: {
  initialQuestion: Question;
  initialImages: QuestionImage[];
  paper: Paper | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [fields, setFields] = useState<EditableFields>(() => toEditable(initialQuestion));
  const [images, setImages] = useState(initialImages);
  const [armedPlaceholder, setArmedPlaceholder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState<Question | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyReasons, setVerifyReasons] = useState<string[] | null>(null);

  function patchFields(partial: Partial<EditableFields>) {
    setFields((f) => ({ ...f, ...partial }));
    setDirty(true);
  }

  const imageTokens = useMemo(
    () => extractAllImageTokens(fields.body, fields.options.map((o) => o.body)),
    [fields.body, fields.options],
  );
  const resolvedIds = useMemo(() => new Set(images.map((i) => i.placeholderId)), [images]);
  const unresolvedCount = imageTokens.filter((t) => !resolvedIds.has(t)).length;

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setStaleConflict(null);

    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updatedAt: new Date(question.updatedAt).toISOString(),
          subject: fields.subject,
          type: fields.type,
          body: fields.body,
          options: fields.type === 'mcq' ? fields.options : [],
          answer: fields.answer,
          solution: fields.solution || null,
          difficulty: fields.difficulty,
          expectedTimeS: fields.expectedTimeS,
          topic: fields.topic || null,
          chapter: fields.chapter || null,
        }),
      });
      const body = await res.json();

      if (res.status === 409) {
        setStaleConflict(body.current);
        return;
      }
      if (!res.ok) {
        setSaveError(body.message ?? 'Save failed.');
        return;
      }

      setQuestion(body);
      setFields(toEditable(body));
      setDirty(false);
    } catch {
      setSaveError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  function acceptTheirs() {
    if (!staleConflict) return;
    setQuestion(staleConflict);
    setFields(toEditable(staleConflict));
    setStaleConflict(null);
    setDirty(false);
  }

  async function onVerify() {
    setVerifying(true);
    setVerifyReasons(null);
    try {
      const res = await fetch(`/api/questions/${question.id}/verify`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setVerifyReasons(body.reasons ?? [body.message ?? 'Could not verify.']);
        return;
      }
      setQuestion(body);
    } finally {
      setVerifying(false);
    }
  }

  async function onCrop({ sourcePage, cropRect, blob }: { sourcePage: number; cropRect: CropRect; blob: Blob }) {
    if (!armedPlaceholder) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set('placeholderId', armedPlaceholder);
      form.set('sourcePage', String(sourcePage));
      form.set('cropRect', JSON.stringify(cropRect));
      form.set('file', blob, `${armedPlaceholder}.webp`);

      const res = await fetch(`/api/questions/${question.id}/images`, { method: 'POST', body: form });
      if (res.ok) {
        const img = await res.json();
        setImages((prev) => [...prev.filter((i) => i.placeholderId !== armedPlaceholder), img]);
        setArmedPlaceholder(null);
      }
    } finally {
      setUploading(false);
    }
  }

  async function onDirectFileUpload(placeholderId: string, file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('placeholderId', placeholderId);
      form.set('file', file);

      const res = await fetch(`/api/questions/${question.id}/images`, { method: 'POST', body: form });
      if (res.ok) {
        const img = await res.json();
        setImages((prev) => [...prev.filter((i) => i.placeholderId !== placeholderId), img]);
        setArmedPlaceholder(null);
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? 'Image upload failed.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteImage(image: QuestionImage) {
    if (!confirm('Remove this cropped image? You will need to re-crop it.')) return;
    const res = await fetch(`/api/questions/${question.id}/images/${image.id}`, { method: 'DELETE' });
    if (res.ok) setImages((prev) => prev.filter((i) => i.id !== image.id));
  }

  async function onDeleteQuestion() {
    if (!confirm(`Delete question ${question.humanCode ?? question.id}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/questions/${question.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/teacher/questions');
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? 'Could not delete this question.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{question.humanCode ?? question.id}</h1>
            <Badge tone={question.status === 'verified' ? 'green' : question.status === 'archived' ? 'slate' : 'amber'}>
              {question.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <Link href="/teacher/questions" className="hover:underline">
              ← Back to question bank
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty ? <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span> : null}
          <Button variant="secondary" onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="accent"
            onClick={onVerify}
            disabled={verifying || dirty || question.status === 'verified'}
            title={dirty ? 'Save your changes before verifying' : undefined}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {question.status === 'verified' ? 'Verified' : verifying ? 'Checking…' : 'Verify'}
          </Button>
          <Button variant="danger" onClick={onDeleteQuestion} disabled={deleting}>
            <Trash2 className="size-4" aria-hidden />
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>

      {staleConflict ? (
        <Alert tone="red" title="Someone else edited this question since you loaded it">
          <p className="mb-2">Your unsaved changes are still in the form below.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={acceptTheirs}>
              Discard mine, load theirs
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setStaleConflict(null)}>
              Keep editing (retry save later)
            </Button>
          </div>
        </Alert>
      ) : null}
      {saveError ? <Alert tone="red">{saveError}</Alert> : null}
      {verifyReasons ? (
        <Alert tone="amber" title="Cannot verify yet">
          <ul className="list-inside list-disc">
            {verifyReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* Left: source PDF + crop tool OR direct image upload panel */}
        <div className="min-h-[320px]">
          {paper ? (
            <PdfCropViewer
              paperId={paper.id}
              totalPages={paper.pdfPages}
              cropping={uploading}
              onCrop={onCrop}
            />
          ) : (
            <Card className="flex h-full flex-col items-center justify-center p-6 text-center">
              <Upload className="size-10 text-slate-400 dark:text-slate-500" />
              <h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Standalone question</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                No source PDF paper is linked. You can directly upload image files for any placeholder in this question.
              </p>
              {armedPlaceholder ? (
                <div className="mt-4 w-full max-w-xs rounded-lg border border-accent-300 bg-accent-50 p-3 dark:border-accent-700 dark:bg-accent-950/40">
                  <p className="text-xs font-semibold text-accent-900 dark:text-accent-200">
                    Upload image for <span className="font-mono">[[IMG:{armedPlaceholder}]]</span>
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-brand-50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100 dark:text-slate-300 dark:file:bg-brand-950/80 dark:file:text-brand-300"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && armedPlaceholder) onDirectFileUpload(armedPlaceholder, file);
                    }}
                  />
                  <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setArmedPlaceholder(null)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </Card>
          )}

          {paper && armedPlaceholder ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-accent-100 px-3 py-2 text-xs text-slate-800 ring-1 ring-inset ring-accent-400 dark:bg-accent-950/80 dark:text-accent-100 dark:ring-accent-600">
              <span className="flex items-center gap-2">
                <span>
                  Drag a rectangle on the PDF to crop <span className="font-mono font-semibold">[[IMG:{armedPlaceholder}]]</span>
                  {uploading ? ' — uploading…' : ''}
                </span>
                <span className="text-slate-400">or</span>
                <label className="cursor-pointer font-semibold text-brand-700 underline dark:text-brand-400">
                  Upload file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && armedPlaceholder) onDirectFileUpload(armedPlaceholder, file);
                    }}
                  />
                </label>
              </span>
              <button onClick={() => setArmedPlaceholder(null)} aria-label="Cancel crop">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        {/* Right: editor + live preview */}
        <div className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Live preview</CardTitle>
              {unresolvedCount > 0 ? <Badge tone="amber">{unresolvedCount} unresolved image(s)</Badge> : null}
            </CardHeader>
            <CardBody>
              <QuestionBody
                body={fields.body}
                renderImage={(placeholderId) => (
                  <ImageChip
                    placeholderId={placeholderId}
                    questionId={question.id}
                    resolved={resolvedIds.has(placeholderId)}
                    armed={armedPlaceholder === placeholderId}
                    onClick={() => setArmedPlaceholder(placeholderId)}
                  />
                )}
              />
              {fields.type === 'mcq' && fields.options.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {fields.options.map((opt) => (
                    <li key={opt.key} className="flex gap-2">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">{opt.key}.</span>
                      <QuestionBody
                        body={opt.body}
                        renderImage={(placeholderId) => (
                          <ImageChip
                            placeholderId={placeholderId}
                            questionId={question.id}
                            resolved={resolvedIds.has(placeholderId)}
                            armed={armedPlaceholder === placeholderId}
                            onClick={() => setArmedPlaceholder(placeholderId)}
                          />
                        )}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Body</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Textarea
                value={fields.body}
                onChange={(e) => patchFields({ body: e.target.value })}
                rows={8}
                className="font-mono text-xs"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Subject</Label>
                  <Select value={fields.subject} onChange={(e) => patchFields({ subject: e.target.value as Question['subject'] })}>
                    <option value="physics">Physics</option>
                    <option value="chemistry">Chemistry</option>
                    <option value="maths">Maths</option>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={fields.type}
                    onChange={(e) => {
                      const type = e.target.value as Question['type'];
                      patchFields({ type, options: type === 'integer' ? [] : fields.options, answer: null });
                    }}
                  >
                    <option value="mcq">MCQ</option>
                    <option value="integer">Integer</option>
                  </Select>
                </div>
              </div>
            </CardBody>
          </Card>

          {fields.type === 'mcq' ? (
            <OptionsEditor options={fields.options} onChange={(options) => patchFields({ options })} />
          ) : null}

          <AnswerEditor type={fields.type} options={fields.options} answer={fields.answer} onChange={(answer) => patchFields({ answer })} />

          <Card>
            <CardHeader>
              <CardTitle>Solution & pedagogy</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <Label>Worked solution</Label>
                <Textarea
                  value={fields.solution}
                  onChange={(e) => patchFields({ solution: e.target.value })}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Difficulty (1–10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={fields.difficulty ?? ''}
                    onChange={(e) => patchFields({ difficulty: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Expected time (s)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={fields.expectedTimeS ?? ''}
                    onChange={(e) => patchFields({ expectedTimeS: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Chapter</Label>
                  <Input value={fields.chapter} onChange={(e) => patchFields({ chapter: e.target.value })} />
                </div>
                <div>
                  <Label>Topic</Label>
                  <Input value={fields.topic} onChange={(e) => patchFields({ topic: e.target.value })} />
                </div>
              </div>
            </CardBody>
          </Card>

          {images.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Cropped & uploaded images</CardTitle>
              </CardHeader>
              <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img) => (
                  <div key={img.id} className="group relative">
                    <Image
                      src={`/api/files/images/${question.id}/${img.placeholderId}`}
                      alt={img.altText ?? img.placeholderId}
                      width={160}
                      height={120}
                      className="h-24 w-full rounded border border-slate-200 bg-white object-cover dark:border-slate-700"
                      unoptimized
                    />
                    <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">{img.placeholderId}</p>
                    <button
                      onClick={() => onDeleteImage(img)}
                      className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-0 ring-1 ring-slate-200 group-hover:opacity-100 dark:bg-slate-800/90 dark:ring-slate-700"
                      aria-label={`Delete ${img.placeholderId}`}
                    >
                      <Trash2 className="size-3 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ImageChip({
  placeholderId,
  questionId,
  resolved,
  armed,
  onClick,
}: {
  placeholderId: string;
  questionId: string;
  resolved: boolean;
  armed: boolean;
  onClick: () => void;
}) {
  if (resolved) {
    return (
      <button onClick={onClick} className="mx-0.5 inline-block align-middle">
        <Image
          src={`/api/files/images/${questionId}/${placeholderId}`}
          alt={placeholderId}
          width={160}
          height={100}
          unoptimized
          className={`inline-block max-h-28 w-auto rounded border bg-white object-contain dark:bg-slate-900 ${
            armed ? 'border-accent-500 ring-2 ring-accent-400' : 'border-slate-200 dark:border-slate-700'
          }`}
        />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`mx-0.5 inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 align-middle text-xs font-medium ${
        armed
          ? 'border-accent-500 bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300'
          : 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
      }`}
    >
      <ImagePlus className="size-3" aria-hidden />
      {placeholderId}
    </button>
  );
}

function OptionsEditor({ options, onChange }: { options: QuestionOption[]; onChange: (o: QuestionOption[]) => void }) {
  const keys = ['A', 'B', 'C', 'D'] as const;

  function setBody(key: string, body: string) {
    const exists = options.some((o) => o.key === key);
    onChange(exists ? options.map((o) => (o.key === key ? { ...o, body } : o)) : [...options, { key, body }]);
  }

  function remove(key: string) {
    onChange(options.filter((o) => o.key !== key));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Options</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">
        {keys.map((key) => {
          const opt = options.find((o) => o.key === key);
          return (
            <div key={key} className="flex items-start gap-2">
              <span className="mt-2 w-4 shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">{key}</span>
              <Textarea
                value={opt?.body ?? ''}
                onChange={(e) => setBody(key, e.target.value)}
                rows={1}
                className="font-mono text-xs"
              />
              {opt ? (
                <button onClick={() => remove(key)} className="mt-2 shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove option ${key}`}>
                  <Trash2 className="size-3.5" />
                </button>
              ) : (
                <button onClick={() => setBody(key, '')} className="mt-2 shrink-0 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400" aria-label={`Add option ${key}`}>
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function AnswerEditor({
  type,
  options,
  answer,
  onChange,
}: {
  type: Question['type'];
  options: QuestionOption[];
  answer: QuestionAnswer | null;
  onChange: (a: QuestionAnswer | null) => void;
}) {
  const [mode, setMode] = useState<'exact' | 'range'>(answer && 'min' in answer ? 'range' : 'exact');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Answer key</CardTitle>
        {!answer ? <Badge tone="red">not set — blocks verify</Badge> : <Badge tone="green">set</Badge>}
      </CardHeader>
      <CardBody className="space-y-3">
        {type === 'mcq' ? (
          <Select
            value={answer && 'key' in answer ? answer.key : ''}
            onChange={(e) => onChange(e.target.value ? { key: e.target.value } : null)}
          >
            <option value="">Select the correct option…</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.key}
              </option>
            ))}
          </Select>
        ) : (
          <>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <input type="radio" checked={mode === 'exact'} onChange={() => { setMode('exact'); onChange(null); }} />
                Exact value
              </label>
              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <input type="radio" checked={mode === 'range'} onChange={() => { setMode('range'); onChange(null); }} />
                Tolerance range
              </label>
            </div>
            {mode === 'exact' ? (
              <Input
                type="number"
                step="any"
                placeholder="e.g. 42"
                value={answer && 'value' in answer ? answer.value : ''}
                onChange={(e) => onChange(e.target.value === '' ? null : { value: Number(e.target.value) })}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="any"
                  placeholder="min"
                  value={answer && 'min' in answer ? answer.min : ''}
                  onChange={(e) => {
                    const min = e.target.value === '' ? undefined : Number(e.target.value);
                    const max = answer && 'max' in answer ? answer.max : undefined;
                    onChange(min !== undefined && max !== undefined ? { min, max } : null);
                  }}
                />
                <Input
                  type="number"
                  step="any"
                  placeholder="max"
                  value={answer && 'max' in answer ? answer.max : ''}
                  onChange={(e) => {
                    const max = e.target.value === '' ? undefined : Number(e.target.value);
                    const min = answer && 'min' in answer ? answer.min : undefined;
                    onChange(min !== undefined && max !== undefined ? { min, max } : null);
                  }}
                />
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
