import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { papers, questionImages, questions } from '@/db/schema';
import { QuestionEditor } from './QuestionEditor';

export const metadata = { title: 'Edit question' };

export default async function QuestionEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  if (!question) notFound();

  const [images, paper] = await Promise.all([
    db.select().from(questionImages).where(eq(questionImages.questionId, id)),
    question.paperId
      ? db
          .select()
          .from(papers)
          .where(eq(papers.id, question.paperId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  return <QuestionEditor initialQuestion={question} initialImages={images} paper={paper} />;
}
