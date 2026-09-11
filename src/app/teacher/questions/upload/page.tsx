import { Suspense } from 'react';
import { getAllExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { UploadQuestionsView } from './UploadQuestionsView';

export const metadata = { title: 'Upload questions & solutions' };

export default async function UploadQuestionsPage() {
  const promptsByKind = getAllExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  const db = await getDb();
  const paperRows = await db
    .select({ id: papers.id, code: papers.code, title: papers.title })
    .from(papers);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Upload questions & solutions
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Stage draft questions, upload answer keys and worked solutions, or ingest both simultaneously using Gemini extraction.
      </p>

      <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Loading upload studio...</div>}>
        <UploadQuestionsView
          promptsByKind={promptsByKind}
          truncationPrompt={truncationPrompt}
          papers={paperRows}
        />
      </Suspense>
    </div>
  );
}
