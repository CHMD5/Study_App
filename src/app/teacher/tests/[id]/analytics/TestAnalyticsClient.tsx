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
  Download,
} from 'lucide-react';
import { Alert, Badge, buttonClass, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui';

type TestAnalyticsData = {
  testId: string;
  title: string;
  durationS: number;
  resultsPolicy: string;
  releasedAt: string | null;
  isPublished: boolean;
  metrics: {
    totalAttempts: number;
    highestMarks: number;
    lowestMarks: number;
    averageMarks: number;
    medianMarks: number;
  };
  distribution: Array<{ range: string; count: number }>;
  leaderboard: Array<{
    studentId: string;
    fullName: string;
    username: string;
    batch: string;
    attemptNo: number;
    totalMarks: number;
    rank: number;
    percentile: number;
    submittedAt: string;
    timeSpentMin: number;
  }>;
  questionStats: Array<{
    questionId: string;
    subject: string;
    chapter: string;
    topic: string;
    difficulty: number;
    timesServed: number;
    timesAttempted: number;
    pctCorrect: number;
    avgTimeS: number;
    expectedTimeS: number;
  }>;
};

export function TestAnalyticsClient({ testId }: { testId: string }) {
  const [data, setData] = useState<TestAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/analytics/tests/${testId}`);
        if (!res.ok) throw new Error('Failed to load test analytics');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [testId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Spinner className="size-8 text-brand-700" />
        <p className="text-sm font-medium">Aggregating test metrics & ranks from database...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert tone="red" title="Error">
        {error ?? 'Analytics data not found'}
      </Alert>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/teacher/tests" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              ← Tests
            </Link>
            <span className="text-slate-300">/</span>
            <Link href={`/teacher/tests/${data.testId}`} className="text-xs font-medium text-slate-500 hover:text-slate-900">
              {data.title}
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-medium text-slate-700">Analytics</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{data.title}</h1>
            {data.isPublished ? (
              <Badge tone="green">Published</Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
            <Badge tone="slate">{Math.round(data.durationS / 60)} min</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/teacher/tests/${data.testId}`}
            className={buttonClass('secondary', 'sm')}
          >
            Edit / Builder
          </Link>

          <a
            href={`/api/analytics/tests/${data.testId}/export.csv`}
            download
            className={buttonClass('primary', 'sm')}
          >
            <Download className="mr-1.5 size-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardBody className="py-3 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Attempts</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{data.metrics.totalAttempts}</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="py-3 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Average Score</p>
            <p className="mt-1 text-2xl font-black text-brand-700">{data.metrics.averageMarks}</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="py-3 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Highest Score</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{data.metrics.highestMarks}</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="py-3 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Median Score</p>
            <p className="mt-1 text-2xl font-black text-purple-700">{data.metrics.medianMarks}</p>
          </CardBody>
        </Card>

        <Card className="col-span-2 sm:col-span-1">
          <CardBody className="py-3 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Lowest Score</p>
            <p className="mt-1 text-2xl font-black text-red-600">{data.metrics.lowestMarks}</p>
          </CardBody>
        </Card>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: any) => [`${val} students`, 'Count']}
                />
                <Bar dataKey="count" fill="#1E3A8A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      {/* Leaderboard Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Student Leaderboard & Scores</h2>
          <span className="text-xs text-slate-500">{data.leaderboard.length} candidates graded</span>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Student Name</th>
                  <th className="px-4 py-3 font-semibold">Username</th>
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">Total Score</th>
                  <th className="px-4 py-3 font-semibold">Percentile</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.leaderboard.map((row) => (
                  <tr key={`${row.studentId}-${row.attemptNo}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {row.rank <= 3 ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 font-black text-amber-900">
                          #{row.rank}
                        </span>
                      ) : (
                        `#${row.rank}`
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.fullName}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{row.username}</td>
                    <td className="px-4 py-3 text-slate-600">{row.batch}</td>
                    <td className="px-4 py-3 font-black text-brand-700">{row.totalMarks} M</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{row.percentile}%</td>
                    <td className="px-4 py-3 text-slate-500">{row.timeSpentMin} min</td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {new Date(row.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}

                {data.leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400">
                      No attempts submitted yet for this test.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Question Item Calibration Table (v_question_stats) */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Question Item Calibration</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Observed candidate accuracy (% correct) and average time vs assigned difficulty.
          </p>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Chapter</th>
                  <th className="px-4 py-3 font-semibold">Difficulty</th>
                  <th className="px-4 py-3 font-semibold">Attempted</th>
                  <th className="px-4 py-3 font-semibold">% Correct</th>
                  <th className="px-4 py-3 font-semibold">Avg Time</th>
                  <th className="px-4 py-3 text-right font-semibold">Calibration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.questionStats.map((qs, idx) => (
                  <tr key={qs.questionId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">{idx + 1}</td>
                    <td className="px-4 py-3 font-bold uppercase text-slate-700">
                      <Badge tone={qs.subject === 'physics' ? 'brand' : qs.subject === 'chemistry' ? 'green' : 'amber'}>
                        {qs.subject}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{qs.chapter}</td>
                    <td className="px-4 py-3 text-slate-700">Level {qs.difficulty}/10</td>
                    <td className="px-4 py-3 text-slate-600">
                      {qs.timesAttempted} / {qs.timesServed}
                    </td>
                    <td className="px-4 py-3 font-black text-slate-900">{qs.pctCorrect}%</td>
                    <td className="px-4 py-3 text-slate-500">
                      {qs.avgTimeS}s (Exp: {qs.expectedTimeS}s)
                    </td>
                    <td className="px-4 py-3 text-right">
                      {qs.pctCorrect >= 70 ? (
                        <Badge tone="green">Easy</Badge>
                      ) : qs.pctCorrect >= 35 ? (
                        <Badge tone="amber">Moderate</Badge>
                      ) : (
                        <Badge tone="red">Hard / Low Accuracy</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
