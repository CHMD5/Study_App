import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { FileText, Layers, ListChecks, Sparkles, Users } from 'lucide-react';
import { getDb } from '@/db/client';
import { papers, profiles, questions, tests } from '@/db/schema';
import { Card, CardBody } from '@/components/ui';

export default async function TeacherOverviewPage() {
  const db = await getDb();
  const [[paperCount], [questionCount], [verifiedCount], [studentCount], [testCount]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(papers),
    db.select({ n: sql<number>`count(*)` }).from(questions),
    db.select({ n: sql<number>`count(*)` }).from(questions).where(sql`status = 'verified'`),
    db.select({ n: sql<number>`count(*)` }).from(profiles).where(eq(profiles.role, 'student')),
    db.select({ n: sql<number>`count(*)` }).from(tests),
  ]);

  const tiles = [
    { href: '/teacher/students', label: 'Enrolled students', value: studentCount.n, icon: Users },
    { href: '/teacher/tests', label: 'Tests configured', value: testCount.n, icon: Layers },
    { href: '/teacher/papers', label: 'Papers registered', value: paperCount.n, icon: FileText },
    { href: '/teacher/questions', label: 'Questions in bank', value: questionCount.n, icon: ListChecks },
    { href: '/teacher/questions?status=verified', label: 'Verified questions', value: verifiedCount.n, icon: Sparkles },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Overview</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything here is stored locally on this machine.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="transition-all hover:shadow-md hover:ring-brand-200 dark:hover:ring-brand-800">
              <CardBody className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300">
                  <t.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{Number(t.value)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.label}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Digitize a paper</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Register a PDF, run the extraction prompt against Gemini, and verify questions in split-screen.
            </p>
            <Link href="/teacher/papers" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
              Go to Papers →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload standalone questions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload or paste questions without registering or associating a paper PDF.
            </p>
            <Link href="/teacher/questions/upload" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
              Upload questions →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Extraction prompt</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              The exact prompt to paste into Gemini Pro, with a one-click copy button.
            </p>
            <Link href="/teacher/extraction-prompt" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
              View prompt →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
