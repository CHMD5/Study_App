import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { FileText, ListChecks, Sparkles } from 'lucide-react';
import { getDb } from '@/db/client';
import { papers, questions } from '@/db/schema';
import { Card, CardBody } from '@/components/ui';

export default async function TeacherOverviewPage() {
  const db = await getDb();
  const [[paperCount], [questionCount], [verifiedCount]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(papers),
    db.select({ n: sql<number>`count(*)` }).from(questions),
    db.select({ n: sql<number>`count(*)` }).from(questions).where(sql`status = 'verified'`),
  ]);

  const tiles = [
    { href: '/teacher/papers', label: 'Papers registered', value: paperCount.n, icon: FileText },
    { href: '/teacher/questions', label: 'Questions in bank', value: questionCount.n, icon: ListChecks },
    { href: '/teacher/questions?status=verified', label: 'Verified questions', value: verifiedCount.n, icon: Sparkles },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Overview</h1>
      <p className="mt-1 text-sm text-slate-500">Everything here is stored locally on this machine.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardBody className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                  <t.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold text-slate-900">{Number(t.value)}</p>
                  <p className="text-xs text-slate-500">{t.label}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-slate-900">Digitize a paper</h2>
            <p className="mt-1 text-sm text-slate-500">
              Register a PDF, run the extraction prompt against Gemini yourself, paste the JSON back in.
            </p>
            <Link href="/teacher/papers" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
              Go to Papers →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-slate-900">Extraction prompt</h2>
            <p className="mt-1 text-sm text-slate-500">
              The exact prompt to paste into Gemini Pro, with a one-click copy button.
            </p>
            <Link href="/teacher/extraction-prompt" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
              View prompt →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
