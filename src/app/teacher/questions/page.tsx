import { Suspense } from 'react';
import { QuestionsListView } from './QuestionsListView';

export const metadata = { title: 'Question bank' };

export default function QuestionsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Question bank</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every question across every registered paper. Filter, review, and verify before adding to a test.
      </p>
      <Suspense>
        <QuestionsListView />
      </Suspense>
    </div>
  );
}
