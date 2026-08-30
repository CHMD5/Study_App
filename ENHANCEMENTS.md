# Enhancements & Roadmap — SRSMA JEE Mains Test Platform

**Companion to** [AUDIT-AND-BUG-REPORT.md](AUDIT-AND-BUG-REPORT.md) · commit `e262dde`

This file is about **what to build and how it should feel** — architecture, flow, layout, typography, copy, and new capability. Defects are in the audit; where an enhancement supersedes a bug fix, the bug ID is cross-referenced.

Each item carries an effort estimate: **S** (< half a day) · **M** (1–3 days) · **L** (a week+).

> Analytics is your acknowledged WIP area. Its items are grouped under **§6** so you can work them as one block rather than sifting them out of the rest.

---

## Table of contents

1. [Highest-leverage changes](#1-highest-leverage-changes)
2. [Architecture](#2-architecture)
3. [Design system, layout & typography](#3-design-system-layout--typography)
4. [Student flow](#4-student-flow)
5. [Teacher flow](#5-teacher-flow)
6. [Analytics](#6-analytics-wip)
7. [Copy & microcopy](#7-copy--microcopy)
8. [Accessibility](#8-accessibility)
9. [New features](#9-new-features)
10. [Testing, tooling & operations](#10-testing-tooling--operations)
11. [Suggested sequencing](#11-suggested-sequencing)

---

## 1. Highest-leverage changes

If you only do five things:

| # | Change | Why it's top of the list | Effort |
|---|---|---|---|
| 1 | **A student & batch management screen** | The single largest missing capability. There is no way to create a student, set a batch, deactivate an account, or reset a password — the only students that exist are the ones `scripts/seed.ts` inserted. Every analytics view already groups by `batch`, but nothing can ever set one. | **M** |
| 2 | **Complete the design tokens, then one dark-mode pass** | Fixes ~58 dead classes across 21 files ([A-20](AUDIT-AND-BUG-REPORT.md)) plus three light-only pages ([A-21](AUDIT-AND-BUG-REPORT.md)). Highest visible-quality-per-hour ratio in the codebase. | **S+M** |
| 3 | **A shared toast + dialog primitive** | Six components call native `alert()`/`confirm()`. One `<Toast>` and one `<ConfirmDialog>` in `ui.tsx` replaces all of them and makes every destructive action feel deliberate. | **M** |
| 4 | **A typed API client layer** | Three of the four P0 bugs are client/server contract drift that TypeScript could not see. A `src/lib/api.ts` with typed wrappers makes those compile errors. | **M** |
| 5 | **Grade-on-close as a single shared function** | Removes the class of bug where an attempt closes without a score ([A-4](AUDIT-AND-BUG-REPORT.md)), and gives you one place to add re-grading later. | **M** |

---

## 2. Architecture

### 2.1 A typed API client — kill contract drift at compile time  **M**

Today every call is a bare `fetch` with a hand-written URL and an `any`-shaped response. That's exactly how `/api/tests/{id}/start`, `/api/analytics/student`, and `data.leaderboard` all shipped.

```ts
// src/lib/api/routes.ts — single source of truth for paths
export const routes = {
  attempts:      { start: (testId: string) => `/api/tests/${testId}/attempts` as const,
                   answers: (id: string)   => `/api/attempts/${id}/answers` as const, /* … */ },
  analytics:     { studentMe: () => '/api/analytics/student/me' as const, /* … */ },
} as const;

// src/lib/api/contracts.ts — response shapes shared by route + client
export type CohortAnalyticsResponse = { metrics: …; weakChapters: …; studentRankings: … };
```

Have each route handler declare `satisfies CohortAnalyticsResponse` on its return, and each client import the same type. Both drift bugs become red squiggles.

### 2.2 Extract `gradeAndCloseAttempt()`  **M**

Grading currently lives inline in `submit/route.ts`. Three other code paths close an attempt and none of them grade. Extract:

```ts
// src/lib/attempts.ts
export async function gradeAndCloseAttempt(
  db: Db, attemptId: string, status: 'submitted' | 'auto_submitted',
): Promise<GradedAttemptResult> { /* the transaction from submit/route.ts */ }
```

Call it from `submit/route.ts`, `sweep.ts`, and the deadline branch in `answers/route.ts`. Make it idempotent on `total_marks IS NOT NULL`. Add a one-off back-fill script for attempts already stuck ungraded.

### 2.3 Serialise every PGlite query  **M**

`db/client.ts` already documents the failure mode in detail — two concurrent queries against the single WASM instance can hard-crash it — and the recommended fix (`pg.runExclusive`) is still a TODO. Wrap the exported `db` in a small mutex so no caller can get this wrong:

```ts
const queue = new AsyncQueue();
export const db = new Proxy(rawDb, { /* funnel every method through queue.run() */ });
```

Worth doing before more than one person uses the app at a time.

### 2.4 Server Actions instead of hand-rolled `fetch` for mutations  **L**

Next 15 Server Actions would remove the URL-string layer entirely for teacher mutations (publish, release, save settings, save questions), give free progressive enhancement, and make `router.refresh()` unnecessary. Consider for the teacher surface; keep REST for the exam runner, which genuinely needs offline retry semantics.

### 2.5 Delete or adopt `/api/tests/available`  **S**

It's dead code duplicating `student/page.tsx`, and the two have already diverged on how in-progress attempts count against `maxAttempts` ([A-47](AUDIT-AND-BUG-REPORT.md)). Pick one home for the "what can this student take" rule.

### 2.6 A domain layer for test lifecycle rules  **M**

`canStart`, `isOpen`, `attemptsRemaining`, `resultsAvailable`, and the publish gate are re-derived in five places (`student/page.tsx`, `tests/available`, `attempts/route.ts`, `TeacherTestsClientActions`, `TestBuilderClient`) with subtly different logic. One `src/lib/test-policy.ts` exporting pure predicates, unit-tested, would collapse that.

### 2.7 Structured logging  **S**

`console.log`/`console.error` scattered across the sweep, migrator, and `withApi`. A tiny `log.info/warn/error(event, fields)` helper writing NDJSON to `data/logs/` gives you a post-exam audit trail — valuable when a student disputes a score.

---

## 3. Design system, layout & typography

### 3.1 Complete the colour ramps  **S** — *do this first*

`globals.css` defines 8 brand steps and 4 accent steps; the app references 14 brand steps and 10 accent steps. Fill the gaps:

```css
@theme {
  /* brand — indigo/navy, anchored on the existing 700 = #1e3a8a */
  --color-brand-50:  #eef2ff;  --color-brand-100: #e0e7ff;  --color-brand-200: #c7d2fe;
  --color-brand-300: #a5b4fc;  /* NEW */
  --color-brand-400: #7c93f0;  /* NEW — the dark-mode text colour */
  --color-brand-500: #3b5bdb;  --color-brand-600: #2a44b8;  --color-brand-700: #1e3a8a;
  --color-brand-800: #172e6e;  --color-brand-900: #101f4a;
  --color-brand-950: #0a1430;  /* NEW — the dark-mode surface */

  /* accent — amber, anchored on the existing 500 = #f59e0b */
  --color-accent-50:  #fffbeb;  /* NEW */
  --color-accent-100: #fef3c7;
  --color-accent-200: #fde68a;  /* NEW */
  --color-accent-300: #fcd34d;  /* NEW */
  --color-accent-400: #fbbf24;  --color-accent-500: #f59e0b;  --color-accent-600: #d97706;
  --color-accent-700: #b45309;  /* NEW */
  --color-accent-800: #92400e;  /* NEW */
  --color-accent-900: #78350f;  /* NEW */
  --color-accent-950: #451a03;  /* NEW */
}
```

Then add a CI guard: grep the source for `(brand|accent)-\d+` and fail on any step not present in `globals.css`. Cheap, and this class of bug never recurs.

### 3.2 Semantic tokens on top of the ramps  **M**

Raw palette steps are scattered through JSX with `dark:` twins everywhere. Add a semantic layer so a component names its *intent*, and dark mode becomes a token swap rather than a per-element edit:

```css
@theme {
  --color-surface:        var(--color-white);
  --color-surface-muted:  var(--color-slate-50);
  --color-ink:            var(--color-slate-900);
  --color-ink-muted:      var(--color-slate-500);
  --color-hairline:       var(--color-slate-200);
}
html.dark {
  --color-surface:        #0f172a;
  --color-surface-muted:  #090d16;
  --color-ink:            var(--color-slate-100);
  --color-ink-muted:      var(--color-slate-400);
  --color-hairline:       var(--color-slate-800);
}
```

`bg-surface text-ink border-hairline` replaces `bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800` — the pattern currently repeated hundreds of times.

### 3.3 Typography  **S–M**

- **Ship a real font.** `--font-sans: 'Segoe UI', Inter, system-ui, …` names Inter but never loads it, so every non-Windows machine falls through to `system-ui`. Either load Inter via `next/font/google` (self-hosted, zero layout shift, works offline once cached) or drop it from the stack and own the system-font look deliberately.
- **A tabular-numeral class.** The exam timer, marks, ranks, and percentiles all shift width as digits change. Add `.tnum { font-variant-numeric: tabular-nums; }` and apply it to the countdown, every score, and every table numeric column.
- **The scale bottoms out too low.** `text-[9px]`, `text-[10px]`, and `text-[11px]` appear throughout the teacher surface (marks inputs, palette legends, table meta). Below 11px is a legibility problem for a teacher reviewing 75 questions. Floor the scale at `text-xs` (12px) and use weight/colour for hierarchy instead.
- **Question bodies should be optically larger than chrome.** The exam is the product; it currently renders at `text-sm sm:text-base` inside a 14px page. Give `.q-render` its own scale (16px mobile / 17px desktop, `leading-relaxed`, `max-width: 70ch`) so long physics stems don't run edge-to-edge on a wide monitor.

### 3.4 A real component library in `ui.tsx`  **M**

Present: Button, Input, Textarea, Select, Label, Card, Badge, Alert, EmptyState, Spinner. Every page hand-rolls the rest. Add:

| Component | Replaces |
|---|---|
| `Dialog` / `ConfirmDialog` | Hand-built modals in `TestRunnerClient`, plus 9 `confirm()` calls |
| `Toast` + `useToast()` | 8 `alert()` calls, and the invisible `syncError` state |
| `Table` (`TableHead`/`Row`/`Cell`) | 6 hand-styled `<table>` blocks with divergent padding and dark-mode support |
| `Tabs` | 3 hand-rolled tab bars (builder, runner subjects, result filters) |
| `Skeleton` | 5 full-page spinners that cause a layout jump on load |
| `Pagination` | Nothing — the question bank needs it ([A-48](AUDIT-AND-BUG-REPORT.md)) |
| `StatTile` | The KPI cards duplicated across 4 dashboards with 4 slightly different paddings |

### 3.5 Layout  **S–M**

- Replace the three hardcoded `h-[calc(100vh-Nrem)]` offsets with a CSS variable the AppShell sets (`--app-header-h`), and use `100dvh` so mobile browser chrome doesn't crop the exam runner.
- The AppShell mobile nav is a horizontally-scrolling strip of 6 items with no scroll affordance — the last two are invisible until you swipe. Add edge fade masks, or switch to a sheet.
- `max-w-[1600px]` on the main container is very wide for text-heavy teacher pages; consider `max-w-7xl` for list/form pages and reserve the full width for the split-pane verify studio.
- The exam-runner palette is `w-80` fixed. On a 13" laptop at 1280px that's a quarter of the screen for a grid of 30px squares. Make it collapsible, and remember the state.

### 3.6 Brand assets  **S**

`BRAND.logoMark` and `BRAND.logoLockup` both point at the same 103 KB JPEG. A lockup rendered at 160×44 from a square JPEG will letterbox or distort, and a JPEG logo on a dark background shows its white matte. Produce a proper SVG pair (mark + horizontal lockup) with transparent backgrounds, and a dark-mode variant.

---

## 4. Student flow

### 4.1 Exam runner — the parts that matter most

| Enhancement | Detail | Effort |
|---|---|---|
| **Visible save state** | Surface `syncError` ([A-53](AUDIT-AND-BUG-REPORT.md)) as a persistent header chip: *Saved 3s ago* / *Saving…* / *Offline — saved on this device*. During a 3-hour exam this is the single most anxiety-reducing element you can add. | S |
| **Confirm before leaving** | `beforeunload` currently only beacons; it doesn't `preventDefault()`. One accidental <kbd>Ctrl</kbd>+<kbd>W</kbd> ends the attempt. | S |
| **Keyboard shortcuts** | Real CBT muscle memory: <kbd>1</kbd>–<kbd>4</kbd> select option, <kbd>→</kbd>/<kbd>Enter</kbd> save & next, <kbd>←</kbd> previous, <kbd>M</kbd> mark for review, <kbd>C</kbd> clear, <kbd>P</kbd> toggle palette. Show a `?` cheat-sheet overlay. | M |
| **Filtered palette** | Fix the mislabelled heading ([A-50](AUDIT-AND-BUG-REPORT.md)) by actually filtering the grid to the active subject, with section dividers when a test spans subjects. | S |
| **Dynamic subject tabs** | Derive tabs from the questions present, not a hardcoded triple ([A-51](AUDIT-AND-BUG-REPORT.md)). | S |
| **Numeric keypad for integer questions** | An on-screen 0–9 · `.` · `−` · backspace pad, as in the real JEE CBT. Also fixes the free-text input accepting `abc` ([A-19](AUDIT-AND-BUG-REPORT.md)). | M |
| **Timer milestones** | Non-modal toasts at 30 / 15 / 5 / 1 minutes; the current cue is a colour change at 5 minutes that's easy to miss when you're heads-down on a question. | S |
| **Question zoom** | A/A+/A++ text-size control for long stems on small screens. | S |
| **Rough-work scratchpad** | A per-question notes panel (IndexedDB only, never synced) — JEE candidates work on paper; give them somewhere to park intermediate values. | M |
| **Resume banner** | On re-entering an in-progress attempt, show *"Resuming attempt started at 14:02 · 1h 47m remaining · 23 of 75 answered"* before dropping into Q1. | S |

### 4.2 Instructions screen

- **Show the actual marking scheme**, computed from `test_questions`, instead of the hardcoded +4/−1/0 ([A-60](AUDIT-AND-BUG-REPORT.md)). Break it out by question type when they differ.
- **Show a per-subject question count** and the number of attempts remaining before the student commits.
- **A 60-second readiness check** — probe `/api/attempts/.../events` once, confirm IndexedDB is writable, warn on Safari private mode (where IDB is unreliable), and confirm the browser clock is within tolerance of `serverTime`.
- The palette-legend swatches for *Marked for Review* and *Answered & Marked* are the same purple, distinguished only by a 12px dot. Add a distinct border or icon; this is the state students most often misread.

### 4.3 Results & review

- **Print / PDF scorecard.** `globals.css` already ships a `@media print { .no-print }` rule that nothing uses. A one-page printable scorecard is a high-demand feature for parents.
- **Time-vs-accuracy scatter.** You already store `time_spent_ms` and `expected_time_s` per question and compute `isOvertime`. Plot it: fast+wrong (guessing), slow+wrong (weak topic), slow+right (needs drilling). This is the most actionable view a JEE aspirant can get, and the data is already there.
- **Attempt comparison.** For `maxAttempts > 1`, a side-by-side of attempt 1 vs 2 per chapter.
- **"Unattempted but nearly correct"** — surface questions marked for review and left blank, which is where the recoverable marks live.
- **Bookmark for later revision** — a per-question flag that feeds a personal revision list.
- Reconcile the two accuracy definitions ([A-28](AUDIT-AND-BUG-REPORT.md)) and label whichever you keep (*"of attempted"* vs *"of total"*).

### 4.4 Student dashboard

- Above the fold: **next scheduled test with a countdown**, and **resume-in-progress** if one exists. Currently the welcome banner takes the whole first screen.
- The completed-attempts table shows `0 / 0` for ungraded attempts ([A-4](AUDIT-AND-BUG-REPORT.md)) with no explanation. Until that's fixed, render "Not graded" rather than a zero.
- Add a **streak / consistency indicator** — tests taken per week. Cheap to compute, disproportionately motivating.

---

## 5. Teacher flow

### 5.1 Student & batch management — the biggest gap  **M–L**

There is no `/teacher/students` route. Build:

- **Roster table** — name, username, email, batch, active, last login, tests taken, average percentile.
- **Create student** — single form, plus **CSV bulk import** (the seed script already models the shape).
- **Batch assignment** — bulk-select → assign. Every analytics query already groups by `batch` and displays `'General'` for the nulls that are the only thing the app can produce.
- **Password reset** and **deactivate** (`is_active` / `can_login` columns already exist and are honoured by `authenticate()`).
- **Assign tests to batches** — currently every published test is visible to every student. A `test_batches` join table would let you run a Physics-only mock for one cohort.

### 5.2 Test builder

| Enhancement | Detail | Effort |
|---|---|---|
| **Real drag-and-drop** | The UI already promises it ([A-59](AUDIT-AND-BUG-REPORT.md)). `@dnd-kit/sortable` on the assigned list. | M |
| **Autosave + dirty guard** | Question order and marks live only in React state until "Save Questions" ([A-62](AUDIT-AND-BUG-REPORT.md)). Debounced autosave with a "Saved" chip. | M |
| **Blueprint mode** | Declare *"25 Physics / 25 Chemistry / 25 Maths, difficulty 4–7, ≤ 2 per chapter"* and auto-populate from the verified bank. This is how mock papers are actually assembled, and it turns a 75-click job into one. | L |
| **Live blueprint meter** | As questions are added: per-subject counts, difficulty histogram, chapter coverage, total marks, estimated duration from `expected_time_s`. The pieces exist; they're just five isolated count tiles today. | M |
| **Paginated / virtualised picker** | `teacher/tests/[id]/page.tsx` ships the **entire question bank with full bodies** into the client payload. At a few thousand questions this will blow past `largePageDataBytes` and make the page unusable. Server-side search + pagination. | M |
| **Duplicate a test** | "Clone as draft" — the obvious way to build Mock #2 from Mock #1. | S |
| **Preview as student** | Render the runner read-only against the current draft before publishing. | M |
| **Guard edits to live tests** | Warn (or refuse) when editing a published test with attempts ([A-10](AUDIT-AND-BUG-REPORT.md)). | S |
| **Unpublish** | The API supports it; nothing in the UI exposes it ([A-64](AUDIT-AND-BUG-REPORT.md)). | S |

### 5.3 Question bank

- **Pagination** ([A-48](AUDIT-AND-BUG-REPORT.md)) — currently a hard 30-question ceiling on what's reachable.
- **Bulk actions** — multi-select → verify, archive, set chapter/topic, set difficulty. Verifying 75 questions one page-load at a time is the slowest part of the pipeline today.
- **Chapter/topic as a managed taxonomy.** They're free-text now, so `"Rotational Motion"`, `"rotational motion"`, and `"Rotation"` become three distinct rows in every weak-chapter report. Add a `chapters` table (or at minimum an autocomplete over `SELECT DISTINCT`) — this silently degrades all analytics.
- **Near-duplicate detection** on ingest. Standalone ingest can't collide by design ([A-15](AUDIT-AND-BUG-REPORT.md)), so re-pasting always duplicates. A trigram similarity check on `body` at stage time would catch it.
- **Question preview in the list** — render KaTeX inline instead of `stripLatex()`, which shows raw `\frac{1}{2}`.
- **Revision history UI.** `question_revisions` is populated by a trigger on every update and has **no reader anywhere**. A diff viewer with "restore this revision" is nearly free given the data already exists.
- **Filter by "has unresolved images"** and by paper, in the main bank (the verify studio has it; the bank doesn't).

### 5.4 Ingest & verification

- **Show extraction provenance.** `papers.extraction_meta` records `promptVersion`, `extractedAt`, and `detectedTitle` — nothing displays it.
- **Ingest diff preview.** Before writing, show *"68 new · 7 already exist · 3 changed"* rather than an all-or-nothing count.
- **Progress + cancel on upload.** A 60 MB PDF currently gets an indeterminate spinner.
- **Bulk verify from the studio** — "verify all questions that pass the gate", with a report of the ones that don't.
- **Keyboard-driven crop loop.** The studio already has "jump to next missing image"; bind it to a key and auto-arm, so a 40-figure paper is a rhythm rather than a mouse hunt.

### 5.5 Teacher dashboard

Currently three count tiles plus three static link cards. Make it a work queue:

- **Needs attention:** drafts awaiting verification · questions with unresolved images · published tests with unreleased results · attempts stuck in progress past deadline.
- **Recent activity:** last 10 submissions with student, test, and score.
- **Upcoming windows:** tests opening or closing in the next 7 days.

---

## 6. Analytics  *(WIP)*

Where the audit lists a defect, the enhancement here is the *shape* the feature should take once it's working.

### 6.1 Correctness prerequisites

These gate everything else in this section:

- Fix the endpoint path ([A-2](AUDIT-AND-BUG-REPORT.md)) and the cohort contract ([A-3](AUDIT-AND-BUG-REPORT.md)).
- Fix `v_test_ranks` NULL ordering ([A-5](AUDIT-AND-BUG-REPORT.md)) — until then every leaderboard is wrong.
- Gate student analytics on `results_policy` ([A-9](AUDIT-AND-BUG-REPORT.md)).
- Stop fabricating rank 1 / 100th percentile on missing rows ([A-27](AUDIT-AND-BUG-REPORT.md)) — render "—" instead.

### 6.2 Better metrics  **M**

| Change | Why |
|---|---|
| **Per-test question stats** | `v_question_stats` aggregates a question across every test it appears in ([A-25](AUDIT-AND-BUG-REPORT.md)). Add `test_id` to the view's grouping so "calibration for this test" means what it says. |
| **Derived score buckets** | Replace the hardcoded 0–200+ bars with `maxMarks`-relative deciles ([A-26](AUDIT-AND-BUG-REPORT.md)). |
| **Best-attempt vs all-attempts toggle** | Leaderboards currently list one row per attempt ([A-29](AUDIT-AND-BUG-REPORT.md)). Default to best-per-student. |
| **Proper median, and add p25/p75** | Fix the even-*n* median ([A-31](AUDIT-AND-BUG-REPORT.md)) and show the interquartile range — far more informative than min/max for a cohort. |
| **Discrimination index** | For each question, compare accuracy in the top vs bottom score tertile. This is the number that tells a teacher a question is *bad* rather than merely *hard* — and you already have every input. |
| **Minimum-sample thresholds** | Suppress or grey out any percentage computed from fewer than ~5 responses; the cohort view's `HAVING count >= 2` is too permissive to be meaningful. |

### 6.3 New views  **M–L**

- **Batch comparison** — mean, median, and distribution per batch on one test. The `batch` column exists purely for this and nothing uses it comparatively.
- **Student progression** — score and percentile over time, with a trend line. `StudentAnalyticsClient` already imports Recharts.
- **Chapter heatmap** — students × chapters, coloured by accuracy. The fastest way to spot *"the whole class is weak on Thermodynamics"* versus *"three students are"*.
- **Time-allocation report** — per test, where the cohort actually spent its minutes vs `expected_time_s`. Feeds directly into re-calibrating the paper.
- **Question-level drill-down** — click a row in the calibration table → per-option response distribution (which distractor is pulling students). You store the chosen key; this is a `GROUP BY response->>'key'` away.

### 6.4 Export & reporting  **M**

- Fix CSV formula injection ([A-43](AUDIT-AND-BUG-REPORT.md)) and wrap the route in `withApi` ([A-11](AUDIT-AND-BUG-REPORT.md)) before adding anything.
- **Per-student PDF report card**, batch-generated for a whole cohort.
- **Export the question-calibration table**, not just the leaderboard.
- **Scheduled digest** — a weekly Markdown summary written to `data/reports/`.

### 6.5 Chart presentation  **S**

- Recharts colours are hardcoded (`#1E3A8A` bars, `#e2e8f0` grid, `#ffffff` tooltip) and unreadable in dark mode. Read them from CSS custom properties via `getComputedStyle`, or pass a theme object from `useTheme()`.
- Every chart needs an explicit empty state — right now a test with no attempts renders an axis-only frame.
- Add `aria-label` and a screen-reader data table behind each chart.

---

## 7. Copy & microcopy

Concrete text changes, file by file.

| Location | Current | Suggested | Why |
|---|---|---|---|
| `TestBuilderClient.tsx:467` | "Drag or use arrows to change position order." | "Use the arrows to reorder questions." | Promises a feature that doesn't exist ([A-59](AUDIT-AND-BUG-REPORT.md)) |
| `TestBuilderClient.tsx:472` | "Apply JEE Defaults (+4 / −1 / 0)" | "Apply JEE defaults (MCQ +4/−1/0 · Numerical +4/0/0)" | The button doesn't do what it says ([A-58](AUDIT-AND-BUG-REPORT.md)) |
| `TestInstructionClient.tsx:152-154` | Hardcoded "+4.00 / −1.00 / 0.00" | Render from the test's actual `test_questions` marks | Wrong for any custom scheme ([A-60](AUDIT-AND-BUG-REPORT.md)) |
| `TestInstructionClient.tsx:104` | "the question palette displayed on the right of the screen" | "…on the right (tap **Palette** on mobile)" | False on phones |
| `TestInstructionClient.tsx:170-174` | "Offline Disconnect Protection … zero lost answers" | "Your answers are saved on this device if you lose connection, and re-synced automatically. Keep this tab open." | Overpromises, and is currently untrue ([A-7](AUDIT-AND-BUG-REPORT.md), [A-8](AUDIT-AND-BUG-REPORT.md)) |
| `Katex.tsx:46-49` | Doc comment: "plain text/markdown-lite passed through as-is (line breaks, **bold**, tables)" | Correct the comment — no Markdown is rendered, only text + math + images | Misleads the next contributor into writing `**bold**` in a question body |
| `TestRunnerClient.tsx:886` | "{SUBJECT} Questions:" over an unfiltered grid | "All questions" until the grid is actually filtered | Mislabels what's shown ([A-50](AUDIT-AND-BUG-REPORT.md)) |
| `TestRunnerClient.tsx:773` | "Enter exact integer or decimal value (e.g. 42 or 3.14)." | "Numbers only. Use a decimal point, not a comma." | The field accepts letters today |
| `TestRunnerClient.tsx:510` | `alert(err.message)` on submit failure | An inline error in the modal with a **Retry** button | An alert during submission is alarming and offers no path forward |
| `login/page.tsx:41-49` | Credentials block, always rendered | Gate on `NODE_ENV !== 'production'` | Publishes the password ([A-40](AUDIT-AND-BUG-REPORT.md)) |
| `PROGRESS.md:26,37` | "Stage 10 ✅ Complete Full MVP", "zero lost answers" | Reflect the actual state | Three P0 features don't run end-to-end |
| Errors generally | "Failed to load test analytics" (discards the server's message) | Surface `body.message`, and add a **Retry** action | Every fetch failure is currently a dead end |
| `EmptyState` usages | Mostly good | Give each one a primary action — the question-bank empty state links to upload, but the tests and papers ones don't | Empty states are the best place to teach the workflow |

**A style note:** the app mixes registers — clipped ("Save Questions", "Ingest questions") against effusive ("Aggregating cohort performance metrics…", "Computing your performance trends…", "Preparing test environment…"). Pick one. For an exam tool, calm and plain wins: "Loading…" is better than "Aggregating cohort performance metrics…", which sounds busy without being informative.

---

## 8. Accessibility

Currently unaddressed almost everywhere. In rough priority order:

| Item | Detail | Effort |
|---|---|---|
| **MCQ options must be radios** | They're `<button>`s (`TestRunnerClient.tsx:727`). A screen-reader user gets no "option 2 of 4, selected" context. Use a `role="radiogroup"` with real `<input type="radio">` visually restyled. | M |
| **Palette buttons need labels** | `aria-label="Question 12, answered"` plus `aria-current` on the active one. Colour alone carries all five states today — a red/green-blind student cannot distinguish answered from not-answered. Add a shape or glyph. | S |
| **Timer must announce** | `role="timer" aria-live="polite"` with polite announcements at milestones only (not every second). | S |
| **Focus management in modals** | The submit-confirmation and theme menu don't trap focus, don't close on <kbd>Esc</kbd>, and don't restore focus on close. | M |
| **Nested buttons** | `UploadQuestionsView.tsx:131` — invalid and keyboard-inaccessible ([A-55](AUDIT-AND-BUG-REPORT.md)). | S |
| **Live regions for save state** | `aria-live="polite"` on the sync indicator once it exists. | S |
| **Skip-to-content link** | AppShell renders 6+ nav links before `<main>` on every page. | S |
| **Colour contrast audit** | `text-slate-400` on `bg-white` is ~2.8:1 — below AA. It appears in table meta, hints, and timestamps throughout. | M |
| **Reduced motion** | `animate-pulse` on the sub-5-minute timer and `animate-spin` spinners should respect `prefers-reduced-motion`. | S |

---

## 9. New features

Ordered by value-to-effort for a JEE coaching context.

| # | Feature | Sketch | Effort |
|---|---|---|---|
| 1 | **Practice mode** | Untimed, per-question feedback, no leaderboard. Reuse the runner with `mode: 'practice'`. The highest-frequency use of a question bank isn't mock tests — it's daily practice. | M |
| 2 | **Sectional / subject-wise tests** | 25-question Physics-only papers. Requires only a subject filter at test creation. | S |
| 3 | **Adaptive revision list** | Auto-generate a practice set from a student's weakest chapters. The chapter-accuracy data already exists in `/api/analytics/student/me`. | M |
| 4 | **Question bookmarking** | Students flag questions into a personal revision list; teachers flag questions for re-review. | S |
| 5 | **Solutions with images and steps** | `solution` is a plain text column today. Support numbered steps, and per-solution images (the `question_images` table already handles arbitrary placeholders). | M |
| 6 | **Grace period / time extension** | Grant an individual student extra time on an in-progress attempt (`deadline_at` is already per-attempt). Essential for accommodations and for handling a genuine technical failure mid-exam. | S |
| 7 | **Re-grade after an answer-key correction** | When a verified question's key changes, offer to re-grade every affected attempt with an audit trail. Currently a key error is permanent. | M |
| 8 | **Proctoring signals** | `attempt_events` already logs `tab_hidden`/`tab_visible` and nothing reads them. Surface a per-attempt integrity timeline; optionally add copy/paste and full-screen-exit events, with a configurable "N tab switches → flag for review". | M |
| 9 | **Notifications** | In-app (and optionally email) on test published, results released, and a window opening in 24h. | M |
| 10 | **Parent/guardian view** | Read-only scorecard access via a share link. Frequently requested in coaching contexts. | M |
| 11 | **Question paper PDF export** | Generate a printable paper from a test — `pdf-lib` is already a dependency. | M |
| 12 | **Import/export a question bank** | JSON round-trip, so banks can move between installs or be version-controlled. | S |
| 13 | **Multi-correct (MSQ) question type** | JEE Advanced uses it; the schema's `qtype_enum` and grading both assume single-answer. Plan the migration before the bank grows. | L |
| 14 | **Assertion-Reason & Match-the-Column types** | Common in JEE Main. Renderable today as MCQ, but they'd benefit from dedicated layouts. | M |

---

## 10. Testing, tooling & operations

### 10.1 Testing  **M** — highest ROI in this section

Coverage today is 33 tests across five pure-function modules. **No test touches a route handler, the grading pipeline end-to-end, auth, the sweep, or any component.** Not one of the four P0 bugs was catchable by the existing suite.

| Layer | What to add | Catches |
|---|---|---|
| **Route contract tests** | Boot PGlite in-memory, seed a fixture, call each handler directly, assert the JSON shape | A-3, A-9, A-11, A-12, A-32 |
| **A route-existence test** | Walk `src/app/api/**/route.ts`, walk every `/api/...` string literal in `src/`, assert the sets match | **A-1 and A-2 exactly** — and it's ~30 lines |
| **Attempt-lifecycle integration test** | start → answer → expire → sweep → assert graded and scored | **A-4** |
| **View tests** | Assert `v_test_ranks` orders NULLs last and excludes ungraded attempts | **A-5** |
| **Component tests** (Testing Library) | The answer editors, the palette state machine, the timer | **A-6, A-8** |
| **One Playwright smoke path** | login → publish → attempt → submit → view result | Everything above, as a backstop |

### 10.2 Tooling  **S**

- **Turn ESLint on.** `next.config.mjs` sets `eslint.ignoreDuringBuilds: true` and there's no config file. Add `eslint-config-next` plus `react-hooks/exhaustive-deps` — that rule alone flags **A-8** and **A-24**.
- **Prettier + an editorconfig.** Formatting drifts noticeably between files.
- **A pre-commit hook** running `tsc --noEmit`, `eslint`, and `vitest run`.
- **The design-token CI check** from §3.1.
- Add `dev_out.log` to `.gitignore` ([A-45](AUDIT-AND-BUG-REPORT.md)).

### 10.3 Operations  **S–M**

- **Automatic backups.** `scripts/backup.ts` exists but only runs manually. Add a daily scheduled backup with N-day retention.
- **Backup before every migration**, automatically.
- **A `data/` health check** at boot — free disk, pgdata lock state, orphaned files under `papers/`/`images/` with no DB row (`papers/[id]` DELETE cleans up disk *after* the transaction, so a crash in between orphans files permanently).
- **An admin diagnostics page** — DB size, table row counts, applied migrations, orphaned-file count, sweep last-run time.
- **A `SECURITY.md` deployment checklist** — remove seed accounts, set `SESSION_SECRET`, enable the `secure` cookie flag, apply `9999_rls.sql`. The RLS file's header comment is excellent; that discipline deserves a checklist beside it.

---

## 11. Suggested sequencing

**Phase 1 — make it work** *(a few days)*
Fix P0s A-1 → A-6. Add the route-existence test (§10.1) and turn ESLint on (§10.2). At the end of this phase the app is end-to-end functional for the first time.

**Phase 2 — make it correct** *(1 week)*
P1s: answer-loss in the runner (A-7, A-8, A-19), the security cluster (A-9, A-39, A-40, A-41, A-14), and the teacher write-path guards (A-10, A-15, A-16, A-18). Add the attempt-lifecycle integration test.

**Phase 3 — make it look finished** *(1 week)*
Complete the design tokens (§3.1) and semantic layer (§3.2) — this alone resolves most of the visual complaints. Dark-mode pass on the three light-only pages. Ship Toast + Dialog + Table + Pagination (§3.4). Typography pass (§3.3).

**Phase 4 — close the capability gaps** *(2 weeks)*
Student & batch management (§5.1). Question-bank pagination and bulk actions (§5.3). Test-builder autosave and drag-and-drop (§5.2). Copy pass (§7).

**Phase 5 — analytics** *(2 weeks, your WIP block)*
§6 end to end: correctness prerequisites, then better metrics, then the new views, then export.

**Phase 6 — grow the product** *(ongoing)*
§9, starting with practice mode and sectional tests — they reuse everything already built and are what students will actually open on a Tuesday evening.
