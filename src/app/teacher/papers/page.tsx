import { desc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { PapersView } from './PapersView';

export const metadata = { title: 'Papers' };

export default async function PapersPage() {
  const db = await getDb();
  const rows = await db.select().from(papers).orderBy(desc(papers.createdAt));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Papers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Source PDFs, stored locally under <code className="font-mono">data/papers/</code>.
          </p>
        </div>
      </div>

      <PapersView initialPapers={rows} />
    </div>
  );
}
