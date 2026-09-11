'use client';

import { useEffect, useState } from 'react';
import { Award, Layers, Users } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  Spinner,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

interface CohortData {
  metrics: {
    totalStudents: number;
    totalPublishedTests: number;
    totalAttemptsSubmitted: number;
  };
  batchSummaries?: Array<{
    batch: string;
    studentCount: number;
    attemptCount: number;
    avgScore: number;
    avgPercentile: number | null;
  }>;
  studentRankings: Array<{
    studentId: string;
    fullName: string;
    username: string;
    batch: string | null;
    testsTaken: number;
    avgScore: number;
    avgPercentile: number | null;
  }>;
  weakChapters: Array<{
    chapter: string;
    subject: string;
    totalAnswers: number;
    correctAnswers: number;
    accuracyPct: number;
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
        <StatTile
          label="Enrolled Students"
          value={data.metrics.totalStudents}
          tone="brand"
          subtext="Active candidates in roster"
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Published Tests"
          value={data.metrics.totalPublishedTests}
          tone="emerald"
          subtext="Available to student roster"
          icon={<Layers className="size-4" />}
        />
        <StatTile
          label="Graded Attempts"
          value={data.metrics.totalAttemptsSubmitted}
          tone="amber"
          subtext="Evaluated test attempts"
          icon={<Award className="size-4" />}
        />
      </div>

      {/* Batch-Level Performance */}
      {data.batchSummaries && data.batchSummaries.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Batch-Level Performance</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Comparative metrics across student batches and cohorts.
            </p>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Enrolled Students</TableHead>
                  <TableHead>Total Submissions</TableHead>
                  <TableHead>Average Score</TableHead>
                  <TableHead className="text-right">Average Percentile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.batchSummaries.map((b) => (
                  <TableRow key={b.batch}>
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                      <Badge tone="slate">{b.batch}</Badge>
                    </TableCell>
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">{b.studentCount}</TableCell>
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">{b.attemptCount}</TableCell>
                    <TableCell className="tnum font-bold text-brand-700 dark:text-brand-400">{b.avgScore} M</TableCell>
                    <TableCell className="tnum text-right font-medium text-slate-700 dark:text-slate-300">
                      {b.avgPercentile !== null ? `${b.avgPercentile} %ile` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Class-Wide Weak Chapters */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Class-Wide Priority Revision Chapters</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Chapters with lowest overall accuracy across all student test attempts (minimum 5 responses required).
          </p>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Chapter</TableHead>
                <TableHead>Total Responses</TableHead>
                <TableHead>Correct Answers</TableHead>
                <TableHead>Accuracy %</TableHead>
                <TableHead className="text-right">Revision Urgency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.weakChapters.map((wc, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-bold uppercase text-slate-700 dark:text-slate-300">
                    <Badge
                      tone={
                        wc.subject === 'physics'
                          ? 'brand'
                          : wc.subject === 'chemistry'
                            ? 'green'
                            : wc.subject === 'maths'
                              ? 'amber'
                              : 'purple'
                      }
                    >
                      {wc.subject}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{wc.chapter}</TableCell>
                  <TableCell className="tnum text-slate-600 dark:text-slate-400">{wc.totalAnswers}</TableCell>
                  <TableCell className="tnum font-semibold text-emerald-700 dark:text-emerald-400">{wc.correctAnswers}</TableCell>
                  <TableCell className="tnum font-bold text-slate-900 dark:text-slate-100">{wc.accuracyPct}%</TableCell>
                  <TableCell className="text-right">
                    {wc.accuracyPct < 40 ? (
                      <Badge tone="red">Critical Revision</Badge>
                    ) : wc.accuracyPct < 60 ? (
                      <Badge tone="amber">Moderate Focus</Badge>
                    ) : (
                      <Badge tone="green">Good</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.weakChapters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-slate-400 dark:text-slate-500">
                    No chapter accuracy data available yet (requires ≥ 5 responses per chapter).
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Tests Taken</TableHead>
                <TableHead>Average Marks</TableHead>
                <TableHead className="text-right">Average Percentile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.studentRankings.map((s, idx) => (
                <TableRow key={s.studentId}>
                  <TableCell className="font-bold text-slate-900 dark:text-slate-100">
                    {idx === 0 ? (
                      <span className="tnum flex size-6 items-center justify-center rounded-full bg-amber-400 font-black text-slate-950">
                        1
                      </span>
                    ) : idx === 1 ? (
                      <span className="tnum flex size-6 items-center justify-center rounded-full bg-slate-300 font-black text-slate-900">
                        2
                      </span>
                    ) : idx === 2 ? (
                      <span className="tnum flex size-6 items-center justify-center rounded-full bg-amber-700 font-black text-white">
                        3
                      </span>
                    ) : (
                      <span className="tnum">#{idx + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{s.fullName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{s.username}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.batch ?? '-'}</TableCell>
                  <TableCell className="tnum text-slate-600 dark:text-slate-400">{s.testsTaken}</TableCell>
                  <TableCell className="tnum font-black text-brand-700 dark:text-brand-400">{s.avgScore} M</TableCell>
                  <TableCell className="tnum text-right font-bold text-accent-600 dark:text-accent-400">
                    {s.avgPercentile !== null ? `${s.avgPercentile} %ile` : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.studentRankings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-slate-400 dark:text-slate-500">
                    No student attempts recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
