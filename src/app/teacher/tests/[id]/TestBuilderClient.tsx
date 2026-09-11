'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Layers,
  Plus,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
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
  Dialog,
  Input,
  Label,
  Select,
  Spinner,
  StatTile,
  Textarea,
  useToast,
} from '@/components/ui';
import { QuestionBody } from '@/components/Katex';
import { fromLocalInputValue, toLocalInputValue } from '@/lib/datetime';

type AssignedQuestion = {
  testId: string;
  questionId: string;
  position: number;
  marksCorrect: string | number;
  marksWrong: string | number;
  marksUnattempted: string | number;
  subject: 'physics' | 'chemistry' | 'maths' | 'biology';
  type: 'mcq' | 'integer';
  status: 'draft' | 'verified' | 'archived';
  body: string;
  options: any[];
  humanCode: string | null;
  difficulty: number | null;
  expectedTimeS: number | null;
  chapter: string | null;
  topic: string | null;
};

type BankQuestion = {
  id: string;
  humanCode: string | null;
  subject: 'physics' | 'chemistry' | 'maths' | 'biology';
  type: 'mcq' | 'integer';
  status: 'draft' | 'verified' | 'archived';
  body: string;
  options: any[];
  difficulty: number | null;
  expectedTimeS: number | null;
  chapter: string | null;
  topic: string | null;
};

export function TestBuilderClient({
  initialTest,
  initialAssignedQuestions,
  allBankQuestions,
}: {
  initialTest: any;
  initialAssignedQuestions: AssignedQuestion[];
  allBankQuestions: BankQuestion[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [test, setTest] = useState(initialTest);
  const [assigned, setAssigned] = useState<AssignedQuestion[]>(initialAssignedQuestions);
  const [activeTab, setActiveTab] = useState<'questions' | 'picker' | 'settings'>('questions');

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Question order and marks live in React state until "Save Questions" is
  // pressed, so navigating away silently discarded them with no warning.
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Debounced autosave (1500ms)
  useEffect(() => {
    if (!questionsDirty || saving) return;
    const timer = setTimeout(() => {
      saveQuestions();
    }, 1500);
    return () => clearTimeout(timer);
  }, [questionsDirty, assigned]);

  async function handleCloneTest() {
    setCloning(true);
    try {
      const res = await fetch(`/api/tests/${test.id}/clone`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to clone test');
      toast.success(json.message);
      router.push(`/teacher/tests/${json.test.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCloning(false);
    }
  }

  useEffect(() => {
    if (!questionsDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [questionsDirty]);

  // Settings form state
  const [title, setTitle] = useState(test.title);
  const [description, setDescription] = useState(test.description ?? '');
  const [durationMin, setDurationMin] = useState(Math.round(test.durationS / 60));
  // toLocalInputValue / fromLocalInputValue, not slice(0,16) / new Date(...).
  // The old pair were not inverses and shifted the window by the UTC offset on
  // every save — compounding each time the settings tab was opened.
  const [opensAt, setOpensAt] = useState(toLocalInputValue(test.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalInputValue(test.closesAt));
  const [maxAttempts, setMaxAttempts] = useState(test.maxAttempts);
  const [shuffleQuestions, setShuffleQuestions] = useState(test.shuffleQuestions);
  const [shuffleOptions, setShuffleOptions] = useState(test.shuffleOptions);
  const [resultsPolicy, setResultsPolicy] = useState(test.resultsPolicy);

  // Picker filters
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('verified');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewQid, setPreviewQid] = useState<string | null>(null);

  // Stats calculation
  const assignedIds = useMemo(() => new Set(assigned.map((q) => q.questionId)), [assigned]);

  const subjectCounts = useMemo(() => {
    const counts = { physics: 0, chemistry: 0, maths: 0, biology: 0 };
    for (const q of assigned) {
      if (counts[q.subject] !== undefined) counts[q.subject]++;
    }
    return counts;
  }, [assigned]);

  const totalMaxMarks = useMemo(() => {
    return assigned.reduce((sum, q) => sum + Number(q.marksCorrect ?? 4), 0);
  }, [assigned]);

  const unverifiedInTest = useMemo(() => {
    return assigned.filter((q) => q.status !== 'verified');
  }, [assigned]);

  // Picker filtered items
  const filteredBank = useMemo(() => {
    return allBankQuestions.filter((q) => {
      if (assignedIds.has(q.id)) return false; // Already added
      if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
      if (filterType !== 'all' && q.type !== filterType) return false;
      if (filterStatus !== 'all' && q.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesBody = q.body.toLowerCase().includes(query);
        const matchesCode = q.humanCode?.toLowerCase().includes(query);
        const matchesChapter = q.chapter?.toLowerCase().includes(query);
        if (!matchesBody && !matchesCode && !matchesChapter) return false;
      }
      return true;
    });
  }, [allBankQuestions, assignedIds, filterSubject, filterType, filterStatus, searchQuery]);

  /** Every write to the assigned list goes through here so `questionsDirty`
   *  can never drift out of sync with what is on screen. */
  const updateAssigned = useCallback((next: AssignedQuestion[]) => {
    setAssigned(next.map((q, i) => ({ ...q, position: i + 1 })));
    setQuestionsDirty(true);
  }, []);

  // Move question
  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= assigned.length) return;

    const copy = [...assigned];
    const item = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = item;

    updateAssigned(copy);
  };

  // Add question from picker
  const addQuestion = (q: BankQuestion) => {
    const newAssigned: AssignedQuestion = {
      testId: test.id,
      questionId: q.id,
      position: assigned.length + 1,
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
      subject: q.subject,
      type: q.type,
      status: q.status,
      body: q.body,
      options: q.options,
      humanCode: q.humanCode,
      difficulty: q.difficulty,
      expectedTimeS: q.expectedTimeS,
      chapter: q.chapter,
      topic: q.topic,
    };
    updateAssigned([...assigned, newAssigned]);
  };

  // Remove question
  const removeQuestion = (questionId: string) => {
    updateAssigned(assigned.filter((q) => q.questionId !== questionId));
  };

  // Bulk set marks preset. JEE Main gives numerical questions no negative
  // marking; the button label says so rather than claiming a flat +4/-1/0.
  const applyJeePresetMarks = () => {
    updateAssigned(
      assigned.map((q) => ({
        ...q,
        marksCorrect: 4,
        marksWrong: q.type === 'mcq' ? -1 : 0,
        marksUnattempted: 0,
      })),
    );
  };

  // Update marks for individual question
  const updateQuestionMarks = (index: number, field: 'marksCorrect' | 'marksWrong' | 'marksUnattempted', value: number) => {
    const copy = [...assigned];
    copy[index] = { ...copy[index], [field]: value };
    updateAssigned(copy);
  };

  // Save questions. Returns whether the write actually landed — handlePublish
  // used to `await saveQuestions()` and carry on regardless, so a failed save
  // published whatever question set was last persisted while the teacher looked
  // at the on-screen list they thought they had just published.
  const saveQuestions = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const payload = {
        questions: assigned.map((q, idx) => ({
          questionId: q.questionId,
          position: idx + 1,
          marksCorrect: Number(q.marksCorrect),
          marksWrong: Number(q.marksWrong),
          marksUnattempted: Number(q.marksUnattempted),
        })),
      };

      const res = await fetch(`/api/tests/${test.id}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to save questions');

      setQuestionsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save questions');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save Settings
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/tests/${test.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          durationS: durationMin * 60,
          opensAt: fromLocalInputValue(opensAt),
          closesAt: fromLocalInputValue(closesAt),
          maxAttempts: Number(maxAttempts),
          shuffleQuestions,
          shuffleOptions,
          resultsPolicy,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update test settings');

      setTest(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Publish Test
  const handlePublish = async () => {
    if (unverifiedInTest.length > 0) {
      setError(
        `Publish Gate Blocked: ${unverifiedInTest.length} question(s) in this test are not verified. All questions must be verified before publishing.`,
      );
      return;
    }

    if (assigned.length === 0) {
      setError('Cannot publish a test with no questions.');
      return;
    }

    // Save questions first — and stop if that failed, rather than publishing a
    // question set that differs from what is on screen.
    const saved = await saveQuestions();
    if (!saved) return;

    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/publish`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The API spreads HttpError.extra at the top level, so the unverified
        // list is data.unverified — not data.details.unverified.
        if (Array.isArray(data?.unverified) && data.unverified.length > 0) {
          const list = data.unverified
            .map((u: { position?: number; humanCode?: string; subject?: string }) =>
              `Q${u.position ?? '?'} ${u.humanCode ?? ''} (${u.subject ?? '—'})`.trim(),
            )
            .join(', ');
          throw new Error(`Cannot publish — these questions are not verified: ${list}`);
        }
        throw new Error(data?.message || 'Failed to publish test');
      }

      setTest(data);
      setNotice('Test published. Students can now see and attempt it.');
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish test');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/publish`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to unpublish test');
      setTest(data);
      setNotice('Test withdrawn. Students can no longer see it.');
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish test');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/teacher/tests" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
              ← Tests
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{test.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{test.title}</h1>
            {test.isPublished ? (
              <Badge tone="green">Published</Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
            <Badge tone="slate">{Math.round(test.durationS / 60)} min</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/teacher/tests/${test.id}/analytics`}
            className={buttonClass('secondary', 'sm')}
          >
            <BarChart3 className="mr-1 size-3.5" />
            Analytics
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCloneTest}
            disabled={cloning}
            title="Create an editable duplicate draft of this test"
          >
            {cloning ? <Spinner className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
            Clone Draft
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPreviewIndex(0);
              setPreviewOpen(true);
            }}
            disabled={assigned.length === 0}
            title="Preview test questions in student exam mode"
          >
            <Eye className="mr-1 size-3.5" />
            Preview
          </Button>

          <div className="mx-1 hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

          {saving ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Spinner className="size-3" /> Autosaving…
            </span>
          ) : saveSuccess ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Check className="size-3" /> Saved
            </span>
          ) : questionsDirty ? (
            <Badge tone="amber">Unsaved changes</Badge>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">All changes saved</span>
          )}

          <Button variant="secondary" size="sm" onClick={saveQuestions} disabled={saving || !questionsDirty}>
            {saving ? <Spinner className="size-3.5" /> : <Save className="mr-1 size-3.5" />}
            Save
          </Button>

          {!test.isPublished ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={publishing || unverifiedInTest.length > 0 || assigned.length === 0}
            >
              {publishing ? <Spinner className="size-3.5" /> : <Send className="mr-1 size-3.5" />}
              Publish Test
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={handleUnpublish} disabled={publishing}>
              {publishing ? <Spinner className="size-3.5" /> : null}
              Unpublish
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert tone="red" title="Could not complete that">
          {error}
        </Alert>
      )}

      {notice && <Alert tone="green">{notice}</Alert>}

      {/* Unverified questions warning banner */}
      {unverifiedInTest.length > 0 && (
        <Alert tone="amber" title="Publish Gate Warning">
          This test currently contains <strong>{unverifiedInTest.length} unverified question(s)</strong>.
          You can test and organize them now, but you will not be able to publish this test until every question is verified in the question editor.
          <div className="mt-2 flex flex-wrap gap-2">
            {unverifiedInTest.map((u) => (
              <Link
                key={u.questionId}
                href={`/teacher/questions/${u.questionId}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                Q{u.position}: {u.humanCode ?? u.questionId.slice(0, 8)} ({u.subject})
                <ExternalLink className="size-2.5" />
              </Link>
            ))}
          </div>
        </Alert>
      )}

      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('questions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'questions'
              ? 'border-brand-700 text-brand-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="size-4" />
          Assigned Questions ({assigned.length})
        </button>

        <button
          onClick={() => setActiveTab('picker')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'picker'
              ? 'border-brand-700 text-brand-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Plus className="size-4" />
          Add from Bank ({filteredBank.length} available)
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'border-brand-700 text-brand-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="size-4" />
          Test Settings
        </button>
      </div>

      {/* Tab 1: Assigned Questions */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {/* Summary Metric Chips */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <StatTile label="Total Questions" value={assigned.length} tone="slate" />
            <StatTile label="Physics" value={subjectCounts.physics} tone="blue" />
            <StatTile label="Chemistry" value={subjectCounts.chemistry} tone="emerald" />
            <StatTile label="Maths" value={subjectCounts.maths} tone="amber" />
            <StatTile label="Biology" value={subjectCounts.biology} tone="purple" />
            <StatTile label="Max Marks" value={totalMaxMarks} tone="brand" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Use the arrows to reorder questions. Scoring can be set per question.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={applyJeePresetMarks}>
                <Sparkles className="mr-1 size-3.5 text-amber-500" />
                Apply JEE defaults (MCQ +4/−1/0 · Numerical +4/0/0)
              </Button>
              <Button variant="primary" size="sm" onClick={() => setActiveTab('picker')}>
                <Plus className="mr-1 size-3.5" />
                Add More Questions
              </Button>
            </div>
          </div>

          {assigned.length === 0 ? (
            <Card className="border-dashed p-10 text-center">
              <Layers className="mx-auto size-10 text-slate-300 dark:text-slate-700" />
              <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">No questions added yet</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Click &quot;Add from Bank&quot; to pick verified questions from Physics, Chemistry, and Mathematics.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => setActiveTab('picker')}
              >
                Browse Question Bank
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {assigned.map((q, idx) => (
                <Card key={q.questionId} className="transition-all hover:border-slate-300">
                  <CardBody className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      {/* Left: Position & Question details */}
                      <div className="flex items-start gap-3">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white dark:bg-slate-700">
                          {q.position}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {q.humanCode ?? `Question #${idx + 1}`}
                            </span>
                            <Badge
                              tone={
                                q.subject === 'physics'
                                  ? 'brand'
                                  : q.subject === 'chemistry'
                                  ? 'green'
                                  : q.subject === 'maths'
                                  ? 'amber'
                                  : 'purple'
                              }
                            >
                              {q.subject.toUpperCase()}
                            </Badge>
                            <Badge tone="slate">{q.type.toUpperCase()}</Badge>
                            {q.status === 'verified' ? (
                              <Badge tone="green">Verified</Badge>
                            ) : (
                              <Badge tone="amber">Unverified</Badge>
                            )}
                            {q.chapter && <span className="text-xs text-slate-500 dark:text-slate-400">• {q.chapter}</span>}
                          </div>

                          {/* Question body preview */}
                          <div className="line-clamp-2 text-xs text-slate-700 dark:text-slate-300">
                            {previewQid === q.questionId ? (
                              <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
                                <QuestionBody
                                  body={q.body}
                                  renderImage={(id) => (
                                    <span className="rounded bg-brand-50 px-1 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                                      [IMG:{id}]
                                    </span>
                                  )}
                                />
                              </div>
                            ) : (
                              q.body.slice(0, 140) + (q.body.length > 140 ? '...' : '')
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setPreviewQid(previewQid === q.questionId ? null : q.questionId)}
                            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                          >
                            {previewQid === q.questionId ? 'Collapse preview' : 'View full KaTeX preview'}
                          </button>
                        </div>
                      </div>

                      {/* Right: Scoring scheme & Actions */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-md bg-slate-50 p-1.5 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
                          <div className="text-center">
                            <span className="block text-xs font-bold text-emerald-700 dark:text-emerald-400">+Correct</span>
                            <input
                              type="number"
                              value={q.marksCorrect}
                              onChange={(e) => updateQuestionMarks(idx, 'marksCorrect', Number(e.target.value))}
                              className="h-6 w-12 tnum rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="text-center">
                            <span className="block text-xs font-bold text-red-700 dark:text-red-400">-Wrong</span>
                            <input
                              type="number"
                              value={q.marksWrong}
                              onChange={(e) => updateQuestionMarks(idx, 'marksWrong', Number(e.target.value))}
                              className="h-6 w-12 tnum rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="text-center">
                            <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">Unatt</span>
                            <input
                              type="number"
                              value={q.marksUnattempted}
                              onChange={(e) => updateQuestionMarks(idx, 'marksUnattempted', Number(e.target.value))}
                              className="h-6 w-12 tnum rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>

                        {/* Move & Delete */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, 'up')}
                            disabled={idx === 0}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            title="Move up"
                          >
                            <ArrowUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, 'down')}
                            disabled={idx === assigned.length - 1}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            title="Move down"
                          >
                            <ArrowDown className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeQuestion(q.questionId)}
                            className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            title="Remove from test"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Question Bank Picker */}
      {activeTab === 'picker' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search question text, chapter, code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="w-36">
                  <Select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                    <option value="all">All Subjects</option>
                    <option value="physics">Physics</option>
                    <option value="chemistry">Chemistry</option>
                    <option value="maths">Mathematics</option>
                    <option value="biology">Biology</option>
                  </Select>
                </div>

                <div className="w-32">
                  <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    <option value="mcq">MCQ</option>
                    <option value="integer">Integer</option>
                  </Select>
                </div>

                <div className="w-32">
                  <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="verified">Verified only</option>
                    <option value="draft">Drafts</option>
                  </Select>
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filteredBank.length} question(s) from the bank not yet in this test.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                // Batch add all filtered verified questions
                const verifiedOnly = filteredBank.filter((q) => q.status === 'verified');
                if (verifiedOnly.length === 0) return;
                const newItems: AssignedQuestion[] = verifiedOnly.map((q, i) => ({
                  testId: test.id,
                  questionId: q.id,
                  position: assigned.length + i + 1,
                  marksCorrect: 4,
                  marksWrong: q.type === 'mcq' ? -1 : 0,
                  marksUnattempted: 0,
                  subject: q.subject,
                  type: q.type,
                  status: q.status,
                  body: q.body,
                  options: q.options,
                  humanCode: q.humanCode,
                  difficulty: q.difficulty,
                  expectedTimeS: q.expectedTimeS,
                  chapter: q.chapter,
                  topic: q.topic,
                }));
                updateAssigned([...assigned, ...newItems]);
              }}
              disabled={filteredBank.filter((q) => q.status === 'verified').length === 0}
            >
              Add All Filtered Verified ({filteredBank.filter((q) => q.status === 'verified').length})
            </Button>
          </div>

          <div className="space-y-2">
            {filteredBank.map((q) => (
              <Card key={q.id} className="transition-colors hover:border-slate-300">
                <CardBody className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{q.humanCode ?? q.id.slice(0, 8)}</span>
                      <Badge
                        tone={
                          q.subject === 'physics'
                            ? 'brand'
                            : q.subject === 'chemistry'
                            ? 'green'
                            : q.subject === 'maths'
                            ? 'amber'
                            : 'purple'
                        }
                      >
                        {q.subject.toUpperCase()}
                      </Badge>
                      <Badge tone="slate">{q.type.toUpperCase()}</Badge>
                      {q.status === 'verified' ? (
                        <Badge tone="green">Verified</Badge>
                      ) : (
                        <Badge tone="amber">Draft</Badge>
                      )}
                      {q.chapter && <span className="text-xs text-slate-500 dark:text-slate-400">• {q.chapter}</span>}
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      <QuestionBody
                        body={q.body}
                        renderImage={(id) => (
                          <span className="rounded bg-brand-50 px-1 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                            [IMG:{id}]
                          </span>
                        )}
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button variant="primary" size="sm" onClick={() => addQuestion(q)}>
                      <Plus className="mr-1 size-3.5" />
                      Add to Test
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}

            {filteredBank.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">
                No matching questions found in bank with current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Test Settings */}
      {activeTab === 'settings' && (
        <form onSubmit={saveSettings} className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Edit Test Parameters</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <Label htmlFor="title">Test Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="duration">Duration (Minutes) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    max={1440}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="maxAttempts">Max Retakes / Attempts *</Label>
                  <Input
                    id="maxAttempts"
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="opensAt">Opening Window</Label>
                  <Input
                    id="opensAt"
                    type="datetime-local"
                    value={opensAt}
                    onChange={(e) => setOpensAt(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="closesAt">Closing Window</Label>
                  <Input
                    id="closesAt"
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <Label htmlFor="resultsPolicy">Results & Solutions Release Policy</Label>
                <Select
                  id="resultsPolicy"
                  value={resultsPolicy}
                  onChange={(e) => setResultsPolicy(e.target.value)}
                >
                  <option value="immediate">Immediate (Show answers & solutions right after submit)</option>
                  <option value="on_release">On Release (Hide solutions until teacher clicks &apos;Release Results&apos;)</option>
                </Select>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Label>Shuffle Options</Label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-700"
                  />
                  Shuffle questions per student
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={shuffleOptions}
                    onChange={(e) => setShuffleOptions(e.target.checked)}
                    className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-700"
                  />
                  Shuffle MCQ options per student
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? <Spinner className="size-4" /> : 'Save Settings'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>
      )}

      {/* Student View Preview Modal */}
      {previewOpen && assigned[previewIndex] && (
        <Dialog
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          size="xl"
          title={
            <div className="flex items-center justify-between gap-4">
              <span>
                Student Preview: Question {previewIndex + 1} of {assigned.length}
              </span>
              <span className="font-mono text-xs font-normal text-slate-500">
                {assigned[previewIndex].subject.toUpperCase()} · {assigned[previewIndex].type.toUpperCase()}
              </span>
            </div>
          }
          footer={
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                  disabled={previewIndex === 0}
                >
                  ← Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewIndex((i) => Math.min(assigned.length - 1, i + 1))}
                  disabled={previewIndex === assigned.length - 1}
                >
                  Next →
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
                Close Preview
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Quick Question Picker Strip */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-50 p-2 dark:bg-slate-950">
              {assigned.map((q, idx) => (
                <button
                  key={q.questionId}
                  onClick={() => setPreviewIndex(idx)}
                  className={`flex size-7 shrink-0 items-center justify-center rounded text-xs font-bold transition-all ${
                    idx === previewIndex
                      ? 'bg-brand-700 text-white shadow-xs dark:bg-brand-600'
                      : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            {/* Question Info Bar */}
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    assigned[previewIndex].subject === 'physics'
                      ? 'brand'
                      : assigned[previewIndex].subject === 'chemistry'
                      ? 'green'
                      : assigned[previewIndex].subject === 'maths'
                      ? 'amber'
                      : 'purple'
                  }
                >
                  {assigned[previewIndex].subject}
                </Badge>
                {assigned[previewIndex].chapter ? <span>{assigned[previewIndex].chapter}</span> : null}
              </div>
              <div className="font-mono">
                <span className="font-bold text-emerald-600">+{assigned[previewIndex].marksCorrect}.00</span>
                <span className="mx-1 text-slate-400">/</span>
                <span className="font-bold text-red-600">{assigned[previewIndex].marksWrong}.00</span>
              </div>
            </div>

            {/* Question Body */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900">
              <QuestionBody
                body={assigned[previewIndex].body}
                renderImage={(placeholderId) => (
                  <div className="my-2 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                    <img
                      src={`/api/files/images/${assigned[previewIndex].questionId}/${placeholderId}`}
                      alt="Question figure"
                      className="max-h-64 object-contain"
                    />
                  </div>
                )}
              />
            </div>

            {/* Options / Answer Area */}
            {assigned[previewIndex].type === 'mcq' ? (
              <div className="space-y-2">
                <Label>Answer Options (Select One):</Label>
                <div className="grid gap-2">
                  {(assigned[previewIndex].options ?? []).map((opt: any) => (
                    <div
                      key={opt.key}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
                        {opt.key}
                      </span>
                      <div className="flex-1">
                        <QuestionBody
                          body={opt.body}
                          renderImage={(imgId) => (
                            <img
                              src={`/api/files/images/${assigned[previewIndex].questionId}/${imgId}`}
                              alt="Option figure"
                              className="my-1 max-h-32 object-contain"
                            />
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Numerical Value Entry (Student Input):</Label>
                <input
                  type="text"
                  disabled
                  placeholder="e.g. 42 or 3.14"
                  className="h-10 w-48 rounded-md border border-slate-300 bg-slate-50 px-3 text-center font-mono font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950"
                />
                <p className="text-xs text-slate-400">
                  Accepts integer or decimal input.
                </p>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
