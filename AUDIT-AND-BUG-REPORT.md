# Audit & Bug Report — SRSMA JEE Mains Test Platform

**Audited:** 2026-08-30 · commit `e262dde` (branch `main`, clean tree)
**Scope:** full repository — `src/` (35 route handlers, 24 pages/components), `drizzle/`, `scripts/`, `prompts/`, config.
**Method:** line-by-line read of every source file; cross-checked every client `fetch()` against the routes that exist; ran `tsc --noEmit` and `vitest run`.

> ## ✅ Status: fixed
>
> **All non-WIP findings in this report have been fixed and verified.** See the
> [Fix log](#fix-log) at the bottom for what changed and how it was verified.
> Findings still marked **[WIP]** — A-2, A-3, A-9 and A-25…A-31 — were left
> alone as requested; they are all in the analytics surface.

**Health, before → after the fix pass**

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | Clean | Clean |
| `npm test` | 33 passed / 5 files | **54 passed / 9 files** |
| `npm run lint` | Never ran (`ignoreDuringBuilds: true`, no config) | **0 errors**, 45 warnings |
| `npm run check-tokens` | n/a | **22 tokens defined, all references resolve** |
| `next build` | — | Succeeds |

> **Note on Analytics.** You flagged analytics as still-pending work. Analytics findings are marked **[WIP]** below. They're included because two of them (A-2, A-3) are hard crashes on pages that are already wired into the nav, and one (A-9) is a results-policy bypass — but treat the rest as a to-do list for that area rather than regressions.

---

## Severity key

| | Meaning |
|---|---|
| **P0** | Feature is completely non-functional, or student marks are wrong/lost |
| **P1** | Data integrity, security, or a correctness bug with a realistic trigger |
| **P2** | Visible defect, misleading output, or a maintainability/robustness risk |

---

## P0 — Blockers

### A-1. Students cannot start a test at all — the endpoint does not exist
`src/app/student/tests/[id]/TestInstructionClient.tsx:35`

```ts
const res = await fetch(`/api/tests/${test.id}/start`, { method: 'POST' });
```

There is no `src/app/api/tests/[id]/start/` directory. The route that creates an attempt is `POST /api/tests/[id]/attempts` ([route.ts](src/app/api/tests/[id]/attempts/route.ts)). The call 404s, Next returns its HTML error page, `res.json()` throws on `<`, and the student sees a raw parser error in the red alert box.

**Impact:** the entire student journey is unreachable. Nothing downstream of "I am ready to begin" can ever have been exercised end-to-end.
**Fix:** change the URL to `/api/tests/${test.id}/attempts`, or add a `start/route.ts` alias.

---

### A-2. Student Analytics page always errors — wrong endpoint path  **[WIP]**
`src/app/student/analytics/StudentAnalyticsClient.tsx:66`

```ts
const res = await fetch('/api/analytics/student');
```

The route is `/api/analytics/student/me` ([route.ts](src/app/api/analytics/student/me/route.ts)). Same 404 → HTML → JSON-parse failure. The "View My Analytics" button on the student dashboard leads to a permanent error state.

---

### A-3. Teacher Cohort Analytics crashes on render — client/server contract mismatch  **[WIP]**
`src/app/teacher/analytics/TeacherCohortAnalyticsClient.tsx:202` vs `src/app/api/analytics/cohort/route.ts:95-103`

| Client expects | Server returns |
|---|---|
| `data.leaderboard` | `data.studentRankings` |
| `s.studentName`, `s.email`, `s.testsAttempted` | `fullName`, `username`, `testsTaken` |
| `wc.totalResponses`, `wc.correctResponses`, `wc.accuracy` | `totalAnswers`, `correctAnswers`, `accuracyPct` |

`data.leaderboard.map(...)` throws `TypeError: Cannot read properties of undefined` — the page white-screens into the Next.js error boundary. Even if that were guarded, every weak-chapter cell would render blank and the urgency badge would read "Good" for all rows (`undefined < 40` is `false`).

---

### A-4. Timed-out attempts are never graded — students who run out of time score zero

Three code paths mark an attempt `auto_submitted` **without scoring it**:

| Location | What it does |
|---|---|
| `src/lib/sweep.ts:26-30` (60s interval + opportunistic on every attempt read) | `set({ status: 'auto_submitted', submittedAt })` — no grading |
| `src/app/api/attempts/[id]/answers/route.ts:48-51` | same, on a past-deadline PATCH |
| `src/app/api/attempts/[id]/route.ts:16` | invokes the sweep on every attempt GET |

`sweep.ts`'s own comment says *"the actual scoring transaction runs separately"* — but nothing ever runs it. Worse, `POST /api/attempts/[id]/submit` short-circuits on already-submitted attempts:

```ts
// submit/route.ts:26
if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
  return json({ ok: true, alreadySubmitted: true, totalMarks: attempt.totalMarks ? Number(...) : 0, ... });
}
```

**The race is guaranteed to fire in practice.** The client's auto-submit runs off a 1-second timer; the server sweep runs every 60s *and* opportunistically on every attempt read. Whichever lands first wins. If the sweep wins, the student's submit becomes a no-op and their result page shows **0 / 0 marks with every answer discarded** — permanently, with no way to re-grade.

**Fix:** extract the grading transaction from `submit/route.ts` into a shared `gradeAndCloseAttempt(attemptId, status)` and call it from the sweep and both deadline paths. Add a `total_marks IS NULL` back-fill for any attempts already in this state.

---

### A-5. Ungraded attempts rank **#1** and get **100th percentile**
`drizzle/0000_init.sql:268-275`

```sql
rank() OVER (PARTITION BY a.test_id ORDER BY a.total_marks DESC) AS rank,
round(100 * percent_rank() OVER (PARTITION BY a.test_id ORDER BY a.total_marks)::numeric, 1) AS percentile
```

Postgres sorts `NULLS FIRST` for `DESC` and `NULLS LAST` for `ASC`. Every attempt left ungraded by A-4 has `total_marks = NULL`, so it lands at **rank 1** on the leaderboard *and* at the **top percentile**. A student who abandoned the tab tops the class.

This propagates into `/api/analytics/tests/[id]`, `export.csv`, `/api/analytics/cohort`, and every student's scorecard.

**Fix:** `ORDER BY a.total_marks DESC NULLS LAST` / `ASC NULLS FIRST`, and add `AND a.total_marks IS NOT NULL` to the view's `WHERE`. Fixing A-4 removes the root cause; this hardens the view regardless.

---

### A-6. Tolerance-range answer keys can never be saved
`src/app/teacher/questions/[id]/QuestionEditor.tsx:665-688`

```tsx
onChange={(e) => {
  const min = e.target.value === '' ? undefined : Number(e.target.value);
  const max = answer && 'max' in answer ? answer.max : undefined;
  onChange(min !== undefined && max !== undefined ? { min, max } : null);   // ← null
}}
```

Both inputs are controlled off `answer`. Typing into `min` while `max` is empty calls `onChange(null)` — which wipes `answer`, which blanks the `min` field you just typed into. The same happens in reverse. **The range mode is a dead control**; only `{ value: n }` exact answers are reachable, even though grading, the DB, and the result screen all support ranges.

**Fix:** hold `min`/`max` in local component state and only lift a `{min, max}` (or `null`) when both are present.

---

## P1 — High

### A-7. `beforeunload` autosave silently 405s
`src/app/student/attempts/[id]/TestRunnerClient.tsx:301`

```ts
navigator.sendBeacon(`/api/attempts/${attemptId}/answers`, payload);
```

`sendBeacon` always issues **POST** with `Content-Type: text/plain;charset=UTF-8`. The route only exports `PATCH`. Every beacon is a 405. The `README`/`PROGRESS.md` claim of *"`beforeunload` `navigator.sendBeacon` ensure zero lost answers"* does not hold.

**Fix:** add a `POST` export to the answers route that delegates to the PATCH handler and tolerates `text/plain`; send `new Blob([payload], { type: 'application/json' })`.

---

### A-8. Auto-submit fires every second with an empty answer set (stale closure)
`src/app/student/attempts/[id]/TestRunnerClient.tsx:148-165`

```ts
useEffect(() => {
  const updateTimer = () => { ...; if (diff <= 0) handleAutoSubmit(); };
  const interval = setInterval(updateTimer, 1000);
  return () => clearInterval(interval);
}, [deadlineAt]);          // ← handleAutoSubmit and questions are NOT deps
```

The effect closes over the **first render's** `handleAutoSubmit`, which in turn closes over the first render's `questions` (`[]`) and `submitting` (`false`):

1. `if (submitting) return` never trips — the captured `submitting` stays `false` forever, so the interval re-fires the whole submit sequence **once per second**.
2. The "final flush" PATCH sends `{ answers: [] }` — the last un-synced answers are lost. With the 15s heartbeat also broken (A-24), that can be the last 15 seconds of work.
3. `router.push` is called repeatedly.

**Fix:** hoist the guard into a ref (`if (submitRef.current) return; submitRef.current = true`), read answers from a ref, and clear the interval on fire.

---

### A-9. Students can see scores for tests whose results are not released  **[WIP]**
`src/app/api/analytics/student/me/route.ts`

`GET /api/attempts/[id]/result` carefully gates on policy:

```ts
if (session.role === 'student' && test.resultsPolicy === 'on_release' && !test.releasedAt) {
  throw new HttpError(403, 'awaiting_release', ...);
}
```

`/api/analytics/student/me` has **no such gate**. It returns `totalMarks`, `maxMarks`, `rank`, and `percentile` for every attempt with `status <> 'in_progress'`, plus per-chapter correctness. A student blocked on the result page just opens `/student/analytics` and reads their score.

**Fix:** join `tests` and null out score/rank/percentile (or drop the row) where `resultsPolicy = 'on_release' AND released_at IS NULL`.

---

### A-10. Editing a test's questions permanently breaks its historical attempts
`src/app/api/tests/[id]/questions/route.ts:58-73`

```ts
await db.transaction(async (tx) => {
  await tx.delete(testQuestions).where(eq(testQuestions.testId, id));
  await tx.insert(testQuestions).values(...);
});
```

No guard for existing attempts. `attempts.question_order` is a materialised snapshot, but `GET /api/attempts/[id]/result` re-joins through `test_questions` to fetch marks:

```ts
.innerJoin(testQuestions, and(eq(testQuestions.questionId, questions.id), eq(testQuestions.testId, attempt.testId)))
...
if (!q) throw new HttpError(500, 'missing_question', `Question ${qid} not found`);
```

Remove one question from a test after students have taken it and **every past attempt's result page 500s forever**. `PATCH /api/tests/[id]` has the same exposure for `durationS`, `maxAttempts`, and the shuffle flags.

**Related:** the same PUT accepts duplicate `position` values or duplicate `questionId`s in one payload → raw unique/PK violation → bare 500. And it accepts `draft`/`archived` questions into an already-published test, bypassing the publish gate.

**Fix:** refuse the PUT with 409 when `attemptCount > 0` (or version the test); validate uniqueness of position/id before the transaction; re-check `status = 'verified'` when the test is published.

---

### A-11. CSV export route is not wrapped in `withApi`
`src/app/api/analytics/tests/[id]/export.csv/route.ts:9`

```ts
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
```

Every other route uses `withApi`. Here, `apiTeacher()`'s 403 `HttpError` and the `not_found` throw escape uncaught — Next returns a generic 500 (with a stack trace in dev) instead of the intended status and JSON body.

---

### A-12. Four API routes use the page guard instead of the API guard
`requireSession()` calls `redirect('/login')`, which throws a `NEXT_REDIRECT` error. Inside a `withApi` try/catch that becomes `{ error: 'internal_error' }` with **HTTP 500** instead of `401 unauthenticated`.

| File | Line |
|---|---|
| `src/app/api/attempts/[id]/submit/route.ts` | 11 |
| `src/app/api/attempts/[id]/result/route.ts` | 10 |
| `src/app/api/attempts/[id]/route.ts` | 11 |
| `src/app/api/attempts/[id]/questions/route.ts` | 11 |

`src/lib/auth.ts` already provides `apiSession()` for exactly this. The client can't distinguish "session expired" from "server broke", so an expired cookie mid-exam surfaces as an unexplained failure rather than a re-login prompt.

---

### A-13. Test open/close times shift by the UTC offset on every save
`src/app/teacher/tests/[id]/TestBuilderClient.tsx:88-89, 251-252`

```ts
const [opensAt, setOpensAt] = useState(test.opensAt ? test.opensAt.slice(0, 16) : '');   // ISO UTC → local input
...
opensAt: opensAt ? new Date(opensAt).toISOString() : null,                                // local input → UTC
```

`slice(0,16)` strips the `Z` from an ISO-8601 UTC string and hands the result to `<input type="datetime-local">`, which interprets it as **local** time. On save, `new Date(...)` re-reads it as local and converts to UTC — adding the offset. At IST (+05:30), a window set for 09:00 saves as 14:30, then 20:00 on the next save, and so on. It compounds with every visit to the settings tab.

**Fix:** convert explicitly both ways (`toLocalInputValue(date)` / `fromLocalInputValue(str)`), or store and display in a fixed timezone.

---

### A-14. Login timing side-channel — the documented mitigation is a no-op
`src/lib/auth.ts:26-31` and `src/lib/password.ts:28`

```ts
// auth.ts — comment claims constant-time behaviour
if (!user || !user.isActive || !user.canLogin) {
  // "Still spend the time hashing, so a missing user is not measurably faster"
  await verifyPassword(password, null);
  return null;
}
```
```ts
// password.ts — returns instantly, does no work
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
```

The scrypt work (`N = 32768`, ~100 ms) is skipped entirely. Unknown usernames respond ~100 ms faster than known ones — a trivially measurable username-enumeration oracle. Note the seeded `demo_student_*` accounts have `password_hash = NULL`, so they are enumerable too.

**Fix:** verify against a fixed dummy hash instead of passing `null`.

---

### A-15. Re-ingesting a paper duplicates its questions, or 500s
`src/app/api/papers/[id]/ingest/route.ts:45`

```ts
humanCode: `${paper.code}-${q.subject[0].toUpperCase()}-${String(q.sourceQno).padStart(3, '0')}`,
```

Nothing checks whether the paper already has questions. Pasting a corrected JSON for the same paper hits the `human_code` UNIQUE constraint → Postgres `23505` → unhandled → bare `500 internal_error` with no explanation. If question numbers happen to differ, you instead get a silently duplicated question bank.

`POST /api/questions/ingest` (standalone) has the mirror problem: a random hex suffix means re-pasting **always** succeeds and always duplicates.

**Fix:** offer explicit `replace` / `append` semantics, and translate `23505` into a specific message the way `isForeignKeyViolation` already does for `23503`.

---

### A-16. Attempt-number race on concurrent test starts
`src/app/api/tests/[id]/attempts/route.ts:101`

```ts
const attemptNo = existingAttempts.length + 1;
```

Read-then-write outside a transaction, against a `UNIQUE (test_id, student_id, attempt_no)` constraint. Two tabs (or a double-click on "I am ready to begin") produce two attempts with `attempt_no = 1` → constraint violation → 500. The `maxAttempts` check has the same read-then-write shape and can be exceeded.

**Fix:** compute `attempt_no` inside the transaction via `SELECT coalesce(max(attempt_no),0)+1 ... FOR UPDATE`, and catch `23505` as a 409.

---

### A-17. Publish proceeds even when saving the question list failed
`src/app/teacher/tests/[id]/TestBuilderClient.tsx:288-293`

```ts
await saveQuestions();     // sets `error` state on failure, does not throw
setPublishing(true);
const res = await fetch(`/api/tests/${test.id}/publish`, { method: 'POST' });
```

A failed save is swallowed; the test publishes with whatever question set was last persisted, while the teacher sees the on-screen list they *thought* they published. Have `saveQuestions()` return a boolean and bail on `false`.

---

### A-18. Answer keys are not validated against the question's options
`src/lib/zod/question.ts`

`QuestionAnswerSchema` accepts `{ key: 'D' }` on a question with only options A–C, and `{ min: 10, max: 2 }` with min above max. The `verify` gate ([verify/route.ts](src/app/api/questions/[id]/verify/route.ts)) only checks that `answer IS NOT NULL` and that options number ≥ 2.

Result: a question can reach `verified`, be published, and mark **every** student wrong — for an inverted range, unconditionally. The `AnswerEditor` dropdown also leaves a stale `{key:'D'}` in state when option D is deleted (the `<select>` falls back to `''` while `answer` keeps the dead key).

**Fix:** add a `.superRefine` — MCQ key must exist in `options`; `min <= max`. Re-check server-side in the verify gate.

---

### A-19. Score and summary disagree on ungradeable responses

The numerical input is `type="text"` and accepts anything (`TestRunnerClient.tsx:765`). Typing `abc` stores `{ value: "abc" }`.

| Layer | Verdict |
|---|---|
| `src/lib/grading.ts:83` | `Number.isNaN` → **unattempted**, awards `marksUnattempted` |
| `src/app/api/attempts/[id]/result/route.ts:124-133` | `response !== null` → **attempted**, `isCorrect` is null → falls into `else wrongCount++` |

The scorecard therefore reports a wrong answer that cost 0 marks. `subjectScores` and the cohort chapter analytics inherit the same disagreement.

**Fix:** constrain the input (`inputMode="decimal"`, reject non-numeric on change), and make `isAttempted` in the result route mean "gradeable response present", matching `grading.ts`.

---

## P2 — Medium

### Design system & dark mode

**A-20. Roughly half the brand palette is undefined — dark-mode brand colours are silently dead.**
`src/app/globals.css:6-23` defines `brand-{50,100,200,500,600,700,800,900}` and `accent-{100,400,500,600}`. The codebase uses these classes **58 times across 21 files**:

| Used but never defined | Example sites |
|---|---|
| `brand-300` | `NavLink.tsx:26`, `ui.tsx:145` (Badge), `ThemeToggle.tsx:52/70/88`, `teacher/page.tsx:32` |
| `brand-400` | ~20 sites, almost all `dark:text-brand-400` |
| `brand-950` | ~15 sites, almost all `dark:bg-brand-950` |
| `accent-200/300/700/800/900/950` | `QuestionEditor.tsx:305/327/556`, `PaperVerifyStudio.tsx:328/335/609` |

Tailwind v4 generates no utility for an undefined token, so these classes emit nothing at all. Every `dark:text-brand-400` inherits the parent colour instead, `dark:bg-brand-950` is transparent, and the `Badge tone="brand"` ring/text in dark mode is unstyled. **This is why dark mode looks washed out — it's not a tuning problem, the classes don't exist.**
**Fix:** add the missing steps to `@theme` (a full 50→950 ramp for both scales).

**A-21. Whole pages ship with no `dark:` variants.**

| File | Notes |
|---|---|
| `teacher/tests/[id]/TestBuilderClient.tsx` | 897 lines, zero `dark:` — white cards on the dark shell |
| `teacher/tests/[id]/analytics/TestAnalyticsClient.tsx` | Same, plus Recharts colours hardcoded (`#e2e8f0` grid, `#ffffff` tooltip) |
| `student/attempts/[id]/result/ResultReviewClient.tsx` | Hero, subject cards, and all question/option cards are light-only (`text-slate-900`, `bg-slate-50` at lines 149, 259, 386, 410-414, 453) |

**A-22. `ThemeToggle`'s dark-mode moon icon is `text-brand-400`** — an undefined token (A-20), so the icon renders in the inherited colour.

### API contract mismatches

**A-23. `TeacherTestsClientActions.tsx:35`** reads `data?.details?.unverified`. `withApi` spreads `HttpError.extra` at the **top level**, so the payload is `{ error, message, unverified }`. The "which questions are unverified" list never displays; the teacher gets only the generic count.

**A-24. Heartbeat and event listeners re-register on every keystroke.**
`TestRunnerClient.tsx:203-259` — `syncWithServer` depends on `questions`, so it gets a new identity on every state change, so the `useEffect([syncWithServer])` holding the 15s heartbeat tears down and restarts. **For an actively-working student the 15s heartbeat effectively never fires.** The same applies to the online/offline/visibility/beforeunload listener effect at line 262. Move `questions` into a ref.

### Analytics correctness  **[WIP]**

**A-25.** `v_question_stats` has no `test_id` — it aggregates a question across **every** test it appears in. `/api/analytics/tests/[id]` joins it to `test_questions` and renders it as "Question Item Calibration" for that one test. The percentages shown are global.
**A-26.** Score-distribution buckets are hardcoded `<0 / 0-50 / 51-100 / 101-150 / 151-200 / 200+` (`analytics/tests/[id]/route.ts:71-78`). For a 20-question test (max 80) every student lands in one or two bars. Derive buckets from `maxMarks`.
**A-27.** Rank fallbacks fabricate success: `rankInfo = rankRows.rows[0] ?? { rank: 1, percentile: 100 }` (`result/route.ts:46`) and `pctl = rInfo ? ... : 100` (`student/me/route.ts:118`). A missing row reports a top rank rather than "not ranked".
**A-28.** Two different accuracy formulas on one page: the hero uses `correct/(correct+wrong)` (`result/route.ts:173`), the subject cards use `correct/total` including unattempted (`ResultReviewClient.tsx:246`).
**A-29.** Leaderboards list one row per **attempt**, not per student — a student with 3 attempts occupies 3 rows, and the header says "N candidates graded".
**A-30.** Cohort ranking orders by `avg_score` across differing numbers of tests taken, so one lucky easy test outranks a consistent performer.
**A-31.** Median uses `scores[Math.floor(n/2)]` — the upper element for even *n*, not the mean of the middle two.

### Data & robustness

**A-32.** `/api/questions` casts query params straight into enum comparisons without validation (`route.ts:29-34`): `?subject=maths2` reaches Postgres as an invalid enum literal → 500. `?difficulty=x` → `Number('x')` → `NaN`. Validate with `z.enum(...).safeParse`.
**A-33.** `nextPaperCode` (`api/papers/route.ts:99-107`) loads **every** paper code and linear-scans for a gap, outside any transaction. Racy and O(n) per upload.
**A-34.** `attempt_events` (`api/attempts/[id]/events/route.ts`) has no rate limit, no size cap, and no check that the attempt is still in progress. A student can append rows indefinitely.
**A-35.** `fn_question_revision` (`0000_init.sql:239`) fires on **every** UPDATE — including the `verify` route's status flip — so the revision history fills with non-edits.
**A-36.** PGlite has no real query concurrency; the 60s sweep interval (`db/client.ts:76`) is fire-and-forget against the same WASM instance a request handler may be mid-query on. The code comments acknowledge this crashes the module (`RuntimeError: null function or function signature mismatch`) and recommend `pg.runExclusive` — not yet done.
**A-37.** Ownership is checked **after** the redirect in `src/app/student/attempts/[id]/page.tsx:39-46`. Student B hitting Student A's attempt URL is bounced to A's result URL (which does then 403). Reorder the checks.
**A-38.** `visitCount` is plumbed through the schema, the DTO, the PATCH handler, and the client payload — and is **never incremented** anywhere. Always 0.

### Security

**A-39. Any signed-in student can download any source paper PDF.** `src/app/api/papers/[id]/pdf/route.ts:23` guards with `apiSession()` only. The comment says *"students never have a path to this route because nothing in the student UI links to it"* — that is security by obscurity. The PDF is the original exam paper; a student mid-test can fetch `/api/papers/<any-uuid>/pdf`. Gate on `role === 'teacher'`.
**A-40. Login page renders live credentials unconditionally.** `src/app/login/page.tsx:41-49` prints `Teacher` / `Student` / `112345`. Gate on `process.env.NODE_ENV !== 'production'` and remove the accounts in `scripts/seed.ts` for any non-local build.
**A-41. No rate limiting or lockout on `POST /api/auth/login`.** With A-14's enumeration oracle, a 6-digit password is trivially brute-forced.
**A-42. Session cookie has no `secure` flag** (`src/lib/session.ts:63-70`). Intentional for localhost, but there is no env switch to turn it on.
**A-43. CSV formula injection** — `escapeCsv` (`export.csv/route.ts:44`) quotes and doubles `"` but does not neutralise a leading `=`, `+`, `-`, or `@`. A student named `=cmd|...` executes on open in Excel. Prefix such values with `'`.

### Hygiene

**A-44.** `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs` and **no ESLint config file in the repo** — lint has never run. Consequence: ~60 unused imports ship to the client (e.g. `TestRunnerClient.tsx` imports 16 unused lucide icons; `ResultReviewClient.tsx` imports 12).
**A-45.** `dev_out.log` is committed and not in `.gitignore`.
**A-46.** **Zero tests cover any route handler, the grading pipeline end-to-end, auth, or the sweep.** The 33 passing tests exercise `grading.ts`, `dto.ts`, `json-repair.ts`, `question-render.ts`, and the ingest Zod schema only. No test in the suite could have caught A-1 through A-5.
**A-47.** `/api/tests/available/route.ts` is **dead code** — nothing fetches it. `src/app/student/page.tsx` re-implements the same logic server-side, and the two have already diverged: the route counts in-progress attempts against `maxAttempts` (line 46), the page counts only completed ones (line 52).

### UI defects

**A-48.** Question-bank list has **no pagination UI**. `/api/questions` pages at 30 and returns `total`, but `QuestionsListView` never sends `page` — it just prints "Showing 30 of 412". Questions past the first 30 are unreachable except via search.
**A-49.** The Overview tile links to `/teacher/questions?status=verified`, but `QuestionsListView` only reads `paperId` from the URL (line 22). The filter is ignored.
**A-50.** Palette heading reads `{currentSubject} Questions:` (`TestRunnerClient.tsx:886`) but the grid below renders **all** questions, not that subject's.
**A-51.** Subject tabs are hardcoded to physics/chemistry/maths (`TestRunnerClient.tsx:88`). A single-subject test shows two dead tabs reading `0/0`.
**A-52.** Fullscreen state desyncs — `isFullscreen` is set optimistically with no `fullscreenchange` listener, so pressing <kbd>Esc</kbd> leaves the button showing "exit fullscreen".
**A-53.** `syncError` is set on every failed sync (`TestRunnerClient.tsx:238`) and **never rendered**. The student is never told their answers stopped reaching the server.
**A-54.** `isOnline` initialises to `true` instead of `navigator.onLine`; a student who loads the page already offline sees no indicator.
**A-55.** Nested interactive elements: `UploadQuestionsView.tsx:131-143` puts a `<CopyButton>` (a `<button>`) inside the disclosure `<button>`. Invalid HTML; React hydration warning; keyboard-inaccessible.
**A-56.** `OptionsEditor` (`QuestionEditor.tsx:571`) appends options in click order — adding D before B stores `[A, D, B]`, and that order is what students see.
**A-57.** `parseBody` (`question-render.ts:39`) treats every `$` as a math delimiter, unlike the ingest validator which respects `\$` (`ingest.ts:92`). An escaped dollar renders as broken math.
**A-58.** `applyJeePresetMarks` is labelled "Apply JEE Defaults (+4 / -1 / 0)" but sets integer questions to `marksWrong: 0` (`TestBuilderClient.tsx:189`).
**A-59.** The builder says *"Drag or use arrows to change position order"* (`TestBuilderClient.tsx:467`) — **there is no drag-and-drop.** Only the arrow buttons exist.
**A-60.** Test-runner instructions hardcode "+4.00 / -1.00 / 0.00" (`TestInstructionClient.tsx:152-154`) even though marks are configurable per question.
**A-61.** Fixed viewport-offset heights — `h-[calc(100vh-4rem)]` (runner), `h-[calc(100vh-6rem)]` (editor), `h-[calc(100vh-4.5rem)]` (verify studio) — hardcode three different guesses at the AppShell header height, and `100vh` (not `100dvh`) is wrong on mobile browsers with dynamic chrome.
**A-62.** No unsaved-changes guard anywhere: the test builder (question order, marks) and the question editor both lose work on navigation. The editor at least shows an "Unsaved changes" chip.
**A-63.** Native `alert()` / `confirm()` are used for all confirmations and errors across `TestBuilderClient`, `TeacherTestsClientActions`, `PapersView`, `QuestionsListView`, `QuestionEditor`, and `PaperVerifyStudio`. No toast or dialog primitive exists in `src/components/ui.tsx`.
**A-64.** No unpublish action in the UI (`PATCH /api/tests/[id]` supports it). `release-results` is irreversible and doesn't verify `resultsPolicy === 'on_release'` before stamping.
**A-65.** `PapersView.tsx:50` — `onCancel={() => papers.length > 0 && setShowForm(false)}`. With zero papers the Cancel button is visible but does nothing.

---

---

# Fix log

Applied 2026-08-30. Everything below is verified by `npm run verify`
(typecheck + token check + tests) plus a successful `next build` and a live
query against the PGlite database.

### New files

| File | Purpose |
|---|---|
| `drizzle/0001_audit_fixes.sql` | Fixes `v_test_ranks` NULL ordering, makes the revision trigger skip no-op edits, adds two attempt indexes |
| `src/lib/attempts.ts` | `gradeAndCloseAttempt()` — the single place an attempt leaves `in_progress` |
| `src/lib/db-lock.ts` | Promise-chain mutex serialising the sweep and every transaction against the single PGlite instance |
| `src/lib/datetime.ts` | `toLocalInputValue` / `fromLocalInputValue` — a genuine inverse pair for `datetime-local` |
| `src/lib/rate-limit.ts` | Fixed-window limiter for login and attempt-event spam |
| `scripts/check-tokens.mjs` | Build gate: fails if `src/` uses a palette step `globals.css` doesn't define |
| `scripts/regrade.ts` | One-off repair (`npm run regrade`) for attempts stranded ungraded by the old sweep |
| `eslint.config.mjs` | Lint config — the repo had none |
| `src/lib/api-routes.test.ts` | Walks every route handler and every `/api/…` string in `src/`; fails on a mismatch |
| `src/lib/grading.gradeable.test.ts`, `datetime.test.ts`, `password.test.ts` | Regression cover for A-19, A-13, A-14 |

### P0

| # | Fix |
|---|---|
| A-1 | `TestInstructionClient` now posts to `/api/tests/:id/attempts`; the response is also parse-guarded so a non-JSON error can't surface as a `SyntaxError` |
| A-4 | Grading extracted into `gradeAndCloseAttempt()`, called by submit, the sweep, and the past-deadline branch of the answers PATCH. Idempotent on `total_marks`, so a submit racing the sweep reads back the winner instead of a hardcoded zero. Elapsed time for an auto-submit is measured to the deadline, not to whenever the 60s sweep happened to fire |
| A-5 | `v_test_ranks` recreated with `DESC NULLS LAST` / `ASC NULLS FIRST` **and** `total_marks IS NOT NULL`. Verified live: an unscored attempt no longer appears at all |
| A-6 | `AnswerEditor` holds range bounds in local state and lifts only when both parse — tolerance ranges are enterable for the first time. Inverted ranges are flagged inline |

### P1

| # | Fix |
|---|---|
| A-7 | Answers route exports `POST` as well as `PATCH` and reads the body as text, so `sendBeacon` (POST + `text/plain`, always) works |
| A-8 | Countdown, sync and listeners read answers from `questionsRef`; auto-submit is guarded by a ref, and the interval is cleared on fire. No more once-per-second resubmission with an empty payload |
| A-10 | `PUT …/questions` refuses with 409 once attempts exist, rejects duplicate positions/ids, and blocks unverified questions entering a published test. `PATCH …/tests/:id` freezes `durationS`/`maxAttempts`/shuffle flags after attempts exist |
| A-11 | `export.csv` wrapped in `withApi` |
| A-12 | Four routes moved from `requireSession()` to `apiSession()` — 401 instead of 500 |
| A-13 | `datetime.ts` conversion pair; a test asserts five round-trips don't drift |
| A-14 | `verifyPassword` falls back to a real dummy hash, so the null path costs the same scrypt work. Test asserts the timings are within an order of magnitude |
| A-15 | Re-ingest returns a specific 409 naming the collision; `?mode=replace` deletes and re-ingests in one transaction, refusing if a question is already used in a test |
| A-16 | `attempt_no` allocated inside the transaction via `MAX(attempt_no)+1`, max-attempts re-checked in the same critical section, `23505` mapped to 409 |
| A-17 | `saveQuestions()` returns a boolean; `handlePublish` bails when it's false |
| A-18 | `QuestionUpdateSchema` validates the answer key against the options, rejects `min > max` and type/shape mismatches; the verify gate re-checks against the **stored** row |
| A-19 | `isGradeableResponse()` exported from `grading.ts` and used by the result route, so score and summary can no longer disagree. The numerical input now rejects non-numeric keystrokes |

### P2

| # | Fix |
|---|---|
| A-20 | Full 50→950 brand and accent ramps in `@theme`; `check-tokens` wired into `predev`/`prebuild`. All 58 previously-dead classes resolve |
| A-21 | Dark-mode pass on `ResultReviewClient` and `TestBuilderClient` (41 substitutions) |
| A-22 | Fixed by A-20 |
| A-23 | Reads `data.unverified` (top level), not `data.details.unverified`; the list now renders |
| A-24 | `syncWithServer` has a stable identity, so the 15s heartbeat and listener effects mount once |
| A-32 | `/api/questions` validates every query param with Zod → 422, not 500 |
| A-33 | `nextPaperCode` asks Postgres for the max suffix; insert retries once on collision |
| A-34 | Events route rate-limited, ignores closed attempts, caps `meta`, restricts `eventType` to a known set |
| A-35 | Revision trigger snapshots only when content actually changed (verified live) |
| A-36 | `withDbLock` around the sweep and all five transactions |
| A-37 | Ownership checked before the redirect |
| A-38 | `visitCount` increments in `goToQuestion` |
| A-39 | Paper PDF route is teacher-only |
| A-40 | Credentials block gated on `NODE_ENV !== 'production'` |
| A-41 | Login rate-limited per username and per client; success clears the window |
| A-42 | `secure` cookie via `NODE_ENV` or `COOKIE_SECURE=true` |
| A-43 | CSV neutralises leading `=`/`+`/`-`/`@`, plus a UTF-8 BOM |
| A-44 | ESLint on: 0 errors, and 49 unused imports removed across 14 files |
| A-45 | `dev_out.log` untracked and ignored |
| A-46 | 21 new tests; the route-existence guard would have caught A-1 and A-2 outright |
| A-47 | Dead `/api/tests/available` deleted |
| A-48 | Question bank paginated (Previous / Next / "Showing 1–30 of N") |
| A-49 | All filters seed from the URL, so `?status=verified` works |
| A-50 | Palette grouped and filtered by subject, matching its heading |
| A-51 | Subject tabs derived from the questions present |
| A-52 | `fullscreenchange` listener keeps the icon honest |
| A-53 | Save state rendered in the header: Saved / Saving… / Not synced / Offline |
| A-54 | `isOnline` seeds from `navigator.onLine` |
| A-55 | Nested `<button>` unnested in both `UploadQuestionsView` and `IngestView` |
| A-56 | Options always stored A→B→C→D |
| A-57 | `parseBody` honours `\$`, matching the ingest validator |
| A-58 | Button reads "Apply JEE defaults (MCQ +4/−1/0 · Numerical +4/0/0)" |
| A-59 | Copy corrected — no drag-and-drop is claimed |
| A-60 | Instructions render the real per-question marking scheme from `test_questions`, plus section counts and attempt number |
| A-61 | One `--app-header-h` variable and `100dvh` replace three hardcoded guesses |
| A-62 | `beforeunload` guards in the test builder, question editor and exam runner |
| A-64 | Unpublish in both the builder and the tests list; `release-results` is idempotent, checks the policy, and supports `?revoke=true` |
| A-65 | Cancel only renders when there is a list to return to |

### Deliberately not done

| # | Why |
|---|---|
| **A-2, A-3, A-9, A-25–A-31** | Analytics — left per your instruction. A-2 is recorded in `KNOWN_BROKEN` in `api-routes.test.ts`, with a companion test that fails once it's fixed so the exemption can't rot |
| **A-63** (native `alert`/`confirm`) | Replaced where it mattered — the exam-runner submit error, the publish/unverified list, the question editor and the question bank are all inline now. The remaining `confirm()` calls are genuine destructive confirmations; swapping those out is the `Dialog`/`Toast` primitive in [ENHANCEMENTS.md §3.4](ENHANCEMENTS.md), not a bug fix |
| **A-31** median | Part of the WIP analytics block |

### Verifying

```bash
npm run verify      # typecheck + token check + 54 tests
npm run lint        # 0 errors
npm run build       # succeeds
npm run regrade     # one-off: score attempts stranded by the old sweep
```
