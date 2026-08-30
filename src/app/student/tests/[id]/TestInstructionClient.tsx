'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, HelpCircle, Play } from 'lucide-react';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '@/components/ui';

interface TestInstructionClientProps {
  test: {
    id: string;
    title: string;
    description: string | null;
    durationS: number;
    questionCount: number;
    maxAttempts: number;
  };
  studentName: string;
}

export function TestInstructionClient({ test, studentName }: TestInstructionClientProps) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationMin = Math.round(test.durationS / 60);

  const handleStartTest = async () => {
    if (!agreed) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tests/${test.id}/start`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to start test attempt');
      }

      router.push(`/student/attempts/${data.attemptId}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/student" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          ← Back to tests
        </Link>
      </div>

      {/* Header Info */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
            JEE Mains CBT Format
          </span>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{test.title}</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Candidate: <strong className="text-slate-800 dark:text-slate-200">{studentName}</strong></p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <Clock className="size-4 text-brand-700 dark:text-brand-400" />
            <span>Duration: <strong>{durationMin} mins</strong></span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <HelpCircle className="size-4 text-brand-700 dark:text-brand-400" />
            <span>Questions: <strong>{test.questionCount}</strong></span>
          </div>
        </div>
      </div>

      {error && (
        <Alert tone="red" title="Error">
          {error}
        </Alert>
      )}

      {/* Instructions Card */}
      <Card>
        <CardHeader className="bg-slate-50 dark:bg-slate-950">
          <CardTitle>General Examination Instructions</CardTitle>
        </CardHeader>
        <CardBody className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">1. Timer and Exam Clock</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              The countdown timer at the top right of the screen will display the remaining time available for you to complete the examination.
              When the timer reaches zero, the examination will automatically submit and score your responses.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">2. Question Palette & Color Codes</h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              The question palette displayed on the right of the screen will show the status of each question using one of the following symbols:
            </p>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-200 font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  01
                </span>
                <span><strong>Not Visited:</strong> You have not visited the question yet.</span>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50/60 p-2 text-xs dark:border-red-900/60 dark:bg-red-950/30">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-red-600 font-bold text-white">
                  02
                </span>
                <span><strong>Not Answered:</strong> You have visited but not answered the question.</span>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 font-bold text-white">
                  03
                </span>
                <span><strong>Answered:</strong> You have answered the question.</span>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-purple-200 bg-purple-50/60 p-2 text-xs dark:border-purple-900/60 dark:bg-purple-950/30">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-purple-700 font-bold text-white">
                  04
                </span>
                <span><strong>Marked for Review:</strong> You have not answered, but marked for review.</span>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-purple-200 bg-purple-50/60 p-2 text-xs sm:col-span-2 dark:border-purple-900/60 dark:bg-purple-950/30">
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-purple-700 font-bold text-white">
                  05
                  <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-white bg-emerald-500" />
                </span>
                <span>
                  <strong>Answered & Marked for Review:</strong> You have answered the question and marked it for review.
                  <em className="ml-1 text-slate-500 dark:text-slate-400">(Will be evaluated in grading).</em>
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">3. Marking Scheme</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
              <li><strong>+4.00 Marks</strong> for each correct response.</li>
              <li><strong>-1.00 Marks</strong> for each incorrect response (Negative marking).</li>
              <li><strong>0.00 Marks</strong> for unattempted questions.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">4. Navigating and Answering</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
              <li>Click on the question number in the palette to navigate directly to that question.</li>
              <li>Click <strong>&quot;Save & Next&quot;</strong> to save your answer and proceed to the next question.</li>
              <li>Click <strong>&quot;Mark for Review & Next&quot;</strong> to save (if chosen) and flag the question.</li>
              <li>Click <strong>&quot;Clear Response&quot;</strong> to deselect your choice.</li>
              <li>Your progress is continuously autosaved locally and synchronized with the server.</li>
            </ul>
          </div>

          <div className="rounded-md border border-brand-200 bg-brand-50 p-3.5 text-xs text-brand-900 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-200">
            <p className="font-semibold">Offline Disconnect Protection:</p>
            <p className="mt-0.5">
              If your internet connection drops during the exam, you can continue answering uninterrupted.
              All responses are stored in your browser and automatically reconciled when reconnected.
            </p>
          </div>

          {/* Declaration */}
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-700"
              />
              <span className="text-xs text-slate-800 dark:text-slate-200">
                I have read and understood all the instructions given above. I agree that I will not use any unfair means during the examination.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <Link href="/student" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
              Cancel & Return
            </Link>

            <Button
              variant="primary"
              size="lg"
              onClick={handleStartTest}
              disabled={!agreed || loading}
            >
              {loading ? (
                <Spinner className="mr-2 size-4" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              I am ready to begin →
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
