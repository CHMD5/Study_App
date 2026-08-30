'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, buttonClass, Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Spinner, Textarea } from '@/components/ui';
import { fromLocalInputValue } from '@/lib/datetime';

export default function CreateTestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [resultsPolicy, setResultsPolicy] = useState<'immediate' | 'on_release'>('immediate');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          durationS: durationMinutes * 60,
          opensAt: fromLocalInputValue(opensAt),
          closesAt: fromLocalInputValue(closesAt),
          maxAttempts: Number(maxAttempts),
          shuffleQuestions,
          shuffleOptions,
          resultsPolicy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to create test');
      }

      router.push(`/teacher/tests/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/teacher/tests" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          ← Back to tests
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Create New JEE Test</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set up test parameters. You can select and arrange questions on the next screen.
        </p>
      </div>

      {error && (
        <Alert tone="red" title="Error">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Test Details & Settings</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="title">Test Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. JEE Main 2027 Mock Test #1 (PCM)"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief instructions or syllabus coverage notes..."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="duration">Duration (Minutes) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Default for full JEE Mains: 180 min (3 hrs)</p>
              </div>

              <div>
                <Label htmlFor="maxAttempts">Max Retakes / Attempts *</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Usually 1 attempt for mock exams</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="opensAt">Opening Window (optional)</Label>
                <Input
                  id="opensAt"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Leave blank to open anytime</p>
              </div>

              <div>
                <Label htmlFor="closesAt">Closing Window (optional)</Label>
                <Input
                  id="closesAt"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Leave blank to never close</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <Label htmlFor="resultsPolicy">Results & Solutions Release Policy</Label>
              <Select
                id="resultsPolicy"
                value={resultsPolicy}
                onChange={(e) => setResultsPolicy(e.target.value as any)}
              >
                <option value="immediate">Immediate (Students see marks & solutions right after submit)</option>
                <option value="on_release">On Release (Hide solutions until teacher clicks &apos;Release Results&apos;)</option>
              </Select>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Label>Anti-Cheating & Shuffle Options</Label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-700"
                />
                Shuffle question order for each student
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-700"
                />
                Shuffle MCQ options (A/B/C/D) for each student
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/teacher/tests" className={buttonClass('secondary', 'md')}>
                Cancel
              </Link>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? <Spinner className="size-4" /> : 'Continue to Question Builder →'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
