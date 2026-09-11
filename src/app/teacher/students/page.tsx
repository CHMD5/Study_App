import { Suspense } from 'react';
import { requireTeacher } from '@/lib/auth';
import { StudentsView } from './StudentsView';

export const metadata = { title: 'Students & Batches' };

export default async function StudentsPage() {
  await requireTeacher();
  return (
    <div>
      <Suspense>
        <StudentsView />
      </Suspense>
    </div>
  );
}
