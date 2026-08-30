import { requireTeacher } from '@/lib/auth';
import { TeacherCohortAnalyticsClient } from './TeacherCohortAnalyticsClient';

export default async function TeacherCohortPage() {
  await requireTeacher();
  return <TeacherCohortAnalyticsClient />;
}
