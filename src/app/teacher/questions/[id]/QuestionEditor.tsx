'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Plus, Trash2, X } from 'lucide-react';
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

  // Counts placeholders in the body AND every option's body — an unresolved
  // image inside an option (e.g. a match-the-column diagram) must show up in
  // this badge exactly like one in the body would.
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
            <h1 className="text-lg font-semibold text-slate-900">{question.humanCode ?? question.id}</h1>
            <Badge tone={question.status === 'verified' ? 'green' : question.status === 'archived' ? 'slate' : 'amber'}>
              {question.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            <Link href="/teacher/questions" className="hover:underline">
              ← Back to question bank
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty ? <span className="text-xs text-amber-600">Unsaved changes</span> : null}
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
        {/* Left: source PDF + crop tool */}
        <div className="min-h-[320px]">
          {paper ? (
            <PdfCropViewer
              paperId={paper.id}
              totalPages={paper.pdfPages}
              cropping={uploading}
              onCrop={onCrop}
            />
          ) : (
            <Card className="flex h-full items-center justify-center text-sm text-slate-400">
              No source paper linked to this question.
            </Card>
          )}
          {armedPlaceholder ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-accent-100 px-3 py-2 text-xs text-slate-800 ring-1 ring-inset ring-accent-400">
              <span>
                Drag a rectangle to resolve <span className="font-mono">[[IMG:{armedPlaceholder}]]</span>
                {uploading ? ' — uploading…' : ''}
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
                      <span className="font-semibold text-slate-500">{opt.key}.</span>
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
                <CardTitle>Cropped images</CardTitle>
              </CardHeader>
              <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img) => (
                  <div key={img.id} className="group relative">
                    <Image
                      src={`/api/files/images/${question.id}/${img.placeholderId}`}
                      alt={img.altText ?? img.placeholderId}
                      width={160}
                      height={120}
                      className="h-24 w-full rounded border border-slate-200 object-cover"
                      unoptimized
                    />
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{img.placeholderId}</p>
                    <button
                      onClick={() => onDeleteImage(img)}
                      className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-0 ring-1 ring-slate-200 group-hover:opacity-100"
                      aria-label={`Delete ${img.placeholderId}`}
                    >
                      <Trash2 className="size-3 text-red-600" />
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
          className={`inline-block max-h-28 w-auto rounded border object-contain ${armed ? 'border-accent-500 ring-2 ring-accent-400' : 'border-slate-200'}`}
        />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`mx-0.5 inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 align-middle text-xs font-medium ${
        armed ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-amber-400 bg-amber-50 text-amber-700'
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
              <span className="mt-2 w-4 shrink-0 text-sm font-semibold text-slate-500">{key}</span>
              <Textarea
                value={opt?.body ?? ''}
                onChange={(e) => setBody(key, e.target.value)}
                rows={1}
                className="font-mono text-xs"
              />
              {opt ? (
                <button onClick={() => remove(key)} className="mt-2 shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove option ${key}`}>
                  <Trash2 className="size-3.5" />
                </button>
              ) : (
                <button onClick={() => setBody(key, '')} className="mt-2 shrink-0 text-slate-400 hover:text-brand-600" aria-label={`Add option ${key}`}>
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
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === 'exact'} onChange={() => { setMode('exact'); onChange(null); }} />
                Exact value
              </label>
              <label className="flex items-center gap-1.5">
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
