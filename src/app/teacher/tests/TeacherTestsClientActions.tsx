'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Share2, Trash2 } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';

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

  const handlePublish = async () => {
    if (!confirm('Publish this test? Students will be able to take it immediately if window is open.')) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tests/${testId}/publish`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data?.details?.unverified) {
          const list = data.details.unverified.map((u: any) => `Q${u.position} (${u.subject})`).join(', ');
          throw new Error(`Cannot publish: Some questions are not verified: ${list}`);
        }
        throw new Error(data?.message || 'Failed to publish test');
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseResults = async () => {
    if (!confirm('Release results for this test? All students who took this test will now be able to view their score and solutions.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tests/${testId}/release-results`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || 'Failed to release results');
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (attemptCount > 0) {
      alert(`Cannot delete this test because it already has ${attemptCount} student attempt(s).`);
      return;
    }
    if (!confirm('Are you sure you want to delete this test?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || 'Failed to delete test');
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {!isPublished && (
        <Button
          variant="primary"
          size="sm"
          onClick={handlePublish}
          disabled={loading}
        >
          {loading ? <Spinner className="size-3" /> : <Send className="mr-1 size-3.5" />}
          Publish
        </Button>
      )}

      {isPublished && resultsPolicy === 'on_release' && !hasReleasedResults && (
        <Button
          variant="accent"
          size="sm"
          onClick={handleReleaseResults}
          disabled={loading}
        >
          <Share2 className="mr-1 size-3.5" />
          Release Results
        </Button>
      )}

      {attemptCount === 0 && (
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={loading}
          title="Delete test"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
