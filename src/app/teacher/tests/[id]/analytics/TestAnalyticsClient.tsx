'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  BarChart2,
  Calendar,
  Clock,
  Download,
  Flame,
  HelpCircle,
  Layers,
  PieChart,
  RotateCw,
  TrendingDown,
  TrendingUp,
  Users,
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
  Spinner,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { Dialog } from '@/components/Dialog';

type QuestionStatItem = {
  questionId: string;
  position: number;
  subject: string;
  chapter: string;
  topic: string;
  type: string;
  difficulty: number;
  bodyPreview?: string;
  timesServed: number;
  timesAttempted: number;
  pctCorrect: number;
  avgTimeS: number;
  expectedTimeS: number;
  discriminationIndex: number | null;
  isLowSample: boolean;
  optionBreakdown: Record<string, number>;
};

type TestAnalyticsData = {
  testId: string;
  title: string;
  durationS: number;
  maxMarks: number;
  resultsPolicy: string;
  releasedAt: string | null;
  isPublished: boolean;
  bestOnly: boolean;
  metrics: {
    totalAttempts: number;
    highestMarks: number;
    lowestMarks: number;
    averageMarks: number;
    medianMarks: number;
    p25: number;
    p75: number;
    iqr: number;
  };
  distribution: Array<{ range: string; count: number }>;
  batchComparison: Array<{
    batch: string;
    studentCount: number;
    attemptCount: number;
    avgScore: number;
    medianScore: number;
    topScore: number;
    avgTimeMin: number;
  }>;
  leaderboard: Array<{
    studentId: string;
    fullName: string;
    username: string;
    batch: string;
    attemptNo: number;
    totalMarks: number;
    rank: number;
    percentile: number | null;
    submittedAt: string;
    timeSpentMin: number;
  }>;
  questionStats: Array<QuestionStatItem>;
};

function renderDiBadge(di: number | null) {
  if (di === null) {
    return <Badge tone="slate">N/A</Badge>;
  }
  if (di >= 0.4) {
    return <Badge tone="green">+{di.toFixed(2)} (Good)</Badge>;
  }
  if (di >= 0.2) {
    return <Badge tone="amber">+{di.toFixed(2)} (Fair)</Badge>;
  }
  if (di >= 0) {
    return <Badge tone="red">+{di.toFixed(2)} (Poor)</Badge>;
  }
  return <Badge tone="red">{di.toFixed(2)} (Inverted)</Badge>;
}

export function TestAnalyticsClient({ testId }: { testId: string }) {
  const [data, setData] = useState<TestAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bestOnly, setBestOnly] = useState(true);
  const [distractorQuestion, setDistractorQuestion] = useState<QuestionStatItem | null>(null);

  async function loadData(useBest = bestOnly) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/analytics/tests/${testId}?bestOnly=${useBest}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to load test analytics');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(bestOnly);
  }, [testId, bestOnly]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Spinner className="size-8 text-brand-700 dark:text-brand-400" />
        <p className="text-sm font-medium">Aggregating test metrics & ranks from database...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Alert tone="red" title="Failed to load analytics">
          {error ?? 'Analytics data not found'}
        </Alert>
        <Button variant="secondary" size="sm" onClick={() => loadData(bestOnly)}>
          <RotateCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/teacher/tests"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Tests
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <Link
              href={`/teacher/tests/${data.testId}`}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              {data.title}
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Analytics</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{data.title}</h1>
            {data.isPublished ? (
              <Badge tone="green">Published</Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
            <Badge tone="slate">{Math.round(data.durationS / 60)} min</Badge>
            <Badge tone="brand">{data.maxMarks} Marks Max</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Best Only Toggle Pill */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setBestOnly(true)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                bestOnly
                  ? 'bg-white font-semibold text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Best Attempt
            </button>
            <button
              type="button"
              onClick={() => setBestOnly(false)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                !bestOnly
                  ? 'bg-white font-semibold text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              All Attempts
            </button>
          </div>

          <Link
            href={`/teacher/tests/${data.testId}`}
            className={buttonClass('secondary', 'sm')}
          >
            Edit / Builder
          </Link>

          <a
            href={`/api/analytics/tests/${data.testId}/export.csv`}
            download
            className={buttonClass('secondary', 'sm')}
            title="Download full candidate leaderboard and marks as CSV"
          >
            <Download className="mr-1.5 size-3.5" />
            Export Ranks
          </a>

          <a
            href={`/api/analytics/tests/${data.testId}/export-questions.csv`}
            download
            className={buttonClass('primary', 'sm')}
            title="Download item calibration and discrimination index as CSV"
          >
            <Download className="mr-1.5 size-3.5" />
            Export Item Calibration
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile
          label={bestOnly ? 'Ranked Students' : 'Total Attempts'}
          value={data.metrics.totalAttempts}
          subtext={bestOnly ? 'Best attempt per candidate' : 'All submitted attempts'}
          tone="slate"
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Average Score"
          value={`${data.metrics.averageMarks} M`}
          tone="brand"
          icon={<TrendingUp className="size-4" />}
        />
        <StatTile
          label="Highest Score"
          value={`${data.metrics.highestMarks} M`}
          tone="emerald"
          icon={<Award className="size-4" />}
        />
        <StatTile
          label="Median Score"
          value={`${data.metrics.medianMarks} M`}
          subtext={`IQR: ${data.metrics.iqr}M (Q1: ${data.metrics.p25}M - Q3: ${data.metrics.p75}M)`}
          tone="purple"
          icon={<BarChart2 className="size-4" />}
        />
        <StatTile
          label="Lowest Score"
          value={`${data.metrics.lowestMarks} M`}
          tone="red"
          className="col-span-2 sm:col-span-1"
          icon={<TrendingDown className="size-4" />}
        />
      </div>

      {/* Score Distribution Histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution Histogram</CardTitle>
        </CardHeader>
        <CardBody className="p-4">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="range" className="text-slate-500 dark:text-slate-400" fontSize={11} />
                <YAxis className="text-slate-500 dark:text-slate-400" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    borderColor: 'var(--color-hairline, #e2e8f0)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--color-ink, #0f172a)',
                  }}
                  formatter={(val: any) => [`${val} students`, 'Count']}
                />
                <Bar dataKey="count" fill="var(--color-brand-600, #2a44b8)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* Batch Comparison Breakdown */}
      {data.batchComparison && data.batchComparison.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Batch Comparison Breakdown</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Comparative cohort performance on this test across student batches.
            </p>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead>Average Score</TableHead>
                  <TableHead>Median Score</TableHead>
                  <TableHead>Top Score</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.batchComparison.map((b) => (
                  <TableRow key={b.batch}>
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                      <Badge tone="slate">{b.batch}</Badge>
                    </TableCell>
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">{b.studentCount}</TableCell>
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">{b.attemptCount}</TableCell>
                    <TableCell className="tnum font-bold text-brand-700 dark:text-brand-400">{b.avgScore} M</TableCell>
                    <TableCell className="tnum text-slate-700 dark:text-slate-300">{b.medianScore} M</TableCell>
                    <TableCell className="tnum font-bold text-emerald-700 dark:text-emerald-400">{b.topScore} M</TableCell>
                    <TableCell className="tnum text-right text-slate-500 dark:text-slate-400">{b.avgTimeMin} min</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Candidate Leaderboard & Graded Ranks</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {bestOnly ? 'Displaying each student’s highest-scoring attempt.' : 'Displaying all submitted student attempts.'}
            </p>
          </div>
          <span className="tnum text-xs text-slate-500 dark:text-slate-400">{data.leaderboard.length} candidates graded</span>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Batch</TableHead>
                {!bestOnly && <TableHead>Attempt #</TableHead>}
                <TableHead>Total Score</TableHead>
                <TableHead>Percentile</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leaderboard.map((row) => (
                <TableRow key={`${row.studentId}-${row.attemptNo}`}>
                  <TableCell className="font-bold text-slate-900 dark:text-slate-100">
                    {row.rank <= 3 ? (
                      <span className="tnum inline-flex size-6 items-center justify-center rounded-full bg-amber-100 font-black text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                        #{row.rank}
                      </span>
                    ) : (
                      <span className="tnum">#{row.rank}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{row.fullName}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.username}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{row.batch}</TableCell>
                  {!bestOnly && (
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">#{row.attemptNo}</TableCell>
                  )}
                  <TableCell className="tnum font-black text-brand-700 dark:text-brand-400">{row.totalMarks} M</TableCell>
                  <TableCell className="tnum font-semibold text-emerald-700 dark:text-emerald-400">
                    {row.percentile !== null ? `${row.percentile}%` : '—'}
                  </TableCell>
                  <TableCell className="tnum text-slate-500 dark:text-slate-400">{row.timeSpentMin} min</TableCell>
                  <TableCell className="text-right text-slate-400 dark:text-slate-500">
                    {new Date(row.submittedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}

              {data.leaderboard.length === 0 && (
                <TableRow>
                  <TableCell colSpan={bestOnly ? 8 : 9} className="p-6 text-center text-slate-400 dark:text-slate-500">
                    No attempts submitted yet for this test.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Question Item Calibration Table */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Question Item Calibration & Discrimination</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Per-test item accuracy, average solving time, and discrimination index (DI = P(top tertile) - P(bottom tertile)).
          </p>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Chapter & Topic</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Attempted</TableHead>
                <TableHead>% Correct</TableHead>
                <TableHead>Discrimination (DI)</TableHead>
                <TableHead>Avg Time</TableHead>
                <TableHead>Calibration</TableHead>
                <TableHead className="text-right">Distractor Drilldown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.questionStats.map((qs) => (
                <TableRow key={qs.questionId}>
                  <TableCell className="tnum font-bold text-slate-900 dark:text-slate-100">
                    #{qs.position}
                  </TableCell>
                  <TableCell className="font-bold uppercase text-slate-700 dark:text-slate-300">
                    <Badge
                      tone={
                        qs.subject === 'physics'
                          ? 'brand'
                          : qs.subject === 'chemistry'
                            ? 'green'
                            : qs.subject === 'maths'
                              ? 'amber'
                              : 'purple'
                      }
                    >
                      {qs.subject}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{qs.chapter}</p>
                    {qs.topic && qs.topic !== '-' && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{qs.topic}</p>
                    )}
                  </TableCell>
                  <TableCell className="tnum text-slate-700 dark:text-slate-300">Level {qs.difficulty}/10</TableCell>
                  <TableCell className="tnum text-slate-600 dark:text-slate-300">
                    {qs.timesAttempted} / {qs.timesServed}
                  </TableCell>
                  <TableCell className="tnum font-black text-slate-900 dark:text-slate-100">{qs.pctCorrect}%</TableCell>
                  <TableCell>{renderDiBadge(qs.discriminationIndex)}</TableCell>
                  <TableCell className="tnum text-slate-500 dark:text-slate-400">
                    {qs.avgTimeS}s <span className="text-slate-400">/ {qs.expectedTimeS}s</span>
                  </TableCell>
                  <TableCell>
                    {qs.isLowSample ? (
                      <Badge tone="amber">Low Sample (&lt; 5)</Badge>
                    ) : qs.pctCorrect >= 70 ? (
                      <Badge tone="green">Easy</Badge>
                    ) : qs.pctCorrect >= 35 ? (
                      <Badge tone="amber">Moderate</Badge>
                    ) : (
                      <Badge tone="red">Hard / Low Accuracy</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDistractorQuestion(qs)}
                    >
                      <PieChart className="mr-1 size-3.5" />
                      Options
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {data.questionStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="p-6 text-center text-slate-400 dark:text-slate-500">
                    No question calibration data available yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Distractor Drilldown Dialog */}
      <Dialog
        isOpen={Boolean(distractorQuestion)}
        onClose={() => setDistractorQuestion(null)}
        title={
          distractorQuestion
            ? `Question #${distractorQuestion.position} Distractor Analysis`
            : 'Distractor Analysis'
        }
        description={
          distractorQuestion
            ? `${distractorQuestion.subject.toUpperCase()} • ${distractorQuestion.chapter}`
            : ''
        }
        footer={
          <Button variant="secondary" size="sm" onClick={() => setDistractorQuestion(null)}>
            Close
          </Button>
        }
      >
        {distractorQuestion && (
          <div className="space-y-4 py-2">
            {distractorQuestion.bodyPreview && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Question Snippet: </span>
                {distractorQuestion.bodyPreview}...
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Attempts</p>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {distractorQuestion.timesAttempted}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Accuracy</p>
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {distractorQuestion.pctCorrect}%
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Discrimination Index</p>
                <p className="text-base font-bold text-brand-700 dark:text-brand-400">
                  {distractorQuestion.discriminationIndex !== null
                    ? `${distractorQuestion.discriminationIndex.toFixed(2)}`
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Option Response Distribution
              </h4>

              {Object.keys(distractorQuestion.optionBreakdown).length === 0 ? (
                <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
                  No responses recorded for this question yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const breakdown = distractorQuestion.optionBreakdown;
                    const totalSelected = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
                    return Object.entries(breakdown)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, count]) => {
                        const pct = totalSelected > 0 ? Math.round((count / totalSelected) * 100) : 0;
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                Option {key.toUpperCase()}
                              </span>
                              <span className="tnum font-medium text-slate-500 dark:text-slate-400">
                                {count} students ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Distractor analysis helps identify misconceptions: if top performers are picking an incorrect option, the question or option wording may be misleading.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
