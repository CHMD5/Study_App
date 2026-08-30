import { listExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { UploadQuestionsView } from './UploadQuestionsView';

export const metadata = { title: 'Upload questions' };

export default async function UploadQuestionsPage() {
  const prompts = listExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Upload standalone questions</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Ingest and stage questions directly into the Question Bank without associating them with a registered PDF paper.
      </p>

      <UploadQuestionsView prompts={prompts} truncationPrompt={truncationPrompt} />
    </div>
  );
}
