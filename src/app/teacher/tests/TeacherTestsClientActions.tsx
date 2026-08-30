'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Share2, Trash2, Undo2 } from 'lucide-react';
import { Alert, Button, Spinner } from '@/components/ui';

type UnverifiedQuestion = {
  position?: number;
  questionId?: string;
  humanCode?: string | null;
  subject?: string;
  status?: string;
};

export function TeacherTestsClientActions({
  testId,
  isPublished,
  resultsPolicy,
  hasReleasedResults,
  attemptCount,
}: {
  testId: string;
  isPublished: boolean;
  resultsPolicy: string;
  hasReleasedResults: boolean;
  attemptCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Shared request wrapper — one place to read the error shape the API sends. */
  async function call(url: string, method: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(url, { method });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // withApi spreads HttpError.extra at the TOP level of the body, so the
      // unverified list is data.unverified — this used to look for
      // data.details.unverified, which never exists, so the teacher only ever
      // saw the generic count and never learned which questions to fix.
      const unverified = data.unverified as UnverifiedQuestion[] | undefined;
      if (Array.isArray(unverified) && unverified.length > 0) {
        const list = unverified
          .map((u) => `Q${u.position ?? '?'}${u.humanCode ? ` ${u.humanCode}` : ''} (${u.subject ?? '—'})`)
          .join(', ');
        throw new Error(`Cannot publish — these questions are not verified: ${list}`);
      }
      throw new Error((data.message as string) || 'Request failed');
    }
    return data;
  }

  async function run(fn: () => Promise<unknown>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const handlePublish = () => {
    if (!confirm('Publish this test? Students will be able to take it immediately if the window is open.')) return;
    void run(() => call(`/api/tests/${testId}/publish`, 'POST'));
  };

  const handleUnpublish = () => {
    if (!confirm('Withdraw this test? Students will no longer see it.')) return;
    void run(() => call(`/api/tests/${testId}/publish`, 'DELETE'));
  };

  const handleReleaseResults = () => {
    if (!confirm('Release results? Every student who took this test will be able to see their score and solutions.')) {
      return;
    }
    void run(() => call(`/api/tests/${testId}/release-results`, 'POST'));
  };

  const handleRevokeResults = () => {
    if (!confirm('Hide results again? Students will lose access to their scores and solutions for this test.')) return;
    void run(() => call(`/api/tests/${testId}/release-results?revoke=true`, 'POST'));
  };

  const handleDelete = () => {
    if (attemptCount > 0) {
      setError(`Cannot delete this test — it already has ${attemptCount} student attempt(s).`);
      return;
    }
    if (!confirm('Delete this test? This cannot be undone.')) return;
    void run(() => call(`/api/tests/${testId}`, 'DELETE'));
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {!isPublished ? (
          <Button variant="primary" size="sm" onClick={handlePublish} disabled={loading}>
            {loading ? <Spinner className="size-3" /> : <Send className="mr-1 size-3.5" />}
            Publish
          </Button>
        ) : attemptCount === 0 ? (
          // Unpublish was supported by the API but had no UI, so a test
          // published by mistake could not be withdrawn.
          <Button variant="secondary" size="sm" onClick={handleUnpublish} disabled={loading} title="Withdraw from students">
            <Undo2 className="mr-1 size-3.5" />
            Unpublish
          </Button>
        ) : null}

        {isPublished && resultsPolicy === 'on_release' && !hasReleasedResults && (
          <Button variant="accent" size="sm" onClick={handleReleaseResults} disabled={loading}>
            <Share2 className="mr-1 size-3.5" />
            Release Results
          </Button>
        )}

        {isPublished && resultsPolicy === 'on_release' && hasReleasedResults && (
          <Button variant="secondary" size="sm" onClick={handleRevokeResults} disabled={loading} title="Hide results again">
            <Undo2 className="mr-1 size-3.5" />
            Hide Results
          </Button>
        )}

        {attemptCount === 0 && (
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading} title="Delete test">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Inline, not alert() — a native dialog cannot show a list of question
          codes readably and cannot be copied from. */}
      {error && (
        <Alert tone="red" className="max-w-md text-xs">
          {error}
        </Alert>
      )}
    </div>
  );
}
