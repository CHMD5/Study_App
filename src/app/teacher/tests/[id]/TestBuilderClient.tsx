'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Filter,
  Layers,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Alert, Badge, Button, buttonClass, Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Spinner, Textarea } from '@/components/ui';
import { KatexSpan, QuestionBody } from '@/components/Katex';

type AssignedQuestion = {
  testId: string;
  questionId: string;
  position: number;
  marksCorrect: string | number;
  marksWrong: string | number;
  marksUnattempted: string | number;
  subject: 'physics' | 'chemistry' | 'maths';
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
  subject: 'physics' | 'chemistry' | 'maths';
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
  const [test, setTest] = useState(initialTest);
  const [assigned, setAssigned] = useState<AssignedQuestion[]>(initialAssignedQuestions);
  const [activeTab, setActiveTab] = useState<'questions' | 'picker' | 'settings'>('questions');

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings form state
  const [title, setTitle] = useState(test.title);
  const [description, setDescription] = useState(test.description ?? '');
  const [durationMin, setDurationMin] = useState(Math.round(test.durationS / 60));
  const [opensAt, setOpensAt] = useState(test.opensAt ? test.opensAt.slice(0, 16) : '');
  const [closesAt, setClosesAt] = useState(test.closesAt ? test.closesAt.slice(0, 16) : '');
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
    const counts = { physics: 0, chemistry: 0, maths: 0 };
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

  // Move question
  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= assigned.length) return;

    const copy = [...assigned];
    const item = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = item;

    // Renumber positions
    const renumbered = copy.map((q, i) => ({ ...q, position: i + 1 }));
    setAssigned(renumbered);
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
    setAssigned([...assigned, newAssigned]);
  };

  // Remove question
  const removeQuestion = (questionId: string) => {
    const filtered = assigned.filter((q) => q.questionId !== questionId);
    const renumbered = filtered.map((q, i) => ({ ...q, position: i + 1 }));
    setAssigned(renumbered);
  };

  // Bulk set marks preset
  const applyJeePresetMarks = () => {
    const updated = assigned.map((q) => ({
      ...q,
      marksCorrect: 4,
      marksWrong: q.type === 'mcq' ? -1 : 0, // Integer typically 0 negative in some JEE patterns, or -1
      marksUnattempted: 0,
    }));
    setAssigned(updated);
  };

  // Update marks for individual question
  const updateQuestionMarks = (index: number, field: 'marksCorrect' | 'marksWrong' | 'marksUnattempted', value: number) => {
    const copy = [...assigned];
    copy[index] = { ...copy[index], [field]: value };
    setAssigned(copy);
  };

  // Save questions
  const saveQuestions = async () => {
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

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to save questions');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err.message);
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
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
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

    // Save questions first if pending
    await saveQuestions();

    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/publish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to publish test');

      setTest(data);
      alert('Test published successfully! Students can now access and attempt this test.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/teacher/tests" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              ← Tests
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-medium text-slate-700">{test.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{test.title}</h1>
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
            onClick={saveQuestions}
            disabled={saving}
          >
            {saving ? <Spinner className="size-3.5" /> : <Save className="mr-1 size-3.5" />}
            {saveSuccess ? 'Saved!' : 'Save Questions'}
          </Button>

          {!test.isPublished && (
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={publishing || unverifiedInTest.length > 0 || assigned.length === 0}
            >
              {publishing ? <Spinner className="size-3.5" /> : <Send className="mr-1 size-3.5" />}
              Publish Test
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert tone="red" title="Notice">
          {error}
        </Alert>
      )}

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
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
              >
                Q{u.position}: {u.humanCode ?? u.questionId.slice(0, 8)} ({u.subject})
                <ExternalLink className="size-2.5" />
              </Link>
            ))}
          </div>
        </Alert>
      )}

      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('questions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'questions'
              ? 'border-brand-700 text-brand-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-900'
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
              : 'border-transparent text-slate-500 hover:text-slate-900'
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
              : 'border-transparent text-slate-500 hover:text-slate-900'
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card>
              <CardBody className="py-2.5 text-center">
                <p className="text-xs text-slate-500">Total Questions</p>
                <p className="text-xl font-bold text-slate-900">{assigned.length}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="py-2.5 text-center">
                <p className="text-xs text-slate-500">Physics</p>
                <p className="text-xl font-bold text-blue-700">{subjectCounts.physics}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="py-2.5 text-center">
                <p className="text-xs text-slate-500">Chemistry</p>
                <p className="text-xl font-bold text-emerald-700">{subjectCounts.chemistry}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="py-2.5 text-center">
                <p className="text-xs text-slate-500">Maths</p>
                <p className="text-xl font-bold text-purple-700">{subjectCounts.maths}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="py-2.5 text-center">
                <p className="text-xs text-slate-500">Max Marks</p>
                <p className="text-xl font-bold text-amber-700">{totalMaxMarks}</p>
              </CardBody>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Drag or use arrows to change position order. Scoring rules can be customized per question.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={applyJeePresetMarks}>
                <Sparkles className="mr-1 size-3.5 text-amber-500" />
                Apply JEE Defaults (+4 / -1 / 0)
              </Button>
              <Button variant="primary" size="sm" onClick={() => setActiveTab('picker')}>
                <Plus className="mr-1 size-3.5" />
                Add More Questions
              </Button>
            </div>
          </div>

          {assigned.length === 0 ? (
            <Card className="border-dashed p-10 text-center">
              <Layers className="mx-auto size-10 text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-800">No questions added yet</h3>
              <p className="mt-1 text-xs text-slate-500">
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
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
                          {q.position}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {q.humanCode ?? `Question #${idx + 1}`}
                            </span>
                            <Badge
                              tone={
                                q.subject === 'physics'
                                  ? 'brand'
                                  : q.subject === 'chemistry'
                                  ? 'green'
                                  : 'amber'
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
                            {q.chapter && <span className="text-xs text-slate-500">• {q.chapter}</span>}
                          </div>

                          {/* Question body preview */}
                          <div className="line-clamp-2 text-xs text-slate-700">
                            {previewQid === q.questionId ? (
                              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                                <QuestionBody
                                  body={q.body}
                                  renderImage={(id) => (
                                    <span className="rounded bg-brand-50 px-1 py-0.5 font-mono text-[10px] text-brand-700">
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
                            className="text-[11px] font-medium text-brand-700 hover:underline"
                          >
                            {previewQid === q.questionId ? 'Collapse preview' : 'View full KaTeX preview'}
                          </button>
                        </div>
                      </div>

                      {/* Right: Scoring scheme & Actions */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-md bg-slate-50 p-1.5 ring-1 ring-slate-200">
                          <div className="text-center">
                            <span className="block text-[9px] font-bold text-emerald-700">+Correct</span>
                            <input
                              type="number"
                              value={q.marksCorrect}
                              onChange={(e) => updateQuestionMarks(idx, 'marksCorrect', Number(e.target.value))}
                              className="h-6 w-12 rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900"
                            />
                          </div>

                          <div className="text-center">
                            <span className="block text-[9px] font-bold text-red-700">-Wrong</span>
                            <input
                              type="number"
                              value={q.marksWrong}
                              onChange={(e) => updateQuestionMarks(idx, 'marksWrong', Number(e.target.value))}
                              className="h-6 w-12 rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900"
                            />
                          </div>

                          <div className="text-center">
                            <span className="block text-[9px] font-bold text-slate-500">Unatt</span>
                            <input
                              type="number"
                              value={q.marksUnattempted}
                              onChange={(e) => updateQuestionMarks(idx, 'marksUnattempted', Number(e.target.value))}
                              className="h-6 w-12 rounded border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900"
                            />
                          </div>
                        </div>

                        {/* Move & Delete */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, 'up')}
                            disabled={idx === 0}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, 'down')}
                            disabled={idx === assigned.length - 1}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeQuestion(q.questionId)}
                            className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
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
              Showing {filteredBank.length} question(s) from bank not yet in this test.
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
                setAssigned([...assigned, ...newItems]);
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
                      <span className="font-semibold text-slate-900">{q.humanCode ?? q.id.slice(0, 8)}</span>
                      <Badge
                        tone={
                          q.subject === 'physics'
                            ? 'brand'
                            : q.subject === 'chemistry'
                            ? 'green'
                            : 'amber'
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
                      {q.chapter && <span className="text-xs text-slate-500">• {q.chapter}</span>}
                    </div>

                    <div className="text-xs text-slate-700">
                      <QuestionBody
                        body={q.body}
                        renderImage={(id) => (
                          <span className="rounded bg-brand-50 px-1 py-0.5 font-mono text-[10px] text-brand-700">
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
              <div className="p-8 text-center text-xs text-slate-400">
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

              <div className="border-t border-slate-100 pt-4">
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

              <div className="space-y-2 border-t border-slate-100 pt-4">
                <Label>Shuffle Options</Label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  />
                  Shuffle questions per student
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={shuffleOptions}
                    onChange={(e) => setShuffleOptions(e.target.checked)}
                    className="rounded border-slate-300 text-brand-700 focus:ring-brand-500"
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
    </div>
  );
}
