'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { get, set } from 'idb-keyval';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Flag,
  HelpCircle,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Alert, Badge, Button, buttonClass, Card, CardBody, Spinner } from '@/components/ui';
import { KatexSpan, QuestionBody } from '@/components/Katex';
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
};

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

  // Online / Offline & Sync status
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const clockOffsetRef = useRef<number>(Date.now() - new Date(serverTime).getTime());

  // Active question timing tracking
  const activeSinceRef = useRef<number>(performance.now());
  const pendingSyncRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentQ = questions[currentIndex];

  // Subject tabs
  const subjects = ['physics', 'chemistry', 'maths'] as const;
  const currentSubject = currentQ?.subject ?? 'physics';

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

  // 2. Countdown Timer
  useEffect(() => {
    const targetTime = new Date(deadlineAt).getTime();

    const updateTimer = () => {
      const adjustedNow = Date.now() - clockOffsetRef.current;
      const diff = Math.max(0, Math.floor((targetTime - adjustedNow) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        // Auto-submit when timer expires
        handleAutoSubmit();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  // 3. Precision timing per question accumulation
  const flushTimeSpent = useCallback(() => {
    if (!questions[currentIndex]) return;
    const now = performance.now();
    const delta = Math.round(now - activeSinceRef.current);
    activeSinceRef.current = now;

    if (delta > 0) {
      setQuestions((prev) => {
        const copy = [...prev];
        if (copy[currentIndex]) {
          copy[currentIndex] = {
            ...copy[currentIndex],
            timeSpentMs: (copy[currentIndex].timeSpentMs ?? 0) + delta,
          };
        }
        return copy;
      });
    }
  }, [currentIndex, questions]);

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

  // 5. Server Autosave Dispatcher
  const syncWithServer = useCallback(async () => {
    if (questions.length === 0 || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncError(null);

    flushTimeSpent();

    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          response: q.response,
          state: q.state,
          timeSpentMs: q.timeSpentMs,
          visitCount: q.visitCount,
        })),
      };

      const res = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 403 && data.error === 'attempt_expired') {
          router.push(`/student/attempts/${attemptId}/result`);
          return;
        }
        throw new Error(data?.message || 'Sync failed');
      }

      pendingSyncRef.current = false;
    } catch (err: any) {
      setSyncError('Sync paused (saved locally)');
    } finally {
      setIsSyncing(false);
    }
  }, [attemptId, flushTimeSpent, questions, router]);

  // Debounced auto-sync when questions state updates
  const scheduleSync = useCallback(() => {
    pendingSyncRef.current = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      syncWithServer();
    }, 300);
  }, [syncWithServer]);

  // 6. Periodic Heartbeat Sync (every 15s)
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

    const handleBeforeUnload = () => {
      flushTimeSpent();
      const payload = JSON.stringify({
        answers: questions.map((q) => ({
          questionId: q.id,
          response: q.response,
          state: q.state,
          timeSpentMs: q.timeSpentMs,
        })),
      });
      navigator.sendBeacon(`/api/attempts/${attemptId}/answers`, payload);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [attemptId, flushTimeSpent, questions, syncWithServer]);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Navigating to question index
  const goToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentIndex) return;

    flushTimeSpent();

    setQuestions((prev) => {
      const copy = [...prev];
      const target = copy[targetIndex];
      if (target && target.state === 'not_seen') {
        copy[targetIndex] = { ...target, state: 'seen_unanswered' };
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

  // Action: Set Integer Value
  const handleSetIntegerValue = (val: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const q = copy[currentIndex];
      if (q) {
        const num = val.trim() === '' ? undefined : Number(val);
        copy[currentIndex] = {
          ...q,
          response: val.trim() === '' ? null : { value: Number.isNaN(num) ? val : num },
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
          state: nextState,
        };
      }
      return copy;
    });
    scheduleSync();
  };

  // Jump to first question of selected subject tab
  const handleSubjectTab = (subj: 'physics' | 'chemistry' | 'maths') => {
    const idx = questions.findIndex((q) => q.subject === subj);
    if (idx !== -1) {
      goToQuestion(idx);
    }
  };

  // Auto-Submit Handler
  const handleAutoSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    flushTimeSpent();

    try {
      // Final flush
      await fetch(`/api/attempts/${attemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            questionId: q.id,
            response: q.response,
            state: q.state,
            timeSpentMs: q.timeSpentMs,
          })),
        }),
      }).catch(() => {});

      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
      const data = await res.json();
      router.push(`/student/attempts/${attemptId}/result`);
    } catch (err) {
      router.push(`/student/attempts/${attemptId}/result`);
    }
  };

  // Manual Submit
  const handleFinalSubmit = async () => {
    setSubmitting(true);
    flushTimeSpent();

    try {
      await fetch(`/api/attempts/${attemptId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            questionId: q.id,
            response: q.response,
            state: q.state,
            timeSpentMs: q.timeSpentMs,
          })),
        }),
      }).catch(() => {});

      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to submit test');

      router.push(`/student/attempts/${attemptId}/result`);
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

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

  const subjectCounts = useMemo(() => {
    const stats: Record<string, { total: number; answered: number }> = {
      physics: { total: 0, answered: 0 },
      chemistry: { total: 0, answered: 0 },
      maths: { total: 0, answered: 0 },
    };
    for (const q of questions) {
      if (stats[q.subject]) {
        stats[q.subject].total++;
        if (q.state === 'answered' || q.state === 'answered_flagged') {
          stats[q.subject].answered++;
        }
      }
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
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
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
            className={`font-mono text-base font-bold ${
              remainingSeconds < 300 ? 'text-red-600 font-extrabold' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {timerText}
          </span>
        </div>

        {/* Right Actions: Sync, Fullscreen & Submit */}
        <div className="flex items-center gap-2">
          {/* Offline / Sync indicator */}
          {!isOnline ? (
            <span className="hidden items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 sm:inline-flex dark:bg-amber-950/80 dark:text-amber-300">
              <WifiOff className="size-3 text-amber-600" />
              Offline (Saved)
            </span>
          ) : isSyncing ? (
            <span className="hidden items-center gap-1 text-[11px] text-slate-400 sm:inline-flex">
              <Spinner className="size-3" />
              Syncing...
            </span>
          ) : null}

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
                        value={currentQ.response?.value !== undefined ? String(currentQ.response.value) : ''}
                        onChange={(e) => handleSetIntegerValue(e.target.value)}
                        placeholder="Enter numerical answer..."
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg font-bold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Enter exact integer or decimal value (e.g. 42 or 3.14).
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
                disabled={!currentQ?.response}
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

          {/* Grid of question buttons */}
          <div className="flex-1 overflow-y-auto p-3.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {currentSubject.toUpperCase()} Questions:
            </h3>

            <div className="mt-2.5 grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                let bgClass = 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'; // not_seen

                if (q.state === 'answered') {
                  bgClass = 'bg-emerald-600 text-white hover:bg-emerald-700';
                } else if (q.state === 'seen_unanswered') {
                  bgClass = 'bg-red-600 text-white hover:bg-red-700';
                } else if (q.state === 'flagged_unanswered') {
                  bgClass = 'bg-purple-700 text-white hover:bg-purple-800';
                } else if (q.state === 'answered_flagged') {
                  bgClass = 'bg-purple-700 text-white hover:bg-purple-800';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => goToQuestion(idx)}
                    className={`relative flex size-9 items-center justify-center rounded-md font-bold text-xs transition-all ${bgClass} ${
                      isCurrent ? 'ring-2 ring-brand-500 ring-offset-2 scale-105' : ''
                    }`}
                  >
                    {q.position}
                    {q.state === 'answered_flagged' && (
                      <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
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
              {questions.map((q, idx) => {
                let bgClass = 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                if (q.state === 'answered') bgClass = 'bg-emerald-600 text-white';
                else if (q.state === 'seen_unanswered') bgClass = 'bg-red-600 text-white';
                else if (q.state === 'flagged_unanswered') bgClass = 'bg-purple-700 text-white';
                else if (q.state === 'answered_flagged') bgClass = 'bg-purple-700 text-white';

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      goToQuestion(idx);
                      setMobilePaletteOpen(false);
                    }}
                    className={`relative flex size-10 items-center justify-center rounded-md font-bold text-xs ${bgClass} ${
                      idx === currentIndex ? 'ring-2 ring-brand-500 ring-offset-2' : ''
                    }`}
                  >
                    {q.position}
                    {q.state === 'answered_flagged' && (
                      <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </button>
                );
              })}
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
                  onClick={handleFinalSubmit}
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
