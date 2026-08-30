import { Suspense } from 'react';
import Link from 'next/link';
import { UploadCloud } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { QuestionsListView } from './QuestionsListView';

export const metadata = { title: 'Question bank' };

export default function QuestionsPage() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Question bank</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every question across every registered paper. Filter, review, and verify before adding to a test.
          </p>
        </div>
        <Link href="/teacher/questions/upload" className={buttonClass('primary', 'sm')}>
          <UploadCloud className="size-4" />
          Upload standalone questions
        </Link>
      </div>

      <Suspense>
        <QuestionsListView />
      </Suspense>
    </div>
  );
}
