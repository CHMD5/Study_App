'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  HelpCircle,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Alert, Badge, Button, buttonClass, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui';
import { KatexSpan, QuestionBody } from '@/components/Katex';

type ReviewQuestion = {
  id: string;
  position: number;
  humanCode: string | null;
  body: string;
  type: 'mcq' | 'integer';
  options: any[];
  answer: any;
  solution: string | null;
  difficulty: number | null;
  expectedTimeS: number | null;
  subject: 'physics' | 'chemistry' | 'maths';
  chapter: string | null;
  topic: string | null;
  marks: {
    correct: number;
    wrong: number;
    unattempted: number;
  };
  response: { key?: string; value?: number | string } | null;
  state: string;
  isCorrect: boolean | null;
  isAttempted: boolean;
  marksAwarded: number;
  timeSpentMs: number;
  isOvertime: boolean;
};

type ResultData = {
  attemptId: string;
  testId: string;
  testTitle: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  submittedAt: string;
  totalTimeS: number;
  totalMarks: number;
  maxMarks: number;
  rank: number;
  percentile: number;
  totalParticipants: number;
  summary: {
    totalQuestions: number;
    correctCount: number;
    wrongCount: number;
    unattemptedCount: number;
    accuracy: number;
    subjectScores: Record<
      string,
      { marks: number; maxMarks: number; correct: number; total: number }
    >;
  };
  questions: ReviewQuestion[];
};

export function ResultReviewClient({
  attemptId,
  userRole,
}: {
  attemptId: string;
  userRole: 'student' | 'teacher';
}) {
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awaitingRelease, setAwaitingRelease] = useState(false);

  // Filters
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // all, correct, wrong, unattempted, overtime

  useEffect(() => {
    async function loadResult() {
      try {
        setLoading(true);
        const res = await fetch(`/api/attempts/${attemptId}/result`);
        const json = await res.json();

        if (!res.ok) {
          if (res.status === 403 && json.error === 'awaiting_release') {
            setAwaitingRelease(true);
            setLoading(false);
            return;
          }
          throw new Error(json.message || 'Failed to load test results');
        }

        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  const filteredQuestions = useMemo(() => {
    if (!data) return [];
    return data.questions.filter((q) => {
      if (filterSubject !== 'all' && q.subject !== filterSubject) return false;
      if (filterStatus === 'correct' && q.isCorrect !== true) return false;
      if (filterStatus === 'wrong' && (q.isCorrect !== false || !q.isAttempted)) return false;
      if (filterStatus === 'unattempted' && q.isAttempted) return false;
      if (filterStatus === 'overtime' && !q.isOvertime) return false;
      return true;
    });
  }, [data, filterSubject, filterStatus]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Spinner className="size-8 text-brand-700" />
        <p className="text-sm font-medium">Loading scorecard and worked solutions...</p>
      </div>
    );
  }

  if (awaitingRelease) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <Card className="p-8">
          <Clock className="mx-auto size-12 text-brand-600" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">Results Pending Release</h2>
          <p className="mt-1 text-xs text-slate-500">
            Your attempt was successfully submitted! The results and step-by-step solutions for this test will be released by your teacher once all candidates have finished.
          </p>
          <Link href="/student" className={buttonClass('primary', 'md', 'mt-5')}>
            ← Return to My Tests
          </Link>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <Alert tone="red" title="Error">
          {error ?? 'Result not found'}
        </Alert>
        <Link href={userRole === 'teacher' ? '/teacher/tests' : '/student'} className={buttonClass('secondary', 'md', 'mt-4')}>
          Return
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Navigation breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={userRole === 'teacher' ? `/teacher/tests/${data.testId}/analytics` : '/student'}
          className="text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          ← {userRole === 'teacher' ? 'Back to test analytics' : 'Back to tests'}
        </Link>
      </div>

      {/* 1. Scorecard Hero Banner */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 via-brand-950 to-brand-900 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand-800/90 px-2.5 py-0.5 text-xs font-semibold text-accent-400">
              <Sparkles className="mr-1 size-3" />
              Scorecard & Solutions
            </span>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white">{data.testTitle}</h1>
            <p className="mt-0.5 text-xs text-slate-300">
              Submitted on {new Date(data.submittedAt).toLocaleDateString()} at{' '}
              {new Date(data.submittedAt).toLocaleTimeString()}
            </p>
          </div>

          <div className="flex items-baseline gap-2 rounded-xl bg-white/10 px-5 py-3 backdrop-blur-sm">
            <span className="text-3xl font-black text-white">{data.totalMarks}</span>
            <span className="text-sm font-semibold text-slate-300">/ {data.maxMarks} Marks</span>
          </div>
        </div>

        {/* Hero KPI metrics grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-6 sm:grid-cols-5">
          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Rank</p>
            <p className="mt-0.5 text-xl font-bold text-white">
              #{data.rank} <span className="text-xs font-normal text-slate-400">of {data.totalParticipants}</span>
            </p>
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Percentile</p>
            <p className="mt-0.5 text-xl font-bold text-accent-400">{data.percentile} %ile</p>
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Accuracy</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-400">{data.summary.accuracy}%</p>
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Time Spent</p>
            <p className="mt-0.5 text-xl font-bold text-white">{Math.round(data.totalTimeS / 60)} min</p>
          </div>

          <div className="col-span-2 rounded-lg bg-white/5 p-3 text-center sm:col-span-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Correct / Wrong</p>
            <p className="mt-0.5 text-xl font-bold text-white">
              <span className="text-emerald-400">{data.summary.correctCount}</span>
              <span className="mx-1 text-slate-400">/</span>
              <span className="text-red-400">{data.summary.wrongCount}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. Subject Breakdown Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['physics', 'chemistry', 'maths'] as const).map((s) => {
          const stats = data.summary.subjectScores[s] ?? { marks: 0, maxMarks: 0, correct: 0, total: 0 };
          const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
          return (
            <Card key={s} className="border-slate-200">
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{s}</span>
                  <Badge
                    tone={s === 'physics' ? 'brand' : s === 'chemistry' ? 'green' : 'amber'}
                  >
                    {stats.marks} / {stats.maxMarks} M
                  </Badge>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl font-black text-slate-900">{stats.marks} Marks</span>
                  <span className="text-xs font-medium text-slate-500">{acc}% Accuracy</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${
                      s === 'physics' ? 'bg-brand-600' : s === 'chemistry' ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, (stats.marks / Math.max(1, stats.maxMarks)) * 100))}%` }}
                  />
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 3. Detailed Question Solutions Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Question-by-Question Solutions</h2>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Subject Filters */}
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {(['all', 'physics', 'chemistry', 'maths'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterSubject(s)}
                  className={`rounded px-2.5 py-1 capitalize transition-colors ${
                    filterSubject === s ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Status Filters */}
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {[
                { id: 'all', label: 'All' },
                { id: 'correct', label: 'Correct' },
                { id: 'wrong', label: 'Wrong' },
                { id: 'unattempted', label: 'Unattempted' },
                { id: 'overtime', label: 'Overtime (>1.5x)' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFilterStatus(st.id)}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    filterStatus === st.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.map((q) => {
            const timeTakenSec = Math.round((q.timeSpentMs ?? 0) / 1000);
            const expectedSec = q.expectedTimeS ?? 120;

            let cardBorder = 'border-slate-200';
            if (q.isAttempted) {
              if (q.isCorrect) cardBorder = 'border-emerald-300 ring-1 ring-emerald-200';
              else cardBorder = 'border-red-300 ring-1 ring-red-200';
            }

            return (
              <Card key={q.id} className={`${cardBorder} transition-shadow hover:shadow-sm`}>
                <CardBody className="space-y-4 p-5">
                  {/* Question Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                        Q{q.position}
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
                      {q.chapter && <span className="text-xs text-slate-500">• {q.chapter}</span>}
                    </div>

                    {/* Score & Time Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Marks Badge */}
                      {q.isAttempted ? (
                        q.isCorrect ? (
                          <Badge tone="green">+{q.marksAwarded} Marks (Correct)</Badge>
                        ) : (
                          <Badge tone="red">{q.marksAwarded} Marks (Wrong)</Badge>
                        )
                      ) : (
                        <Badge tone="slate">0 Marks (Unattempted)</Badge>
                      )}

                      {/* Time taken */}
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3.5" />
                        {timeTakenSec}s (Exp: {expectedSec}s)
                      </span>

                      {/* Overtime warning flag */}
                      {q.isOvertime && (
                        <Badge tone="amber" className="text-[10px]">
                          Overtime ({timeTakenSec}s &gt; {Math.round(expectedSec * 1.5)}s)
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Question Body */}
                  <div className="text-sm leading-relaxed text-slate-900">
                    <QuestionBody
                      body={q.body}
                      renderImage={(placeholderId) => (
                        <div className="my-2 overflow-hidden rounded border border-slate-200 bg-slate-50 p-1">
                          <img
                            src={`/api/files/images/${q.id}/${placeholderId}`}
                            alt="Figure"
                            className="max-h-60 object-contain"
                          />
                        </div>
                      )}
                    />
                  </div>

                  {/* Option / Answer Review */}
                  <div className="space-y-2 pt-2">
                    {q.type === 'mcq' ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {q.options.map((opt) => {
                          const isStudentPick = q.response?.key === opt.key;
                          const isCorrectKey =
                            q.answer && 'key' in q.answer && q.answer.key === opt.key;

                          let optionClass = 'border-slate-200 bg-slate-50 text-slate-700';
                          if (isCorrectKey) {
                            optionClass = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-500';
                          } else if (isStudentPick && !q.isCorrect) {
                            optionClass = 'border-red-500 bg-red-50 text-red-900 font-semibold ring-1 ring-red-500';
                          }

                          return (
                            <div
                              key={opt.key}
                              className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${optionClass}`}
                            >
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border font-bold">
                                {opt.key}
                              </span>
                              <div className="flex-1">
                                <QuestionBody
                                  body={opt.body}
                                  renderImage={(imgId) => (
                                    <img
                                      src={`/api/files/images/${q.id}/${imgId}`}
                                      alt="Option figure"
                                      className="my-1 max-h-24 object-contain"
                                    />
                                  )}
                                />
                              </div>
                              {isCorrectKey && (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Correct Key
                                </span>
                              )}
                              {isStudentPick && !isCorrectKey && (
                                <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Your Choice
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Integer / Numerical Review */
                      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-3 text-xs">
                        <div>
                          <span className="text-slate-500">Your Response: </span>
                          <strong className={q.isCorrect ? 'text-emerald-700' : 'text-red-600'}>
                            {q.response?.value !== undefined ? String(q.response.value) : 'None'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Correct Answer: </span>
                          <strong className="text-emerald-700">
                            {q.answer && 'value' in q.answer
                              ? q.answer.value
                              : q.answer && 'min' in q.answer
                              ? `${q.answer.min} to ${q.answer.max}`
                              : '-'}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Worked Solution */}
                  {q.solution && (
                    <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-4 text-xs text-slate-800">
                      <div className="mb-1 flex items-center gap-1.5 font-bold text-brand-900">
                        <Sparkles className="size-3.5 text-accent-500" />
                        Step-by-Step Solution:
                      </div>
                      <QuestionBody
                        body={q.solution}
                        renderImage={(imgId) => (
                          <img
                            src={`/api/files/images/${q.id}/${imgId}`}
                            alt="Solution figure"
                            className="my-2 max-h-48 object-contain"
                          />
                        )}
                      />
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              No questions found with current filter selections.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
