'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Layers, Sparkles, TrendingUp, Users } from 'lucide-react';
import { Alert, Badge, buttonClass, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui';

interface CohortData {
  metrics: {
    totalStudents: number;
    totalPublishedTests: number;
    totalAttemptsSubmitted: number;
  };
  leaderboard: Array<{
    studentId: string;
    studentName: string;
    email: string;
    batch: string | null;
    testsAttempted: number;
    avgScore: number;
    avgPercentile: number;
  }>;
  weakChapters: Array<{
    chapter: string;
    subject: string;
    totalResponses: number;
    correctResponses: number;
    accuracy: number;
  }>;
}

export function TeacherCohortAnalyticsClient() {
  const [data, setData] = useState<CohortData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/analytics/cohort');
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? 'Failed to load cohort analytics');
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Spinner className="size-8 text-brand-700 dark:text-brand-400" />
        <p className="text-sm font-medium">Aggregating cohort performance metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert tone="red" title="Error">
        {error ?? 'Failed to load analytics'}
      </Alert>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Cohort Overview & Insights</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Institution-wide student performance trends, ranking leaderboard, and weak chapter diagnostics.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-brand-100 bg-gradient-to-br from-white to-brand-50/40 dark:border-brand-900 dark:from-slate-900 dark:to-brand-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Users className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Enrolled Students</p>
              <p className="text-2xl font-black text-brand-700 dark:text-brand-400">{data.metrics.totalStudents}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Active candidates in roster</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 dark:border-emerald-900 dark:from-slate-900 dark:to-emerald-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Layers className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Published Tests</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{data.metrics.totalPublishedTests}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Available to student roster</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border-amber-100 bg-gradient-to-br from-white to-amber-50/40 dark:border-amber-900 dark:from-slate-900 dark:to-amber-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-amber-500 text-slate-900 shadow-sm">
              <Award className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Graded Attempts</p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.metrics.totalAttemptsSubmitted}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Evaluated test attempts</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Class-Wide Weak Chapters */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Class-Wide Priority Revision Chapters</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Chapters with lowest overall accuracy across all student test attempts.
          </p>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Chapter</th>
                  <th className="px-4 py-3 font-semibold">Total Responses</th>
                  <th className="px-4 py-3 font-semibold">Correct Answers</th>
                  <th className="px-4 py-3 font-semibold">Accuracy %</th>
                  <th className="px-4 py-3 text-right font-semibold">Revision Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.weakChapters.map((wc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-bold uppercase text-slate-700 dark:text-slate-300">
                      <Badge tone={wc.subject === 'physics' ? 'brand' : wc.subject === 'chemistry' ? 'green' : 'amber'}>
                        {wc.subject}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{wc.chapter}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{wc.totalResponses}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">{wc.correctResponses}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{wc.accuracy}%</td>
                    <td className="px-4 py-3 text-right">
                      {wc.accuracy < 40 ? (
                        <Badge tone="red">Critical Revision</Badge>
                      ) : wc.accuracy < 60 ? (
                        <Badge tone="amber">Moderate Focus</Badge>
                      ) : (
                        <Badge tone="green">Good</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {data.weakChapters.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-slate-500">
                      No chapter accuracy data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Cohort Leaderboard */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Student Ranking & Leaderboard</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Cumulative performance across all student attempts in the roster.
          </p>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Student Name</th>
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">Tests Taken</th>
                  <th className="px-4 py-3 font-semibold">Average Marks</th>
                  <th className="px-4 py-3 font-semibold">Average Percentile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.leaderboard.map((s, idx) => (
                  <tr key={s.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                      {idx === 0 ? (
                        <span className="flex size-6 items-center justify-center rounded-full bg-amber-400 font-black text-slate-950">
                          1
                        </span>
                      ) : idx === 1 ? (
                        <span className="flex size-6 items-center justify-center rounded-full bg-slate-300 font-black text-slate-900">
                          2
                        </span>
                      ) : idx === 2 ? (
                        <span className="flex size-6 items-center justify-center rounded-full bg-amber-700 font-black text-white">
                          3
                        </span>
                      ) : (
                        `#${idx + 1}`
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.studentName}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{s.batch ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.testsAttempted}</td>
                    <td className="px-4 py-3 font-black text-brand-700 dark:text-brand-400">{s.avgScore} M</td>
                    <td className="px-4 py-3 font-bold text-accent-600 dark:text-accent-400">{s.avgPercentile} %ile</td>
                  </tr>
                ))}
                {data.leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 dark:text-slate-500">
                      No student attempts recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
