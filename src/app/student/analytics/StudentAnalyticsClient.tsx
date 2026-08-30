'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  Legend,
} from 'recharts';
import { Alert, Badge, buttonClass, Card, CardBody, CardHeader, CardTitle, EmptyState, Spinner } from '@/components/ui';

interface StudentAnalyticsData {
  totalAttempts: number;
  avgScore: number;
  avgPercentile: number;
  recentTests: Array<{
    attemptId: string;
    testTitle: string;
    submittedAt: string;
    score: number;
    maxMarks: number;
    percentile: number;
    accuracy: number;
  }>;
  subjectBreakdown: {
    physics?: { attempted: number; correct: number; accuracy: number };
    chemistry?: { attempted: number; correct: number; accuracy: number };
    maths?: { attempted: number; correct: number; accuracy: number };
  };
  chapterBreakdown: Array<{
    chapter: string;
    subject: string;
    attempted: number;
    correct: number;
    total: number;
    accuracy: number;
  }>;
}

export function StudentAnalyticsClient({ studentName }: { studentName: string }) {
  const [data, setData] = useState<StudentAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/analytics/student');
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? 'Failed to load analytics');
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
        <p className="text-sm font-medium">Computing your performance trends...</p>
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

  if (data.totalAttempts === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Performance Analytics</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Track your progress and subject mastery across JEE mock tests.</p>
        </div>

        <EmptyState
          title="No completed tests yet"
          hint="Take and submit your first JEE test to unlock your percentile trend, subject accuracy radar, and chapter breakdown."
          action={
            <Link href="/student" className={buttonClass('primary', 'md')}>
              Browse Available Tests
            </Link>
          }
        />
      </div>
    );
  }

  // Chart Data: Score progression
  const trendChartData = [...data.recentTests]
    .reverse()
    .map((t) => ({
      name: t.testTitle.length > 18 ? t.testTitle.slice(0, 16) + '...' : t.testTitle,
      score: t.score,
      maxMarks: t.maxMarks,
      percentile: t.percentile,
    }));

  // Subject Bar Data
  const subjectChartData = [
    { subject: 'Physics', accuracy: data.subjectBreakdown.physics?.accuracy ?? 0, fill: '#1E3A8A' },
    { subject: 'Chemistry', accuracy: data.subjectBreakdown.chemistry?.accuracy ?? 0, fill: '#059669' },
    { subject: 'Maths', accuracy: data.subjectBreakdown.maths?.accuracy ?? 0, fill: '#7C3AED' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Performance Analytics</h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Personalized performance curves and chapter mastery for <strong>{studentName}</strong>.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-brand-100 bg-gradient-to-br from-white to-brand-50/40 dark:border-brand-900 dark:from-slate-900 dark:to-brand-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Award className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Average Percentile</p>
              <p className="text-2xl font-black text-brand-700 dark:text-brand-400">{data.avgPercentile} %ile</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Across {data.totalAttempts} completed exam{data.totalAttempts === 1 ? '' : 's'}</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 dark:border-emerald-900 dark:from-slate-900 dark:to-emerald-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <TrendingUp className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Average Score</p>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{data.avgScore} Marks</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Mean marks per mock attempt</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border-amber-100 bg-gradient-to-br from-white to-amber-50/40 dark:border-amber-900 dark:from-slate-900 dark:to-amber-950/40">
          <CardBody className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-amber-500 text-slate-900 shadow-sm">
              <Target className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tests Attempted</p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.totalAttempts}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Practice & timed exams</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Progression Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Score Progression Curve</CardTitle>
          </CardHeader>
          <CardBody className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name="Score (Marks)"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="percentile"
                    name="Percentile (%ile)"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {/* Subject Accuracy Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Subject-Wise Accuracy (%)</CardTitle>
          </CardHeader>
          <CardBody className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="subject" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [`${val}%`, 'Accuracy']}
                  />
                  <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
                    {subjectChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Chapter Strength & Weakness List */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Chapter Mastery & Weak Areas</h2>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Chapter</th>
                  <th className="px-4 py-3 font-semibold">Questions Attempted</th>
                  <th className="px-4 py-3 font-semibold">Accuracy</th>
                  <th className="px-4 py-3 text-right font-semibold">Proficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.chapterBreakdown.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-bold uppercase text-slate-700 dark:text-slate-300">
                      <Badge
                        tone={c.subject === 'physics' ? 'brand' : c.subject === 'chemistry' ? 'green' : 'amber'}
                      >
                        {c.subject}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{c.chapter}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {c.correct} correct / {c.attempted} attempted ({c.total} served)
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{c.accuracy}%</td>
                    <td className="px-4 py-3 text-right">
                      {c.accuracy >= 70 ? (
                        <Badge tone="green">Mastered</Badge>
                      ) : c.accuracy >= 40 ? (
                        <Badge tone="amber">Needs Practice</Badge>
                      ) : (
                        <Badge tone="red">Weak Chapter</Badge>
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
