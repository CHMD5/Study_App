import { eq, inArray, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { papers, questions, questionImages } from '@/db/schema';
import { PaperVerifyStudio } from './PaperVerifyStudio';

export const metadata = { title: 'Verify paper questions' };

export default async function PaperVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) notFound();

  const paperQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.paperId, id))
    .orderBy(asc(questions.sourceQno), asc(questions.createdAt));

  const questionIds = paperQuestions.map((q) => q.id);
  const images =
    questionIds.length > 0
      ? await db.select().from(questionImages).where(inArray(questionImages.questionId, questionIds))
      : [];

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col -mx-4 -my-6 sm:-mx-6">
      <PaperVerifyStudio initialPaper={paper} initialQuestions={paperQuestions} initialImages={images} />
    </div>
  );
}
