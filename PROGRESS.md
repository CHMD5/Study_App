# Progress Log — Vidya Test Prep (Local Build)

Status snapshot of the local-first JEE Test Platform build. See
[JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md) for the production design
and [JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md)
for how the local edition maps to it.

---

## What's done

### Build stages 0–5 (full)

| Stage | Status |
|---|---|
| 0 — Scaffold, branding, repo layout | ✅ |
| 1 — PGlite + Drizzle schema, local auth (scrypt + signed cookie), login | ✅ |
| 2 — Paper upload, SHA-256 dedupe, PDF streaming, local file storage | ✅ |
| 3 — PDF.js viewer + crop tool | ✅ |
| 4 — In-app extraction prompt page + paste-JSON ingest + Zod validation | ✅ |
| 5 — Question editor, KaTeX/mhchem preview, verify gate, concurrency guard | ✅ |

Stages 6–10 (test builder, test runner, grading, analytics, responsive/backup
pass) are **not built yet** — the schema for tests/attempts already exists
(see below), but there's no UI or API for any of it.

### Plan §6–§9 (schema deltas / extraction prompt / local substitutions / seed data)

- **Schema** — full LLD §4 schema ported to PGlite, plus the local deltas
  (`profiles.username`/`password_hash`, `papers.file_path`/`sha256`/
  `extraction_meta`, `question_revisions` + trigger). `v_question_stats` and
  `v_test_ranks` views created verbatim and verified against real seeded data.
- **Extraction prompt** — `/teacher/extraction-prompt` reference page plus a
  collapsed copy-button version inline on the ingest page.
- **Local substitutions** — PDF upload/streaming, authenticated image serving,
  boot-time sweep (see bug #2 below), and now `backup`/`restore`/`reset`
  scripts (were missing until this session).
- **Seed data** — `Teacher`/`Student` logins, 12 data-only demo students, a
  demo paper with 7 questions, **and now 2 demo tests with ~25 graded demo
  attempts** so the analytics views have real data to prove out ahead of the
  stage 6–9 UI being built.

### Delete features (this session's main ask)

- **Individual question delete** — from the question editor and from the
  question bank list. Removes the question's image folder from disk; refuses
  with a clear `question_in_use` error if the question is ever referenced by
  a test (`test_questions` is `ON DELETE RESTRICT` by design).
- **Cascade paper delete** — a plain delete refuses and reports how many
  questions would go with it; confirming again retries with `?cascade=true`,
  which deletes the paper and all its questions (DB rows, image files, and the
  PDF itself) atomically in one transaction.

### Two real bugs found and fixed (not just worked around)

1. **Scripts hung forever after finishing.** `npm run seed` (and any one-off
   script that opened the database) never exited — a sweep `setInterval` in
   `src/db/client.ts` was never cleared. Fixed with `.unref()` on the timer
   plus explicit cleanup in `closeDb()`. Confirmed: `seed` now exits in ~7s.
2. **A crash, then a deadlock, in the boot-time sweep.** The very first sweep
   call in `client.ts` was fire-and-forget, which could race the next query
   issued against PGlite's single WASM instance and crash it
   (`RuntimeError: null function or function signature mismatch`). This first
   looked like `restore` corrupting the database — traced with controlled A/B
   tests to a concurrency bug in the boot sequence, unrelated to restore. The
   first fix attempt (just `await` the sweep) introduced a second bug — a
   self-referential promise deadlock, since the sweep's default path re-enters
   the very `getDb()` promise still being constructed. Fixed by passing the
   already-constructed `db` handle directly into the boot-time sweep call.
   Verified 10/10 clean under stress, and `backup`/`restore` now round-trip
   reliably (confirmed by wiping `data/pgdata`+`papers`+`images` and restoring
   from a backup, then re-running the previously-crashing query 6/6 clean).

**Known residual risk, not yet fixed:** the *periodic* 60s sweep interval is
still fire-and-forget relative to whatever a request handler might be
mid-query on when it fires. Same class of risk as bug #2, much narrower
window. Flagged in `client.ts` as worth hardening (e.g. routing every query
through `pg.runExclusive`) before this app ever serves more than one local
user.

---

## Next steps

**Immediate / cheap:**
- Decide whether to harden the periodic sweep interval against the residual
  concurrency risk above before building anything that depends on attempts
  more heavily (stage 7–8 will make this a live path, not just a background
  timer).

**Stage 6 — Test builder + publish**
- Question picker (by subject/chapter/difficulty), ordering, per-question
  marks, duration, open/close window, shuffle flags, results policy.
- Publish gate: reject any non-verified question (the schema and
  `test_questions` table already exist and are seeded with demo data).

**Stage 7 — Test runner**
- Instruction screen, server-authoritative timer, full palette state machine
  (`not_seen` → `answered_flagged`, etc.), autosave (debounced + heartbeat +
  IndexedDB mirror), resume-by-reconciliation.
- **The single most important manual test in the project** (per the LLD):
  answer some questions, go offline, answer more, kill the browser, reopen,
  reconnect — all answers must still be there.

**Stage 8 — Server-side grading + review screen**
- The only route that ever reads `questions.answer`. Idempotent submit,
  numeric parsing for integer answers, `results_policy` gate, review screen
  with solutions and time-vs-expected flags.
- `dto.leak.test.ts`-style test needed here: assert no student-facing payload
  ever contains `answer`/`solution`/`difficulty`.

**Stage 9 — Analytics + CSV export**
- Student and teacher dashboards over `v_question_stats`/`v_test_ranks`
  (already verified working against the seeded demo attempts).

**Stage 10 — Polish**
- Responsive pass on real devices (the test runner on a phone is the one that
  matters most).
- `NEXT_PUBLIC_` secret audit before any future production step.
- Decide on the sweep-interval hardening above.

**Housekeeping**
- No git repository yet in this working directory — worth initializing once
  ready to start tracking history (was explicitly deferred per your request).
