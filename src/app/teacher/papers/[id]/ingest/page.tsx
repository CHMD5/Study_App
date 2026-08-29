import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { listExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { IngestView } from './IngestView';

export const metadata = { title: 'Ingest questions' };

export default async function IngestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const prompts = listExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{paper.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {paper.code} · {paper.pdfPages ?? '?'} pages · paste Gemini&rsquo;s JSON output below to stage draft
        questions.
      </p>

      <IngestView paper={paper} prompts={prompts} truncationPrompt={truncationPrompt} />
    </div>
  );
}
