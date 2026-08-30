import { requireTeacher } from '@/lib/auth';
import { TestAnalyticsClient } from './TestAnalyticsClient';

export default async function TeacherTestAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTeacher();
  const { id: testId } = await params;

  return <TestAnalyticsClient testId={testId} />;
}
