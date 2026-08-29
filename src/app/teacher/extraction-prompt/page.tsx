import { listExtractionPrompts, getTruncationRecoveryPrompt } from '@/lib/prompts';
import { ExtractionPromptView } from './ExtractionPromptView';

export const metadata = { title: 'Extraction prompt' };

export default function ExtractionPromptPage() {
  const prompts = listExtractionPrompts();
  const truncationPrompt = getTruncationRecoveryPrompt();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Extraction prompt</h1>
      <p className="mt-1 text-sm text-slate-500">
        Run this yourself against Gemini Pro (AI Studio or the Gemini app). The app never calls an
        LLM API and never holds a key — you paste the output back in on a paper&rsquo;s ingest screen.
      </p>

      <ExtractionPromptView prompts={prompts} truncationPrompt={truncationPrompt} />
    </div>
  );
}
