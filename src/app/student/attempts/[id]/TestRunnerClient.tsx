'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { get, set } from 'idb-keyval';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Layers,
  Maximize2,
  Minimize2,
  WifiOff,
  X,
} from 'lucide-react';
import { Alert, Button, Card, CardBody, Spinner } from '@/components/ui';
import { QuestionBody } from '@/components/Katex';
import type { StudentQuestionDto } from '@/lib/dto';

export type AnswerState =
  | 'not_seen'
  | 'seen_unanswered'
  | 'answered'
  | 'answered_flagged'
  | 'flagged_unanswered';

export type QuestionRuntimeState = StudentQuestionDto & {
  state: AnswerState;
  response: { key?: string; value?: number | string } | null;
  timeSpentMs: number;
  visitCount: number;
  /**
   * Local-only text for a numerical box mid-typing ("-", "3."), so a partially
   * entered number stays editable without being stored as a response. Never
   * sent to the server.
   */
  draftValue?: string;
};

/**
 * One cell of the question palette.
 *
 * Was duplicated between the desktop aside and the mobile sheet, which had
 * already drifted apart in sizing and hover states. State was conveyed by
 * background colour alone — indistinguishable for a red/green colour-blind
 * student, and unreadable to a screen reader — so each cell now also carries a
 * glyph and a spoken label.
 */
const STATE_LABEL: Record<AnswerState, string> = {
  not_seen: 'not visited',
  seen_unanswered: 'not answered',
  answered: 'answered',
  answered_flagged: 'answered and marked for review',
  flagged_unanswered: 'marked for review',
};

function PaletteButton({
  question,
  isCurrent,
  onClick,
}: {
  question: QuestionRuntimeState;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const styles: Record<AnswerState, string> = {
    not_seen: 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
    seen_unanswered: 'bg-red-600 text-white hover:bg-red-700',
    answered: 'bg-emerald-600 text-white hover:bg-emerald-700',
    flagged_unanswered: 'bg-purple-700 text-white hover:bg-purple-800',
    answered_flagged: 'bg-purple-700 text-white hover:bg-purple-800',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Question ${question.position}, ${STATE_LABEL[question.state]}`}
      aria-current={isCurrent ? 'true' : undefined}
      className={`tnum relative flex size-9 items-center justify-center rounded-md text-xs font-bold transition-all ${
        styles[question.state]
      } ${isCurrent ? 'scale-105 ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
    >
      {question.position}

      {/* Non-colour state cues */}
      {question.state === 'answered' && (
        <Check className="absolute -right-1 -top-1 size-3 rounded-full bg-white p-px text-emerald-700" aria-hidden />
      )}
      {(question.state === 'answered_flagged' || question.state === 'flagged_unanswered') && (
        <Flag className="absolute -left-1 -top-1 size-3 rounded-full bg-white p-px text-purple-700" aria-hidden />
      )}
      {question.state === 'answered_flagged' && (
        <span
          className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-white bg-emerald-500"
          aria-hidden
        />
      )}
    </button>
  );
}

export function TestRunnerClient({
  attemptId,
  testTitle,
  deadlineAt,
  studentName,
  serverTime,
}: {
  attemptId: string;
  testTitle: string;
  deadlineAt: string;
  studentName: string;
  serverTime: string;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionRuntimeState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Online / Offline & Sync status.
  // Initialised from navigator so a student who loads the page already offline
  // sees the indicator immediately rather than a false "online".
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const clockOffsetRef = useRef<number>(Date.now() - new Date(serverTime).getTime());

  // Active question timing tracking
  const activeSinceRef = useRef<number>(performance.now());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * A live mirror of `questions` for callbacks that must not be re-created when
   * it changes.
   *
   * Two separate bugs came from reading `questions` out of a closure:
   *   - the 1s countdown effect captured the FIRST render's auto-submit, whose
   *     `questions` was `[]` and whose `submitting` was permanently `false`, so
   *     on expiry it re-fired every second and flushed an empty answer array;
   *   - `syncWithServer` changed identity on every keystroke, which tore down
   *     and restarted the 15s heartbeat effect each time — for a student who
   *     was actively working, the heartbeat never actually fired.
   */
  const questionsRef = useRef<QuestionRuntimeState[]>([]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  /** Guards auto-submit against re-entry. A ref, because the countdown callback
   *  cannot see state updates. */
  const submitStartedRef = useRef(false);

  const currentQ = questions[currentIndex];

  // Subject tabs are derived from the paper, not hardcoded — a Physics-only
  // sectional test used to render two dead tabs reading 0/0.
  const subjects = useMemo(() => {
    const order = ['physics', 'chemistry', 'maths', 'biology'] as const;
    const present = new Set(questions.map((q) => q.subject));
    return order.filter((s) => present.has(s));
  }, [questions]);

  const currentSubject = currentQ?.subject ?? subjects[0] ?? 'physics';

  // IDB Storage key for offline mirror
  const idbKey = `vtp_attempt_${attemptId}`;

  // 1. Initial Load: Fetch questions & reconcile with IDB mirror
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        const res = await fetch(`/api/attempts/${attemptId}/questions`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to load test questions');
        }
        const serverData: QuestionRuntimeState[] = await res.json();

        // Check IndexedDB for newer offline unsaved answers
        const idbSaved = (await get(idbKey)) as Record<string, Partial<QuestionRuntimeState>> | undefined;

        const reconciled = serverData.map((q, idx) => {
          const offline = idbSaved?.[q.id];
          if (offline) {
            return {
              ...q,
              state: offline.state ?? q.state,
              response: offline.response !== undefined ? offline.response : q.response,
              timeSpentMs: Math.max(q.timeSpentMs, offline.timeSpentMs ?? 0),
            };
          }
          // Mark first question as seen if it was not_seen
          if (idx === 0 && q.state === 'not_seen') {
            return { ...q, state: 'seen_unanswered' as const };
          }
          return q;
        });

        if (mounted) {
          setQuestions(reconciled);
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [attemptId, idbKey]);

  // 3. Precision timing per question accumulation
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const flushTimeSpent = useCallback(() => {
    const idx = currentIndexRef.current;
    if (!questionsRef.current[idx]) return;
    const now = performance.now();
    const delta = Math.round(now - activeSinceRef.current);
    activeSinceRef.current = now;

    if (delta > 0) {
      setQuestions((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          copy[idx] = { ...copy[idx], timeSpentMs: (copy[idx].timeSpentMs ?? 0) + delta };
        }
        return copy;
      });
    }
  }, []);

  // 4. Mirror to IndexedDB whenever questions state changes
  useEffect(() => {
    if (questions.length === 0) return;
    const cacheMap: Record<string, Partial<QuestionRuntimeState>> = {};
    for (const q of questions) {
      cacheMap[q.id] = {
        state: q.state,
        response: q.response,
        timeSpentMs: q.timeSpentMs,
      };
    }
    set(idbKey, cacheMap).catch(() => {});
  }, [questions, idbKey]);

  /** The wire payload, always read from the ref so it is never stale. */
  const buildAnswersPayload = useCallback(
    () => ({
      answers: questionsRef.current.map((q) => ({
        questionId: q.id,
        response: q.response,
        state: q.state,
        timeSpentMs: q.timeSpentMs,
        visitCount: q.visitCount,
      })),
    }),
    [],
  );

  // 5. Server Autosave Dispatcher.
  // Stable identity (no `questions` dependency) so the heartbeat and listener
  // effects below mount exactly once.
  const syncWithServer = useCallback(async () => {
    if (questionsRef.current.length === 0 || !navigator.onLine) return;
    setIsSyncing(true);

    flushTimeSpent();

    try {
      const res = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAnswersPayload()),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data.error === 'attempt_expired') {
          router.push(`/student/attempts/${attemptId}/result`);
          return;
        }
        if (res.status === 401) {
          setSyncError('Signed out — your answers are saved on this device. Sign in again in another tab.');
          return;
        }
        throw new Error(data?.message || 'Sync failed');
      }

      setSyncError(null);
      setLastSavedAt(Date.now());
    } catch {
      setSyncError('Not saved to the server — your answers are safe on this device and will re-sync.');
    } finally {
      setIsSyncing(false);
    }
  }, [attemptId, buildAnswersPayload, flushTimeSpent, router]);

  // Debounced auto-sync when questions state updates
  const scheduleSync = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      syncWithServer();
    }, 300);
  }, [syncWithServer]);

  // 6. Periodic Heartbeat Sync (every 15s). Mounts once, because
  // syncWithServer's identity is now stable.
  useEffect(() => {
    const heartbeat = setInterval(() => {
      syncWithServer();
    }, 15000);
    return () => clearInterval(heartbeat);
  }, [syncWithServer]);

  // 7. Network Listeners, Tab Blur, Visibility & BeforeUnload
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncWithServer();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushTimeSpent();
        syncWithServer();
        // Log event
        fetch(`/api/attempts/${attemptId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'tab_hidden' }),
        }).catch(() => {});
      } else {
        activeSinceRef.current = performance.now();
        fetch(`/api/attempts/${attemptId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'tab_visible' }),
        }).catch(() => {});
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushTimeSpent();

      // sendBeacon can only issue POST, and always labels the body
      // text/plain — this used to target a PATCH-only route and 405 on every
      // unload, silently, because a beacon has no readable response. The route
      // now also exports POST and parses the body as text.
      const blob = new Blob([JSON.stringify(buildAnswersPayload())], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(`/api/attempts/${attemptId}/answers`, blob);

      // An accidental Ctrl+W used to end the attempt with no warning.
      if (!submitStartedRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    // Esc leaves fullscreen without going through our toggle, which left the
    // button showing the wrong icon.
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [attemptId, buildAnswersPayload, flushTimeSpent, syncWithServer]);

  // Toggle Fullscreen. `isFullscreen` is driven by the fullscreenchange
  // listener above rather than set optimistically here.
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Navigating to question index
  const goToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentIndex) return;

    flushTimeSpent();

    setQuestions((prev) => {
      const copy = [...prev];
      const target = copy[targetIndex];
      if (target) {
        // visitCount was plumbed through the schema, the DTO, the PATCH handler
        // and the client payload, and incremented nowhere — it was always 0.
        copy[targetIndex] = {
          ...target,
          visitCount: (target.visitCount ?? 0) + 1,
          state: target.state === 'not_seen' ? 'seen_unanswered' : target.state,
        };
      }
      return copy;
    });

    setCurrentIndex(targetIndex);
    activeSinceRef.current = performance.now();
    scheduleSync();
  };

  // Action: Select MCQ Option
  const handleSelectOption = (key: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        copy[currentIndex] = {
          ...q,
          response: { key },
        };
      }
      return copy;
    });
    scheduleSync();
  };

  /**
   * Accepts only what the grader can actually score: an optional leading minus,
   * digits, and at most one decimal point.
   *
   * The field used to be a bare text input, so `abc` was storable — and it then
   * disagreed with itself downstream, scoring as unattempted but being
   * summarised on the scorecard as a wrong answer. Rejecting the keystroke is
   * clearer than accepting it and explaining later.
   */
  const handleSetIntegerValue = (val: string) => {
    const trimmed = val.trim();
    if (trimmed !== '' && !/^-?\d*\.?\d*$/.test(trimmed)) return;

    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        // Keep partial input ("-", "3.") as a string so the box stays editable;
        // it is stored as null until it parses, so a half-typed number is never
        // graded as an attempt.
        const num = Number(trimmed);
        const complete = trimmed !== '' && Number.isFinite(num);
        copy[currentIndex] = {
          ...q,
          response: complete ? { value: num } : null,
          draftValue: trimmed,
        };
      }
      return copy;
    });
    scheduleSync();
  };

  // Action: Save & Next
  const handleSaveAndNext = () => {
    flushTimeSpent();
    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        const hasResponse = q.response?.key || q.response?.value !== undefined;
        copy[currentIndex] = {
          ...q,
          state: hasResponse ? 'answered' : 'seen_unanswered',
        };
      }
      return copy;
    });

    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      scheduleSync();
    }
  };

  // Action: Mark for Review & Next
  const handleMarkForReviewAndNext = () => {
    flushTimeSpent();
    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        const hasResponse = q.response?.key || q.response?.value !== undefined;
        copy[currentIndex] = {
          ...q,
          state: hasResponse ? 'answered_flagged' : 'flagged_unanswered',
        };
      }
      return copy;
    });

    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      scheduleSync();
    }
  };

  // Action: Clear Response
  const handleClearResponse = () => {
    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        const nextState: AnswerState =
          q.state === 'answered_flagged' || q.state === 'flagged_unanswered'
            ? 'flagged_unanswered'
            : 'seen_unanswered';
        copy[currentIndex] = {
          ...q,
          response: null,
          draftValue: undefined,
          state: nextState,
        };
      }
      return copy;
    });
    scheduleSync();
  };

  // Jump to first question of selected subject tab
  const handleSubjectTab = (subj: 'physics' | 'chemistry' | 'maths' | 'biology') => {
    const idx = questions.findIndex((q) => q.subject === subj);
    if (idx !== -1) {
      goToQuestion(idx);
    }
  };

  /**
   * Flush answers, then close the attempt.
   *
   * Guarded by a ref rather than the `submitting` state: the countdown effect
   * calls this from an interval whose closure cannot observe a state update, so
   * the old `if (submitting) return` never tripped and expiry re-fired the whole
   * submit sequence once per second. The final flush also reads answers from
   * the ref — it used to send the first render's empty array, discarding
   * everything since the last successful heartbeat.
   */
  const closeAttempt = useCallback(
    async (mode: 'auto' | 'manual') => {
      if (submitStartedRef.current) return;
      submitStartedRef.current = true;
      setSubmitting(true);
      flushTimeSpent();

      try {
        await fetch(`/api/attempts/${attemptId}/answers`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAnswersPayload()),
        }).catch(() => {});

        const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));

        // On expiry we always land on the result page — the server has closed
        // the attempt either way, and stranding the student on a dead exam
        // screen would be worse than a result page that explains itself.
        if (!res.ok && mode === 'manual') {
          throw new Error(data?.message || 'Failed to submit test');
        }

        router.push(`/student/attempts/${attemptId}/result`);
      } catch (err) {
        if (mode === 'auto') {
          router.push(`/student/attempts/${attemptId}/result`);
          return;
        }
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit test');
        submitStartedRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, buildAnswersPayload, flushTimeSpent, router],
  );

  // 2. Countdown Timer. Depends on closeAttempt (stable), so the interval is
  // never re-created with a stale copy of it.
  useEffect(() => {
    const targetTime = new Date(deadlineAt).getTime();

    const updateTimer = () => {
      const adjustedNow = Date.now() - clockOffsetRef.current;
      const diff = Math.max(0, Math.floor((targetTime - adjustedNow) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        clearInterval(interval);
        void closeAttempt('auto');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt, closeAttempt]);

  // Summary counts
  const paletteStats = useMemo(() => {
    let answered = 0;
    let notAnswered = 0;
    let notVisited = 0;
    let markedForReview = 0;
    let answeredMarked = 0;

    for (const q of questions) {
      if (q.state === 'answered') answered++;
      else if (q.state === 'seen_unanswered') notAnswered++;
      else if (q.state === 'not_seen') notVisited++;
      else if (q.state === 'flagged_unanswered') markedForReview++;
      else if (q.state === 'answered_flagged') answeredMarked++;
    }

    return { answered, notAnswered, notVisited, markedForReview, answeredMarked };
  }, [questions]);

  // Derived from the questions actually present, so a single-subject paper
  // doesn't report totals for subjects it doesn't contain.
  const subjectCounts = useMemo(() => {
    const stats: Record<string, { total: number; answered: number }> = {};
    for (const q of questions) {
      const entry = (stats[q.subject] ??= { total: 0, answered: 0 });
      entry.total++;
      if (q.state === 'answered' || q.state === 'answered_flagged') entry.answered++;
    }
    return stats;
  }, [questions]);

  // Format Timer HH:MM:SS
  const timerText = useMemo(() => {
    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [remainingSeconds]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Spinner className="size-8 text-brand-700" />
        <p className="text-sm font-medium">Preparing test environment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <Alert tone="red" title="Failed to load test">
          {error}
        </Alert>
        <Button variant="primary" className="mt-4" onClick={() => router.push('/student')}>
          Return to My Tests
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--app-header-h))] flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      {/* 1. CBT Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand-700 text-xs font-bold text-white">
            JEE
          </span>
          <div>
            <h1 className="line-clamp-1 text-sm font-bold text-slate-900 dark:text-slate-100">{testTitle}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Candidate: <span className="font-semibold text-slate-700 dark:text-slate-200">{studentName}</span>
            </p>
          </div>
        </div>

        {/* Center: Live Countdown Timer */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-inner dark:border-slate-800 dark:bg-slate-800/80">
          <Clock className={`size-4 ${remainingSeconds < 300 ? 'animate-pulse text-red-600' : 'text-brand-700 dark:text-brand-400'}`} />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Time Left:</span>
          <span
            role="timer"
            aria-live="off"
            className={`tnum font-mono text-base font-bold ${
              remainingSeconds < 300 ? 'text-red-600 font-extrabold' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {timerText}
          </span>
        </div>

        {/* Right Actions: Sync, Fullscreen & Submit */}
        <div className="flex items-center gap-2">
          {/* Save-state indicator. syncError used to be recorded and never
              rendered anywhere, so a student whose answers had stopped reaching
              the server had no way to know. */}
          <span className="hidden items-center gap-1 text-xs sm:inline-flex" aria-live="polite">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                <WifiOff className="size-3 text-amber-600" />
                Offline — saved on this device
              </span>
            ) : syncError ? (
              <span
                title={syncError}
                className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
              >
                <AlertTriangle className="size-3 text-amber-600" />
                Not synced
              </span>
            ) : isSyncing ? (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Spinner className="size-3" />
                Saving…
              </span>
            ) : lastSavedAt ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Check className="size-3" />
                Saved
              </span>
            ) : null}
          </span>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden rounded p-1.5 text-slate-500 hover:bg-slate-100 sm:inline-block dark:text-slate-400 dark:hover:bg-slate-800"
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setSubmitModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Submit Test
          </Button>
        </div>
      </header>

      {/* 2. Main CBT Workplace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Question View & Actions */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Subject Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2 dark:border-slate-800 dark:bg-slate-900">
            {subjects.map((s) => {
              const isActive = currentSubject === s;
              const count = subjectCounts[s];
              return (
                <button
                  key={s}
                  onClick={() => handleSubjectTab(s)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isActive
                      ? 'border-brand-700 text-brand-700 bg-brand-50/50 dark:border-brand-400 dark:text-brand-300 dark:bg-brand-950/50'
                      : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{s}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isActive ? 'bg-brand-700 text-white dark:bg-brand-600' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {count?.answered ?? 0}/{count?.total ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Question Card Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 dark:bg-[#090d16]">
            {currentQ ? (
              <div className="mx-auto max-w-4xl space-y-6">
                {/* Question Info Sub-Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      Question {currentQ.position}
                    </span>
                    <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      [{currentQ.subject}] · {currentQ.type.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-emerald-600 font-semibold">+{currentQ.marks.correct}.00</span>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-red-600">{currentQ.marks.wrong}.00</span>
                  </div>
                </div>

                {/* Question Body with KaTeX & Image resolver */}
                <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-900 shadow-sm sm:text-base dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                  <QuestionBody
                    body={currentQ.body}
                    renderImage={(placeholderId) => (
                      <div className="my-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                        <img
                          src={`/api/files/images/${currentQ.id}/${placeholderId}`}
                          alt="Question figure"
                          className="max-h-80 w-auto object-contain"
                          loading="lazy"
                        />
                      </div>
                    )}
                  />
                </div>

                {/* Answer Options Area */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {currentQ.type === 'mcq' ? 'Select One Option:' : 'Enter Numerical Answer:'}
                  </h3>

                  {currentQ.type === 'mcq' ? (
                    <div className="grid gap-2.5">
                      {currentQ.options.map((opt) => {
                        const isSelected = currentQ.response?.key === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleSelectOption(opt.key)}
                            className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left text-sm transition-all ${
                              isSelected
                                ? 'border-brand-600 bg-brand-50/70 shadow-sm ring-2 ring-brand-500 dark:border-brand-500 dark:bg-brand-950/70'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span
                              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                isSelected
                                  ? 'border-brand-700 bg-brand-700 text-white dark:bg-brand-600'
                                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {opt.key}
                            </span>
                            <div className="flex-1 text-slate-900 dark:text-slate-100">
                              <QuestionBody
                                body={opt.body}
                                renderImage={(imgId) => (
                                  <img
                                    src={`/api/files/images/${currentQ.id}/${imgId}`}
                                    alt="Option figure"
                                    className="my-1 max-h-40 object-contain"
                                  />
                                )}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* Numerical Input */
                    <div className="max-w-xs space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="Numerical answer"
                        value={
                          currentQ.draftValue ??
                          (currentQ.response?.value !== undefined ? String(currentQ.response.value) : '')
                        }
                        onChange={(e) => handleSetIntegerValue(e.target.value)}
                        placeholder="Enter numerical answer..."
                        className="tnum h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg font-bold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Numbers only — use a decimal point, not a comma (e.g. 42 or 3.14).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* 3. Bottom Action Navigation Bar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearResponse}
                disabled={!currentQ?.response && !currentQ?.draftValue}
              >
                Clear Response
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkForReviewAndNext}
                className="border-purple-300 text-purple-800 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950/50"
              >
                <Flag className="mr-1 size-3.5 text-purple-700 dark:text-purple-400" />
                Mark for Review & Next
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAndNext}
                className="bg-brand-700 hover:bg-brand-800"
              >
                Save & Next
                <ChevronRight className="ml-1 size-4" />
              </Button>

              {/* Mobile Palette Drawer Toggle */}
              <button
                type="button"
                onClick={() => setMobilePaletteOpen(true)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 sm:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Layers className="size-3.5" />
                Palette ({paletteStats.answered}/{questions.length})
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Desktop 75-Cell Question Palette */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-slate-200 bg-white sm:flex dark:border-slate-800 dark:bg-slate-900">
          {/* Palette Legend */}
          <div className="border-b border-slate-200 p-3.5 dark:border-slate-800">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Question Palette</h2>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-emerald-600 text-[10px] font-bold text-white">
                  {paletteStats.answered}
                </span>
                <span>Answered</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">
                  {paletteStats.notAnswered}
                </span>
                <span>Not Answered</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-purple-700 text-[10px] font-bold text-white">
                  {paletteStats.markedForReview}
                </span>
                <span>Marked for Review</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="relative flex size-5 shrink-0 items-center justify-center rounded bg-purple-700 text-[10px] font-bold text-white">
                  {paletteStats.answeredMarked}
                  <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-white bg-emerald-500" />
                </span>
                <span>Ans & Marked</span>
              </div>

              <div className="col-span-2 flex items-center gap-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {paletteStats.notVisited}
                </span>
                <span>Not Visited</span>
              </div>
            </div>
          </div>

          {/* Grid of question buttons, grouped by subject. The heading used to
              read "{SUBJECT} Questions" above a grid that rendered every
              question in the paper regardless of subject. */}
          <div className="flex-1 overflow-y-auto p-3.5">
            {subjects.map((subj) => {
              const inSubject = questions
                .map((q, idx) => ({ q, idx }))
                .filter(({ q }) => q.subject === subj);
              if (inSubject.length === 0) return null;

              return (
                <div key={subj} className="mb-4 last:mb-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {subj} · {inSubject.length}
                  </h3>

                  <div className="mt-2.5 grid grid-cols-5 gap-2">
                    {inSubject.map(({ q, idx }) => (
                      <PaletteButton
                        key={q.id}
                        question={q}
                        isCurrent={idx === currentIndex}
                        onClick={() => goToQuestion(idx)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* 4. Mobile Bottom Sheet Palette Drawer */}
      {mobilePaletteOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 sm:hidden">
          <div className="max-h-[80vh] rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Question Palette</h3>
              <button onClick={() => setMobilePaletteOpen(false)} className="rounded p-1 text-slate-500 dark:text-slate-400">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-3 grid max-h-60 grid-cols-6 gap-2 overflow-y-auto p-1">
              {questions.map((q, idx) => (
                <PaletteButton
                  key={q.id}
                  question={q}
                  isCurrent={idx === currentIndex}
                  onClick={() => {
                    goToQuestion(idx);
                    setMobilePaletteOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Final Submit Confirmation Modal */}
      {submitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg shadow-2xl">
            <CardBody className="space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Confirm Test Submission</h2>
                <button onClick={() => setSubmitModalOpen(false)} className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="size-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Are you sure you want to submit? Review your attempt summary below before final submission:
              </p>

              {submitError ? (
                <Alert tone="red" title="Could not submit">
                  <p>{submitError}</p>
                  <p className="mt-1">
                    Your answers are still saved. Check your connection and press{' '}
                    <strong>Yes, Submit Test</strong> again.
                  </p>
                </Alert>
              ) : null}

              {/* Summary Table */}
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-center text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-2 text-left">Subject</th>
                      <th className="py-2 px-2">Total</th>
                      <th className="py-2 px-2 text-emerald-700 dark:text-emerald-400">Answered</th>
                      <th className="py-2 px-2 text-red-600 dark:text-red-400">Not Ans</th>
                      <th className="py-2 px-2 text-purple-700 dark:text-purple-400">Marked</th>
                      <th className="py-2 px-2 text-slate-400">Not Visited</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {subjects.map((s) => {
                      const sQs = questions.filter((q) => q.subject === s);
                      const ans = sQs.filter((q) => q.state === 'answered' || q.state === 'answered_flagged').length;
                      const notAns = sQs.filter((q) => q.state === 'seen_unanswered').length;
                      const marked = sQs.filter((q) => q.state === 'flagged_unanswered' || q.state === 'answered_flagged').length;
                      const notSeen = sQs.filter((q) => q.state === 'not_seen').length;
                      return (
                        <tr key={s} className="font-medium">
                          <td className="py-2 px-2 text-left capitalize font-bold text-slate-800 dark:text-slate-200">{s}</td>
                          <td className="py-2 px-2">{sQs.length}</td>
                          <td className="py-2 px-2 text-emerald-700 font-bold dark:text-emerald-400">{ans}</td>
                          <td className="py-2 px-2 text-red-600 dark:text-red-400">{notAns}</td>
                          <td className="py-2 px-2 text-purple-700 dark:text-purple-400">{marked}</td>
                          <td className="py-2 px-2 text-slate-400">{notSeen}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2 text-left">Total</td>
                      <td className="py-2 px-2">{questions.length}</td>
                      <td className="py-2 px-2 text-emerald-700 font-bold dark:text-emerald-400">{paletteStats.answered + paletteStats.answeredMarked}</td>
                      <td className="py-2 px-2 text-red-600 dark:text-red-400">{paletteStats.notAnswered}</td>
                      <td className="py-2 px-2 text-purple-700 dark:text-purple-400">{paletteStats.markedForReview + paletteStats.answeredMarked}</td>
                      <td className="py-2 px-2 text-slate-400">{paletteStats.notVisited}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setSubmitModalOpen(false)}
                  disabled={submitting}
                >
                  Return to Exam
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setSubmitError(null);
                    void closeAttempt('manual');
                  }}
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {submitting ? <Spinner className="size-4" /> : 'Yes, Submit Test'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
