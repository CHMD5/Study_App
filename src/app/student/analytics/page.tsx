import { requireStudent } from '@/lib/auth';
import { StudentAnalyticsClient } from './StudentAnalyticsClient';

export default async function StudentAnalyticsPage() {
  const session = await requireStudent();
  return <StudentAnalyticsClient studentName={session.fullName} />;
}
