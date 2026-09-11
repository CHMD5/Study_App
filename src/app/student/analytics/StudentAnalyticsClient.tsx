'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  RotateCw,
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
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Spinner,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

interface StudentAnalyticsData {
  totalAttempts: number;
  avgScore: number;
  avgPercentile: number | null;
  recentTests: Array<{
    attemptId: string;
    testTitle: string;
    submittedAt: string | null;
    score: number;
    maxMarks: number;
    percentile: number | null;
  }>;
  subjectBreakdown: {
    physics?: { attempted: number; correct: number; accuracy: number };
    chemistry?: { attempted: number; correct: number; accuracy: number };
    maths?: { attempted: number; correct: number; accuracy: number };
    biology?: { attempted: number; correct: number; accuracy: number };
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

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/analytics/student/me');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to load analytics');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Could not load student analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
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
      <div className="space-y-4">
        <Alert tone="red" title="Failed to load analytics">
          {error ?? 'Failed to load analytics'}
        </Alert>
        <Button variant="secondary" size="sm" onClick={loadData}>
          <RotateCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
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
      percentile: t.percentile !== null ? t.percentile : null,
    }));

  // Subject Bar Data
  const subjectChartData = [
    { subject: 'Physics', accuracy: data.subjectBreakdown.physics?.accuracy ?? 0, fill: '#3b5bdb' },
    { subject: 'Chemistry', accuracy: data.subjectBreakdown.chemistry?.accuracy ?? 0, fill: '#059669' },
    { subject: 'Maths', accuracy: data.subjectBreakdown.maths?.accuracy ?? 0, fill: '#f59e0b' },
    { subject: 'Biology', accuracy: data.subjectBreakdown.biology?.accuracy ?? 0, fill: '#9333ea' },
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
        <StatTile
          label="Average Percentile"
          value={data.avgPercentile !== null ? `${data.avgPercentile} %ile` : '—'}
          tone="brand"
          subtext={`Across ${data.totalAttempts} completed exam${data.totalAttempts === 1 ? '' : 's'}`}
          icon={<Award className="size-4" />}
        />
        <StatTile
          label="Average Score"
          value={`${data.avgScore} Marks`}
          tone="emerald"
          subtext="Mean marks per mock attempt"
          icon={<TrendingUp className="size-4" />}
        />
        <StatTile
          label="Tests Attempted"
          value={data.totalAttempts}
          tone="amber"
          subtext="Practice & timed exams"
          icon={<Target className="size-4" />}
        />
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                  <XAxis dataKey="name" className="text-slate-500 dark:text-slate-400" fontSize={11} />
                  <YAxis className="text-slate-500 dark:text-slate-400" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface, #ffffff)',
                      borderColor: 'var(--color-hairline, #e2e8f0)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--color-ink, #0f172a)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name="Score (Marks)"
                    stroke="#3b5bdb"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="percentile"
                    name="Percentile (%ile)"
                    stroke="#f59e0b"
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
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                  <XAxis dataKey="subject" className="text-slate-500 dark:text-slate-400" fontSize={11} />
                  <YAxis className="text-slate-500 dark:text-slate-400" fontSize={11} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface, #ffffff)',
                      borderColor: 'var(--color-hairline, #e2e8f0)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--color-ink, #0f172a)',
                    }}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Chapter</TableHead>
                <TableHead>Questions Attempted</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead className="text-right">Proficiency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.chapterBreakdown.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-bold uppercase text-slate-700 dark:text-slate-300">
                    <Badge
                      tone={
                        c.subject === 'physics'
                          ? 'brand'
                          : c.subject === 'chemistry'
                          ? 'green'
                          : c.subject === 'maths'
                          ? 'amber'
                          : 'purple'
                      }
                    >
                      {c.subject}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">{c.chapter}</TableCell>
                  <TableCell className="tnum text-slate-600 dark:text-slate-400">
                    {c.correct} correct / {c.attempted} attempted ({c.total} served)
                  </TableCell>
                  <TableCell className="tnum font-bold text-slate-900 dark:text-slate-100">{c.accuracy}%</TableCell>
                  <TableCell className="text-right">
                    {c.accuracy >= 70 ? (
                      <Badge tone="green">Mastered</Badge>
                    ) : c.accuracy >= 40 ? (
                      <Badge tone="amber">Needs Practice</Badge>
                    ) : (
                      <Badge tone="red">Weak Chapter</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.chapterBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-slate-400 dark:text-slate-500">
                    No chapter breakdown data available yet.
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
