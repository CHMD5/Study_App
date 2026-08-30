'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  ImagePlus,
  Navigation,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { QuestionBody } from '@/components/Katex';
import { PdfCropViewer } from '@/components/pdf/PdfCropViewer';
import { extractAllImageTokens } from '@/lib/question-render';
import { cn } from '@/lib/cn';
import type { CropRect, Paper, Question, QuestionAnswer, QuestionImage, QuestionOption } from '@/db/schema';

type QuestionWithImages = Question & {
  imageTokens: string[];
  resolvedImageMap: Map<string, QuestionImage>;
  unresolvedTokens: string[];
};

export function PaperVerifyStudio({
  initialPaper,
  initialQuestions,
  initialImages,
}: {
  initialPaper: Paper;
  initialQuestions: Question[];
  initialImages: QuestionImage[];
}) {
  const [paper] = useState(initialPaper);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [images, setImages] = useState<QuestionImage[]>(initialImages);

  // Armed placeholder state for cropping
  const [armed, setArmed] = useState<{ questionId: string; placeholderId: string; sourceQno: number | null } | null>(null);
  const [cropping, setCropping] = useState(false);

  // Filters & Search
  const [filterNeedsImage, setFilterNeedsImage] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded inline editors map: questionId -> boolean
  const [expandedEditors, setExpandedEditors] = useState<Record<string, boolean>>({});

  // Active highlighted question ref for scrolling
  const questionCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Compute enriched question metadata
  const enrichedQuestions: QuestionWithImages[] = useMemo(() => {
    const imagesByQ = new Map<string, QuestionImage[]>();
    for (const img of images) {
      const list = imagesByQ.get(img.questionId) ?? [];
      list.push(img);
      imagesByQ.set(img.questionId, list);
    }

    return questions.map((q) => {
      const qImages = imagesByQ.get(q.id) ?? [];
      const imageMap = new Map<string, QuestionImage>();
      for (const img of qImages) {
        imageMap.set(img.placeholderId, img);
      }

      const tokens = extractAllImageTokens(q.body, (q.options ?? []).map((o) => o.body));
      const unresolved = tokens.filter((t) => !imageMap.has(t));

      return {
        ...q,
        imageTokens: tokens,
        resolvedImageMap: imageMap,
        unresolvedTokens: unresolved,
      };
    });
  }, [questions, images]);

  // Summary counts
  const totalCount = enrichedQuestions.length;
  const verifiedCount = enrichedQuestions.filter((q) => q.status === 'verified').length;
  const draftCount = enrichedQuestions.filter((q) => q.status === 'draft').length;
  const needsImageQuestions = enrichedQuestions.filter((q) => q.unresolvedTokens.length > 0);
  const needsImageCount = needsImageQuestions.length;

  // Filtered questions list
  const filteredQuestions = useMemo(() => {
    return enrichedQuestions.filter((q) => {
      if (filterNeedsImage && q.unresolvedTokens.length === 0) return false;
      if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
      if (filterStatus !== 'all' && q.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const bodyMatch = q.body.toLowerCase().includes(query);
        const codeMatch = (q.humanCode ?? '').toLowerCase().includes(query);
        if (!bodyMatch && !codeMatch) return false;
      }
      return true;
    });
  }, [enrichedQuestions, filterNeedsImage, filterSubject, filterStatus, searchQuery]);

  // Jump to next question needing image
  function jumpToNextMissingImage() {
    if (needsImageQuestions.length === 0) {
      alert('All questions have their images resolved!');
      return;
    }

    // If already armed or focusing on one, find the NEXT one after it, else first one
    let targetIndex = 0;
    if (armed) {
      const currentIdx = needsImageQuestions.findIndex((q) => q.id === armed.questionId);
      if (currentIdx !== -1 && currentIdx < needsImageQuestions.length - 1) {
        targetIndex = currentIdx + 1;
      }
    }

    const targetQ = needsImageQuestions[targetIndex];
    if (targetQ) {
      const placeholder = targetQ.unresolvedTokens[0];
      setArmed({
        questionId: targetQ.id,
        placeholderId: placeholder,
        sourceQno: targetQ.sourceQno,
      });

      // Scroll question card into view
      const el = questionCardRefs.current[targetQ.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // Handle crop from PDF
  async function handleCrop({ sourcePage, cropRect, blob }: { sourcePage: number; cropRect: CropRect; blob: Blob }) {
    if (!armed) return;
    setCropping(true);
    try {
      const form = new FormData();
      form.set('placeholderId', armed.placeholderId);
      form.set('sourcePage', String(sourcePage));
      form.set('cropRect', JSON.stringify(cropRect));
      form.set('file', blob, `${armed.placeholderId}.webp`);

      const res = await fetch(`/api/questions/${armed.questionId}/images`, { method: 'POST', body: form });
      if (res.ok) {
        const newImg: QuestionImage = await res.json();
        setImages((prev) => [
          ...prev.filter((i) => !(i.questionId === armed.questionId && i.placeholderId === armed.placeholderId)),
          newImg,
        ]);

        // If this question has more unresolved images, arm the next one, otherwise clear
        const currentQ = enrichedQuestions.find((q) => q.id === armed.questionId);
        const remaining = currentQ?.unresolvedTokens.filter((t) => t !== armed.placeholderId) ?? [];
        if (remaining.length > 0) {
          setArmed({
            questionId: armed.questionId,
            placeholderId: remaining[0],
            sourceQno: currentQ?.sourceQno ?? null,
          });
        } else {
          setArmed(null);
        }
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? 'Image crop upload failed.');
      }
    } finally {
      setCropping(false);
    }
  }

  // Handle direct file upload for an image placeholder
  async function handleDirectFileUpload(questionId: string, placeholderId: string, file: File) {
    setCropping(true);
    try {
      const form = new FormData();
      form.set('placeholderId', placeholderId);
      form.set('file', file);

      const res = await fetch(`/api/questions/${questionId}/images`, { method: 'POST', body: form });
      if (res.ok) {
        const newImg: QuestionImage = await res.json();
        setImages((prev) => [
          ...prev.filter((i) => !(i.questionId === questionId && i.placeholderId === placeholderId)),
          newImg,
        ]);
        if (armed?.questionId === questionId && armed?.placeholderId === placeholderId) {
          setArmed(null);
        }
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? 'Image upload failed.');
      }
    } finally {
      setCropping(false);
    }
  }

  // Handle quick verify question
  async function handleVerifyQuestion(questionId: string) {
    try {
      const res = await fetch(`/api/questions/${questionId}/verify`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        const reasons = body.reasons?.join('\n• ') ?? body.message ?? 'Could not verify question.';
        alert(`Cannot verify question yet:\n• ${reasons}`);
        return;
      }
      // Update question state
      setQuestions((prev) => prev.map((q) => (q.id === questionId ? body : q)));
    } catch {
      alert('Could not connect to server.');
    }
  }

  // Handle delete question
  async function handleDeleteQuestion(q: Question) {
    if (!confirm(`Delete question ${q.humanCode ?? q.id}? This cannot be undone.`)) return;
    const res = await fetch(`/api/questions/${q.id}`, { method: 'DELETE' });
    if (res.ok) {
      setQuestions((prev) => prev.filter((item) => item.id !== q.id));
      setImages((prev) => prev.filter((img) => img.questionId !== q.id));
      if (armed?.questionId === q.id) setArmed(null);
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.message ?? 'Could not delete question.');
    }
  }

  // Handle inline update
  function handleQuestionUpdated(updatedQ: Question) {
    setQuestions((prev) => prev.map((q) => (q.id === updatedQ.id ? updatedQ : q)));
  }

  return (
    <div className="flex h-full flex-col bg-slate-100 dark:bg-[#090d16]">
      {/* Top Studio Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Link
            href="/teacher/papers"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Back to Papers"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base">{paper.title}</h1>
              {paper.examYear && <Badge tone="brand">{paper.examYear}</Badge>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {paper.code} · Dual-Pane Full Paper Verification Studio
            </p>
          </div>
        </div>

        {/* Progress statistics */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Total: {totalCount}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="size-3" /> {verifiedCount} Verified
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            {draftCount} Drafts
          </span>
          {needsImageCount > 0 ? (
            <button
              onClick={() => {
                setFilterNeedsImage(true);
                jumpToNextMissingImage();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 shadow-xs transition-transform hover:scale-105"
            >
              <ImagePlus className="size-3.5" />
              {needsImageCount} Need Image
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
              <Sparkles className="size-3" /> All Images Done
            </span>
          )}
        </div>
      </header>

      {/* Main Dual-Pane Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Left Column: PDF Viewer with crop tool */}
        <div className="relative flex min-h-[360px] flex-col border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-950">
          <PdfCropViewer
            paperId={paper.id}
            totalPages={paper.pdfPages}
            cropping={cropping}
            onCrop={handleCrop}
          />

          {/* Armed placeholder floating helper banner */}
          {armed ? (
            <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-between rounded-xl border border-accent-400 bg-accent-100/95 p-3 text-xs text-slate-900 shadow-xl backdrop-blur-md dark:border-accent-600 dark:bg-accent-950/95 dark:text-accent-100">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-500 text-slate-950 font-bold">
                  📷
                </span>
                <div>
                  <p className="font-semibold leading-tight">
                    Armed: <code className="rounded bg-accent-200/80 px-1 py-0.5 font-mono dark:bg-accent-900">[[IMG:{armed.placeholderId}]]</code>
                    {armed.sourceQno ? ` for Q${armed.sourceQno}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Drag a rectangle on the PDF above to crop {cropping ? ' (uploading…)' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                  Upload file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && armed) handleDirectFileUpload(armed.questionId, armed.placeholderId, f);
                    }}
                  />
                </label>
                <button
                  onClick={() => setArmed(null)}
                  className="rounded-md p-1 hover:bg-accent-200/80 dark:hover:bg-accent-900"
                  aria-label="Cancel crop"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right Column: Full Set of Questions with Quick Nav Toolbar */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#090d16]">
          {/* Quick Filter and Navigation Bar */}
          <div className="shrink-0 border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Quick Image Navigation Button */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterNeedsImage((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    filterNeedsImage
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  <Filter className="size-3.5" />
                  <span>Needs Image Only ({needsImageCount})</span>
                </button>

                <button
                  type="button"
                  onClick={jumpToNextMissingImage}
                  disabled={needsImageCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-300 dark:hover:bg-brand-900"
                  title="Scroll to next question that needs an image crop"
                >
                  <Navigation className="size-3.5" />
                  <span>Next Missing Image →</span>
                </button>
              </div>

              {/* Subject & Status Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="h-8 text-xs py-0 w-28"
                  aria-label="Filter Subject"
                >
                  <option value="all">All Subjects</option>
                  <option value="physics">Physics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="maths">Maths</option>
                </Select>

                <Select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-8 text-xs py-0 w-28"
                  aria-label="Filter Status"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Drafts</option>
                  <option value="verified">Verified</option>
                </Select>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search question..."
                    className="h-8 pl-8 text-xs w-36"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Continuous Scrollable Question Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No questions match the current filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterNeedsImage(false);
                    setFilterSubject('all');
                    setFilterStatus('all');
                    setSearchQuery('');
                  }}
                  className="mt-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              filteredQuestions.map((q, idx) => {
                const isArmed = armed?.questionId === q.id;
                const isExpanded = !!expandedEditors[q.id];

                return (
                  <div
                    key={q.id}
                    ref={(el) => {
                      questionCardRefs.current[q.id] = el;
                    }}
                    className={cn(
                      'rounded-xl border bg-white p-4 shadow-xs transition-all dark:bg-slate-900',
                      isArmed
                        ? 'border-accent-500 ring-2 ring-accent-400 dark:border-accent-500 dark:ring-accent-500/60'
                        : q.unresolvedTokens.length > 0
                        ? 'border-amber-300 dark:border-amber-700/60'
                        : 'border-slate-200 dark:border-slate-800',
                    )}
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          {q.sourceQno ? `Q${q.sourceQno}` : `#${idx + 1}`}
                        </span>
                        <Badge tone={q.subject === 'physics' ? 'brand' : q.subject === 'chemistry' ? 'green' : 'amber'}>
                          {q.subject}
                        </Badge>
                        <Badge>{q.type.toUpperCase()}</Badge>
                        <Badge tone={q.status === 'verified' ? 'green' : 'amber'}>{q.status}</Badge>
                        {q.difficulty && <Badge>D{q.difficulty}</Badge>}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant={q.status === 'verified' ? 'secondary' : 'accent'}
                          onClick={() => handleVerifyQuestion(q.id)}
                          disabled={q.status === 'verified'}
                          title={q.status === 'verified' ? 'Already verified' : 'Verify question'}
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>{q.status === 'verified' ? 'Verified' : 'Verify'}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setExpandedEditors((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                        >
                          {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          <span>{isExpanded ? 'Collapse' : 'Edit'}</span>
                        </Button>

                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          title="Delete Question"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Missing Image Callout Warning */}
                    {q.unresolvedTokens.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                        <span className="flex items-center gap-1.5">
                          <ImagePlus className="size-4 text-amber-600 dark:text-amber-400" />
                          <span>Image required for this question to verify:</span>
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {q.unresolvedTokens.map((placeholder) => {
                            const thisArmed = armed?.questionId === q.id && armed?.placeholderId === placeholder;
                            return (
                              <button
                                key={placeholder}
                                onClick={() =>
                                  setArmed(
                                    thisArmed
                                      ? null
                                      : { questionId: q.id, placeholderId: placeholder, sourceQno: q.sourceQno },
                                  )
                                }
                                className={cn(
                                  'rounded px-2 py-0.5 font-mono font-semibold transition-colors',
                                  thisArmed
                                    ? 'bg-accent-500 text-slate-950 ring-2 ring-accent-400'
                                    : 'bg-amber-200/80 text-amber-950 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100',
                                )}
                              >
                                {thisArmed ? '📷 Cropping: ' : 'Crop '} [[IMG:{placeholder}]]
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Question Live Preview */}
                    <div className="mt-3 space-y-2 text-sm text-slate-900 dark:text-slate-100">
                      <QuestionBody
                        body={q.body}
                        renderImage={(placeholderId) => {
                          const isResolved = q.resolvedImageMap.has(placeholderId);
                          const thisArmed = armed?.questionId === q.id && armed?.placeholderId === placeholderId;

                          if (isResolved) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setArmed(
                                    thisArmed
                                      ? null
                                      : { questionId: q.id, placeholderId, sourceQno: q.sourceQno },
                                  )
                                }
                                className="mx-1 inline-block align-middle"
                                title="Click to re-crop"
                              >
                                <Image
                                  src={`/api/files/images/${q.id}/${placeholderId}`}
                                  alt={placeholderId}
                                  width={160}
                                  height={90}
                                  unoptimized
                                  className={cn(
                                    'inline-block max-h-28 w-auto rounded border bg-white object-contain dark:bg-slate-900',
                                    thisArmed ? 'border-accent-500 ring-2 ring-accent-400' : 'border-slate-200 dark:border-slate-700',
                                  )}
                                />
                              </button>
                            );
                          }

                          return (
                            <button
                              type="button"
                              onClick={() =>
                                setArmed(
                                  thisArmed
                                    ? null
                                    : { questionId: q.id, placeholderId, sourceQno: q.sourceQno },
                                )
                              }
                              className={cn(
                                'mx-1 inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 align-middle text-xs font-semibold',
                                thisArmed
                                  ? 'border-accent-500 bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-200'
                                  : 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
                              )}
                            >
                              <ImagePlus className="size-3" />
                              <span>{placeholderId}</span>
                            </button>
                          );
                        }}
                      />

                      {/* Options rendering for MCQs */}
                      {q.type === 'mcq' && (q.options ?? []).length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(q.options ?? []).map((opt) => {
                            const isCorrect = q.answer && 'key' in q.answer && q.answer.key === opt.key;
                            return (
                              <div
                                key={opt.key}
                                className={cn(
                                  'flex items-start gap-2 rounded-lg border p-2 text-xs',
                                  isCorrect
                                    ? 'border-emerald-300 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                    : 'border-slate-200 bg-slate-50/50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200',
                                )}
                              >
                                <span className={cn('font-bold', isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500')}>
                                  {opt.key}.
                                </span>
                                <div className="min-w-0 flex-1">
                                  <QuestionBody
                                    body={opt.body}
                                    renderImage={(placeholderId) => {
                                      const isResolved = q.resolvedImageMap.has(placeholderId);
                                      if (isResolved) {
                                        return (
                                          <Image
                                            src={`/api/files/images/${q.id}/${placeholderId}`}
                                            alt={placeholderId}
                                            width={120}
                                            height={70}
                                            unoptimized
                                            className="inline-block max-h-20 w-auto rounded border border-slate-200 object-contain dark:border-slate-700"
                                          />
                                        );
                                      }
                                      return (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setArmed({
                                              questionId: q.id,
                                              placeholderId,
                                              sourceQno: q.sourceQno,
                                            })
                                          }
                                          className="mx-1 inline-flex items-center gap-1 rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                                        >
                                          <ImagePlus className="size-2.5" />
                                          {placeholderId}
                                        </button>
                                      );
                                    }}
                                  />
                                </div>
                                {isCorrect && (
                                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                                    KEY
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Integer answer key display */}
                      {q.type === 'integer' && q.answer && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                          <span>Answer Key:</span>
                          {'value' in q.answer ? (
                            <span className="font-mono font-bold">{q.answer.value}</span>
                          ) : 'min' in q.answer ? (
                            <span className="font-mono font-bold">[{q.answer.min} – {q.answer.max}]</span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Inline Expandable Question Editor */}
                    {isExpanded && (
                      <InlineQuestionEditor
                        question={q}
                        onSaved={(updated) => {
                          handleQuestionUpdated(updated);
                          setExpandedEditors((prev) => ({ ...prev, [q.id]: false }));
                        }}
                        onCancel={() => setExpandedEditors((prev) => ({ ...prev, [q.id]: false }))}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineQuestionEditor({
  question,
  onSaved,
  onCancel,
}: {
  question: Question;
  onSaved: (q: Question) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(question.body);
  const [subject, setSubject] = useState(question.subject);
  const [type, setType] = useState(question.type);
  const [options, setOptions] = useState<QuestionOption[]>(question.options ?? []);
  const [answer, setAnswer] = useState<QuestionAnswer | null>(question.answer);
  const [solution, setSolution] = useState(question.solution ?? '');
  const [difficulty, setDifficulty] = useState<number | null>(question.difficulty);
  const [expectedTimeS, setExpectedTimeS] = useState<number | null>(question.expectedTimeS);
  const [chapter, setChapter] = useState(question.chapter ?? '');
  const [topic, setTopic] = useState(question.topic ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updatedAt: new Date(question.updatedAt).toISOString(),
          subject,
          type,
          body,
          options: type === 'mcq' ? options : [],
          answer,
          solution: solution || null,
          difficulty,
          expectedTimeS,
          topic: topic || null,
          chapter: chapter || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'Save failed.');
        return;
      }
      onSaved(data);
    } catch {
      setError('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Inline Editor</h4>
      {error && <Alert tone="red">{error}</Alert>}

      <div>
        <Label>Question Body (LaTeX enabled)</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Subject</Label>
          <Select value={subject} onChange={(e) => setSubject(e.target.value as Question['subject'])}>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="maths">Maths</option>
          </Select>
        </div>
        <div>
          <Label>Type</Label>
          <Select
            value={type}
            onChange={(e) => {
              const newType = e.target.value as Question['type'];
              setType(newType);
              if (newType === 'integer') setOptions([]);
            }}
          >
            <option value="mcq">MCQ</option>
            <option value="integer">Integer</option>
          </Select>
        </div>
      </div>

      {type === 'mcq' && (
        <div className="space-y-2">
          <Label>Options</Label>
          {['A', 'B', 'C', 'D'].map((key) => {
            const opt = options.find((o) => o.key === key);
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-4 font-bold text-xs text-slate-500">{key}</span>
                <Input
                  value={opt?.body ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOptions((prev) =>
                      prev.some((o) => o.key === key)
                        ? prev.map((o) => (o.key === key ? { ...o, body: val } : o))
                        : [...prev, { key, body: val }],
                    );
                  }}
                  placeholder={`Option ${key} text`}
                  className="font-mono text-xs"
                />
              </div>
            );
          })}
        </div>
      )}

      <div>
        <Label>Answer Key</Label>
        {type === 'mcq' ? (
          <Select
            value={answer && 'key' in answer ? answer.key : ''}
            onChange={(e) => setAnswer(e.target.value ? { key: e.target.value } : null)}
          >
            <option value="">Select correct option…</option>
            {['A', 'B', 'C', 'D'].map((key) => (
              <option key={key} value={key}>
                Option {key}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            type="number"
            step="any"
            placeholder="Exact integer value"
            value={answer && 'value' in answer ? answer.value : ''}
            onChange={(e) => setAnswer(e.target.value === '' ? null : { value: Number(e.target.value) })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Difficulty (1-10)</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={difficulty ?? ''}
            onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div>
          <Label>Worked Solution</Label>
          <Input
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            placeholder="Solution notes"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
