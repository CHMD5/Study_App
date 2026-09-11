'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Share2, Trash2, Undo2 } from 'lucide-react';
import { Alert, Button, ConfirmDialog, Spinner, useToast } from '@/components/ui';

type UnverifiedQuestion = {
  position?: number;
  questionId?: string;
  humanCode?: string | null;
  subject?: string;
  status?: string;
};

type ActionType = 'publish' | 'unpublish' | 'release' | 'revoke' | 'delete' | null;

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionType>(null);

  /** Shared request wrapper — one place to read the error shape the API sends. */
  async function call(url: string, method: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(url, { method });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
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

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    setLoading(true);
    setError(null);
    try {
      await fn();
      toast.success(successMessage);
      setConfirmAction(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const onConfirm = async () => {
    switch (confirmAction) {
      case 'publish':
        await run(() => call(`/api/tests/${testId}/publish`, 'POST'), 'Test published successfully');
        break;
      case 'unpublish':
        await run(() => call(`/api/tests/${testId}/publish`, 'DELETE'), 'Test unpublished (withdrawn from students)');
        break;
      case 'release':
        await run(() => call(`/api/tests/${testId}/release-results`, 'POST'), 'Results released to students');
        break;
      case 'revoke':
        await run(() => call(`/api/tests/${testId}/release-results?revoke=true`, 'POST'), 'Results hidden from students');
        break;
      case 'delete':
        if (attemptCount > 0) {
          setError(`Cannot delete this test — it already has ${attemptCount} student attempt(s).`);
          setConfirmAction(null);
          return;
        }
        await run(() => call(`/api/tests/${testId}`, 'DELETE'), 'Test deleted successfully');
        break;
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {!isPublished ? (
          <Button variant="primary" size="sm" onClick={() => setConfirmAction('publish')} disabled={loading}>
            {loading ? <Spinner className="size-3" /> : <Send className="mr-1 size-3.5" />}
            Publish
          </Button>
        ) : attemptCount === 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmAction('unpublish')}
            disabled={loading}
            title="Withdraw from students"
          >
            <Undo2 className="mr-1 size-3.5" />
            Unpublish
          </Button>
        ) : null}

        {isPublished && resultsPolicy === 'on_release' && !hasReleasedResults && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => setConfirmAction('release')}
            disabled={loading}
          >
            <Share2 className="mr-1 size-3.5" />
            Release Results
          </Button>
        )}

        {isPublished && resultsPolicy === 'on_release' && hasReleasedResults && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmAction('revoke')}
            disabled={loading}
            title="Hide results again"
          >
            <Undo2 className="mr-1 size-3.5" />
            Hide Results
          </Button>
        )}

        {attemptCount === 0 && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmAction('delete')}
            disabled={loading}
            title="Delete test"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {error && (
        <Alert tone="red" className="max-w-md text-xs">
          {error}
        </Alert>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={onConfirm}
        loading={loading}
        title={
          confirmAction === 'publish'
            ? 'Publish Test'
            : confirmAction === 'unpublish'
            ? 'Unpublish Test'
            : confirmAction === 'release'
            ? 'Release Results'
            : confirmAction === 'revoke'
            ? 'Hide Results'
            : 'Delete Test'
        }
        description={
          confirmAction === 'publish'
            ? 'Students will be able to take this test immediately once the scheduled window opens.'
            : confirmAction === 'unpublish'
            ? 'This test will be withdrawn and will no longer be visible to students.'
            : confirmAction === 'release'
            ? 'Every student who took this test will now be able to view their score and step-by-step solutions.'
            : confirmAction === 'revoke'
            ? 'Students will lose access to their scores and worked solutions for this test.'
            : 'Are you sure you want to delete this test? This action cannot be undone.'
        }
        confirmText={
          confirmAction === 'publish'
            ? 'Publish Test'
            : confirmAction === 'unpublish'
            ? 'Unpublish'
            : confirmAction === 'release'
            ? 'Release Results'
            : confirmAction === 'revoke'
            ? 'Hide Results'
            : 'Delete'
        }
        tone={confirmAction === 'delete' ? 'danger' : 'brand'}
      />
    </div>
  );
}
