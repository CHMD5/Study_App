# Progress Log — Vidya Test Prep (Local Build)

Status snapshot of the local-first JEE Test Platform build. See
[JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md) for the production design
and [JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md)
for how the local edition maps to it.

---

## What's done

### Build stages 0–10 (Complete Full MVP)

| Stage | Status | Description |
|---|---|---|
| 0 — Scaffold, branding, repo layout | ✅ | Next.js 15, TS, Tailwind, local branding tokens |
| 1 — PGlite + Drizzle schema, local auth (scrypt + signed cookie), login | ✅ | Local auth cookies, `requireTeacher`/`requireStudent`, HMR-safe PGlite singleton |
| 2 — Paper upload, SHA-256 dedupe, PDF streaming, local file storage | ✅ | Uploading PDFs, SHA-256 dedupe, `pdf-lib` page counting, streaming |
| 3 — PDF.js viewer + crop tool | ✅ | Scale 2.0 canvas, drag-crop, client-side WebP conversion |
| 4 — In-app extraction prompt page + paste-JSON ingest + Zod validation | ✅ | Monospace prompt with one-click copy, Zod validation |
| 5 — Question editor, KaTeX/mhchem preview, verify gate, concurrency guard | ✅ | Live preview, optimistic locking, `question_revisions` trigger |
| 6 — Test builder + publish gate | ✅ | Interactive question picker, custom marking schemes (+4/-1/0 presets), shuffle flags, publish gate |
| 7 — CBT Test runner + offline disconnect resilience | ✅ | Server-authoritative timer, 5-state palette machine, IndexedDB mirror, autosave, anti-cheat event logs |
| 8 — Server-side grading + solutions review screen | ✅ | Pure grading library, numeric integer parsing, zero answer-key leakage DTO layer, solution review with overtime badges |
| 9 — Analytics dashboards + CSV export | ✅ | Student performance progression curves, teacher test distribution histogram, leaderboard, question calibration table, CSV export |
| 10 — Polish, responsive pass & security tests | ✅ | Mobile bottom sheet palette, Vitest suite (33 passing tests), zero TS errors |

---

## Key Technical Achievements & Architecture

1. **Answer-Key Leak Defense**:
   - `src/lib/dto.ts` is the single choke point shaping question payloads for students, projecting only safe student fields.
   - `src/lib/dto.leak.test.ts` recursively asserts that no key or value for `answer`, `solution`, `difficulty`, or `extractionNotes` can ever reach the student client bundle.
2. **Offline Resilience & Disconnect Protection**:
   - Student test state is mirrored to `idb-keyval` (IndexedDB) on every response change.
   - Debounced autosave (300ms) + 15s periodic heartbeat + `beforeunload` `navigator.sendBeacon` ensure zero lost answers.
   - Disconnect reconciliation allows completing tests even during full network drops.
3. **Pure Server-Side Grading Engine**:
   - `src/lib/grading.ts` cleanly scores MCQ options (case-insensitive key matching), numerical / integer values (parsing `"42.0" === 42`), and numerical tolerance ranges `{min, max}`.
   - One-transaction idempotent submit endpoint at `POST /api/attempts/:id/submit`.
4. **Interactive Analytics & Reporting**:
   - Direct integration with database views `v_question_stats` and `v_test_ranks`.
   - Recharts visual dashboards for student score trends and teacher score distribution histograms.
   - Instant CSV export endpoint for test leaderboards.
