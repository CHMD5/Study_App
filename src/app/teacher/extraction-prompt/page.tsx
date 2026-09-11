import { getAllExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { ExtractionPromptView } from './ExtractionPromptView';

export const metadata = { title: 'Extraction prompts' };

export default function ExtractionPromptPage() {
  const promptsByKind = getAllExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Extraction prompts
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Prompts optimized for Gemini Pro. Select your extraction mode below, copy the prompt, and run it directly against your PDF documents.
      </p>

      <ExtractionPromptView promptsByKind={promptsByKind} truncationPrompt={truncationPrompt} />
    </div>
  );
}
