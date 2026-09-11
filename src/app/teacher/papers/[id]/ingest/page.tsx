import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { getAllExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { IngestView } from './IngestView';

export const metadata = { title: 'Ingest questions & solutions' };

export default async function IngestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const promptsByKind = getAllExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{paper.title}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {paper.code} · {paper.pdfPages ?? '?'} pages · stage draft questions, attach solutions, or ingest both at once.
      </p>

      <IngestView
        paper={paper}
        promptsByKind={promptsByKind}
        truncationPrompt={truncationPrompt}
      />
    </div>
  );
}
