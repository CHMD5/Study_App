
import { requireSession } from '@/lib/auth';
import { ResultReviewClient } from './ResultReviewClient';

export default async function StudentAttemptResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: attemptId } = await params;

  return <ResultReviewClient attemptId={attemptId} userRole={session.role} />;
}
