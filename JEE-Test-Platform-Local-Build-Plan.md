# Build Plan — JEE Test Platform, **Local-First Edition** (v1.0-local)

## Context

[JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md) is an approved production design: Next.js on Vercel, Supabase Postgres + Auth + Storage, Google Drive for source PDFs, five collaborating teachers, ~50 students.

You want to build and run the **whole thing on this machine first**, before any of that cloud surface exists:

- Every byte lives on local disk — database, source PDFs, cropped images, backups. No Supabase project, no Drive service account, no Vercel, no cloud credentials of any kind.
- **You are the only operator.** You will run the extraction LLM yourself in a browser tab (Gemini/Claude), by hand, copy-paste. The app never calls an LLM API and never holds an API key.
- Because that copy-paste is the workflow, the extraction prompt must live **inside the app**, on screen, one click from the clipboard — not in a text file you have to go dig up each time.
- Two logins only: `Student` and `Teacher`, password `112345`.
- Placeholder branding so screens aren't nameless.

The intended outcome is a fully working single-machine app covering LLD §8.6 MVP, built so that "go to production" later is **configuration and deployment, not a rewrite**. Every local substitution below is deliberately shaped like its cloud counterpart.

> ⚠️ **This plan is design only — no code is written yet.** Implementation begins after approval.

### Environment verified on this machine

| | |
|---|---|
| Node | v24.19.0 ✅ |
| npm | 11.17.0 ✅ |
| Python | 3.13.3 ✅ (backup/ops scripts only) |
| Docker | **not installed** — drives the DB choice below |
| Working dir | `C:\Users\maheedhc\Study` (not a git repo yet — Stage 0 initialises one) |

---

## 1. Decided parameters (local edition)

| Parameter | Production LLD | **Local build** |
|---|---|---|
| Database | Supabase Postgres, Mumbai | **PGlite** — real Postgres compiled to WASM, running in-process, persisted to `./data/pgdata` |
| DB access | Drizzle over Supavisor pooler | Drizzle over `drizzle-orm/pglite` — *same query code* |
| Auth | Supabase Auth JWT | Local `profiles` table + scrypt password hash + signed httpOnly cookie (`jose`) |
| Source PDFs | Google Drive + service account | `./data/papers/<uuid>.pdf`, uploaded through the browser |
| Question images | Supabase Storage, signed URLs | `./data/images/<questionId>/<placeholder>.webp`, served via authenticated route |
| Answer-key protection | Postgres RLS | **API projection layer + automated leak test** (RLS SQL written but held for production — see §5) |
| Extraction LLM | Gemini Pro, manual paste | Same — **plus an in-app prompt page with a Copy button** |
| Cron sweep | Vercel Cron | `instrumentation.ts` interval + opportunistic sweep on attempt read |
| Teachers | 5, concurrent | 1 (you). Concurrency guard kept anyway — it's 5 lines and preserves parity |
| Students | ~50 provisioned | 1 login (`Student`) + 12 seeded demo students with graded attempts, so analytics render |
| Hosting | Vercel `bom1` | `npm run dev` / `npm run start` on `localhost:3000` |
| Cost | ~₹83/month | **₹0** |

### Why PGlite and not SQLite

Docker isn't installed, so a native Postgres service would be an extra install-and-configure step before a single line runs. PGlite is `npm install` and nothing else, but it is *actual Postgres 17*, so the LLD's §4 schema ports **verbatim** — `CREATE TYPE ... AS ENUM`, `jsonb`, `uuid[]`, `numeric(7,2)`, `CHECK` constraints, `CREATE VIEW` with `rank() OVER (PARTITION BY ...)` / `percent_rank()`, and `GIN (to_tsvector('english', body))`. SQLite would have forced a rewrite of all of it, and then a *second* rewrite when moving to Supabase.

**Known constraints, accepted:** PGlite is single-connection and in-process — requests serialize. Irrelevant at one user; it is why the plan does not pretend to load-test. It must run on the Node runtime (not Edge), and needs an HMR-safe singleton in dev. Both are handled in Stage 1.

---

## 2. Branding — Vidya Test Prep

**Organization name:** `Vidya Test Prep`
**Product line:** `JEE Mains Test Platform`
**Palette:** deep blue `#1E3A8A` (primary) · amber `#F59E0B` (accent) · slate `#0F172A` text · `#F8FAFC` page ground

All of this goes in **one file**, `src/config/branding.ts`, and nowhere else — so replacing the placeholder later is a single edit, not a find-and-replace across the app:

```ts
export const BRAND = {
  orgName:    'Vidya Test Prep',
  productName:'JEE Mains Test Platform',
  shortName:  'VTP',
  primary:    '#1E3A8A',
  accent:     '#F59E0B',
  logoMark:   '/brand/logo-mark.svg',
  logoLock:   '/brand/logo-lockup.svg',
} as const;
```

### Logo mark — `public/brand/logo-mark.svg`

An open book under a lamp flame: literal coaching-centre iconography, legible at 16px favicon size.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Vidya Test Prep">
  <rect width="64" height="64" rx="14" fill="#1E3A8A"/>
  <path d="M32 11.5c3.6 3.3 5.4 6.3 5.4 9.1a5.4 5.4 0 1 1-10.8 0c0-2.8 1.8-5.8 5.4-9.1z" fill="#F59E0B"/>
  <path d="M11.5 33c6.6-2.9 13.3-2.9 19.9 0v17.4c-6.6-2.9-13.3-2.9-19.9 0z" fill="#fff"/>
  <path d="M52.5 33c-6.6-2.9-13.3-2.9-19.9 0v17.4c6.6-2.9 13.3-2.9 19.9 0z" fill="#fff" fill-opacity=".72"/>
  <path d="M32 33v17.4" stroke="#1E3A8A" stroke-width="1.8" stroke-linecap="round"/>
</svg>
```

### Horizontal lockup — `public/brand/logo-lockup.svg`

Same mark at 36px + `VIDYA TEST PREP` (600 weight, `.06em` tracking, `#0F172A`) with `JEE Mains Test Platform` beneath in 10px `#64748B`. Used in the app header and on the login page.

Also produced: `public/favicon.svg` (the mark alone) and `src/app/icon.svg` for Next.js metadata.

---

## 3. Repository layout

```
C:\Users\maheedhc\Study\
├─ JEE-Test-Platform-LLD.md          ← production design, unchanged reference
├─ README.local.md                   ← how to run, back up, and reset
├─ .env.local                        ← SESSION_SECRET, DATA_DIR (gitignored)
├─ .gitignore                        ← /data, .env.local, node_modules
├─ data/                             ← ALL runtime state. Never committed.
│  ├─ pgdata/                        ← PGlite database directory
│  ├─ papers/<paperId>.pdf
│  ├─ images/<questionId>/<placeholderId>.webp
│  └─ backups/YYYY-MM-DD-HHmm/       ← db dump + papers + images
├─ prompts/
│  └─ extract-v1.txt                 ← LLD §6 prompt, verbatim, version-pinned
├─ drizzle/                          ← generated SQL migrations
│  └─ production-only/
│     └─ 9999_rls.sql                ← LLD §4.9 RLS. NOT applied locally. See §5.
├─ scripts/
│  ├─ seed.mjs                       ← accounts + 12 demo students + demo attempts
│  ├─ backup.mjs                     ← pglite dumpDataDir + file tree copy
│  ├─ restore.mjs
│  └─ reset.mjs                      ← wipe data/, re-migrate, re-seed
├─ public/brand/                     ← logo-mark.svg, logo-lockup.svg
└─ src/
   ├─ config/branding.ts
   ├─ db/
   │  ├─ client.ts                   ← PGlite singleton (HMR-safe)
   │  ├─ schema.ts                   ← Drizzle schema (LLD §4)
   │  └─ migrate.ts                  ← runs pending migrations at boot
   ├─ lib/
   │  ├─ auth.ts                     ← session cookie sign/verify, requireTeacher/requireStudent
   │  ├─ storage.ts                  ← local file paths, traversal guard
   │  ├─ zod/ingest.ts               ← IngestQuestion schema (LLD §6), shared client+server
   │  ├─ grading.ts                  ← pure, unit-tested (LLD §5.3, §7.4)
   │  ├─ shuffle.ts                  ← seeded, materialised at attempt start
   │  └─ dto.ts                      ← ⚠️ the ONLY place question payloads are shaped for students
   ├─ instrumentation.ts             ← boot: migrate, seed-if-empty, start sweep interval
   ├─ components/                    ← shadcn/ui + Katex.tsx, CopyButton.tsx, Palette.tsx …
   └─ app/
      ├─ (auth)/login/
      ├─ (teacher)/teacher/…
      ├─ (student)/student/…
      └─ api/…
```

**One rule that matters:** `data/` is the entire mutable state of the system. Deleting it and re-running resets the app to zero. Copying it is a complete backup. Nothing persistent lives anywhere else.

---

## 4. Package list

```
next@15  react@19  typescript  tailwindcss  shadcn/ui
drizzle-orm  drizzle-kit  @electric-sql/pglite
zod  jose                       # session cookie signing
katex                           # + mhchem extension (ships in katex/contrib)
pdfjs-dist                      # PDF render + crop canvas
pdf-lib                         # server-side page count on upload
recharts                        # analytics charts
idb-keyval                      # IndexedDB autosave mirror
vitest                          # grading + leak tests
```

**No native dependencies.** Notably **no `sharp`** — WebP conversion happens in the browser via `canvas.toBlob(blob => …, 'image/webp', 0.85)` on the crop canvas, which the crop tool already has a handle to. The server just writes the bytes it receives. This removes the single most common Windows install failure from the project.

---

## 5. Security model, honestly stated

Production relies on Postgres RLS so that "a student cannot read an answer key" is a *database* guarantee (LLD §4.9). **PGlite has no auth roles and no `auth.uid()` — every local query runs as superuser, so RLS cannot enforce anything here.** Pretending otherwise would be the most dangerous thing in this plan.

The local substitute, and how it stays honest:

1. **Single choke point.** Student-facing question payloads are constructed *only* by `toStudentQuestion()` in `src/lib/dto.ts`, which explicitly picks fields — `{ id, position, body, type, options, images, marks }` — rather than spreading and deleting. `answer`, `solution`, `difficulty`, `extraction_notes` cannot leak through a field added later, because new fields are not picked by default.
2. **An automated test that fails the build.** `dto.leak.test.ts` walks the JSON returned by `GET /api/attempts/:id/questions` recursively and asserts no key named `answer`/`solution`/`difficulty` appears at any depth, and that no correct-answer *value* appears anywhere in the serialized string. This runs in `npm test`.
3. **A lint rule / grep gate** forbidding `questions.answer` outside `src/lib/grading.ts` and `src/app/api/attempts/[id]/submit`.
4. **The real RLS SQL is written now**, at `drizzle/production-only/9999_rls.sql`, copied verbatim from LLD §4.9, with a header comment explaining it is deliberately not applied locally. It is applied on the first Supabase deploy — it is defence *in addition to* the DTO layer, never instead of it.

**Passwords.** `112345` is a deliberate local-development credential. It is seeded as a scrypt hash in `profiles.password_hash` (never hardcoded in a route handler), so the login path is production-shaped. `README.local.md` gets an explicit line: *this credential must not survive the move to production.*

---

## 6. Schema deltas from LLD §4

Everything in LLD §4 ports as written. Only these change, and each is a swap of a cloud reference for a local one:

**`profiles`** — add local login columns:
```sql
username       text NOT NULL UNIQUE,   -- 'Student', 'Teacher'
password_hash  text NOT NULL,          -- scrypt: salt$N$r$p$hash
```

**`papers`** — Drive reference → local file reference:
```sql
-- REMOVED: drive_file_id, drive_link
file_path         text NOT NULL,          -- relative to DATA_DIR, e.g. 'papers/<uuid>.pdf'
original_filename text NOT NULL,
file_size_bytes   bigint NOT NULL,
sha256            text NOT NULL UNIQUE,   -- re-upload of the same paper is rejected, not duplicated
extraction_meta   jsonb                   -- { promptVersion: 'extract-v1', model: 'gemini-pro', extractedAt }
```
`extraction_meta` closes a gap in the LLD itself: §6 says to record which prompt version produced each paper, but §4.3's table had no column for it.

**`question_images`** — `storage_path` keeps its name and meaning, now holding `images/<questionId>/<placeholder>.webp`. Column unchanged so the production port is a storage-adapter swap.

**`question_revisions`** — LLD §8.5 asks for it but never defines it. Defined here and built in Stage 5:
```sql
CREATE TABLE question_revisions (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision    int  NOT NULL,
  snapshot    jsonb NOT NULL,
  edited_by   uuid REFERENCES profiles(id),
  edited_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, revision)
);
```
Written by an `AFTER UPDATE` trigger. Cheap insurance while you're the sole editor and there is no undo anywhere else.

Views `v_question_stats` and `v_test_ranks` (LLD §4.8) are created **exactly as written** — PGlite runs both window functions natively.

---

## 7. The in-app extraction prompt (your explicit ask)

This is the feature that makes the manual LLM loop bearable, so it gets designed properly rather than as a `<pre>` tag.

### `/teacher/extraction-prompt` — the reference page

- Full text of `prompts/extract-v1.txt` (LLD §6, verbatim) in a monospace, scrollable, syntax-neutral block.
- **A large primary `Copy prompt` button** pinned to the top of the block and **sticky** so it stays reachable while you scroll a 90-line prompt. Uses `navigator.clipboard.writeText` (`localhost` is a secure context, so this works), with a `document.execCommand('copy')` fallback. Button transitions `Copy prompt → ✓ Copied` for 2s, and is keyboard-focusable.
- A **version dropdown** listing every `prompts/extract-v*.txt` on disk. Whichever is selected is what gets stamped into `papers.extraction_meta.promptVersion`. Adding `extract-v2.txt` to the folder makes it appear — no code change.
- `Download .txt` secondary action.
- A short numbered **workflow card** beside it, with the Drive step replaced by the local one:
  1. Register the paper below → the PDF is stored locally
  2. Copy the prompt ⧉
  3. Open Gemini / AI Studio in a new tab
  4. Attach the same PDF (20–25 pages per request — LLD §6 operating notes)
  5. Paste the prompt, run it
  6. Copy the JSON output
  7. Paste it into the ingest box → validate

### `/teacher/papers/[id]/ingest` — where you actually work

The prompt is **not** hidden behind a link from here. The page carries:

- A collapsed `▸ Extraction prompt (extract-v1)` disclosure with its **own** `Copy prompt` button visible *while collapsed* — one click, no navigation, no expansion needed. This is the button you will press a hundred times.
- The paste textarea below it, with a live character/question counter.
- `Validate` runs the shared Zod schema (`src/lib/zod/ingest.ts`) client-side first for instant feedback, then server-side authoritatively.
- Validation failures render **all-or-nothing** per LLD §5.1: a list of `questions[7].type — expected 'mcq' | 'integer', got 'numerical'` rows, each **clicking through to highlight that line in the textarea**. Nothing partial saves.
- A `Fix-up hint` panel that surfaces the LLD §6 truncation-recovery prompt — *"Continue the JSON from exactly where you stopped…"* — with its own copy button, because truncation on a 75-question paper is the failure you will actually hit.

A reusable `<CopyButton text={...} />` component backs all four copy affordances.

---

## 8. Local substitutions for the cloud pieces

**PDF upload replaces Drive registration.** `POST /api/papers` takes multipart form data → streams to `data/papers/<uuid>.pdf` → computes SHA-256 (rejecting a duplicate with `409 duplicate_paper` naming the existing paper) → reads page count with `pdf-lib` → inserts the row. `GET /api/papers/:id/pdf` streams the file back with `Content-Type: application/pdf`, after an auth check and a resolved-path guard asserting the target is inside `DATA_DIR` (path-traversal defence). **The route path and response are byte-identical to the production Drive-proxy route**, so the crop tool built against it never learns where the bytes came from.

**Local file serving replaces signed URLs.** `GET /api/files/images/:questionId/:placeholder` checks the session, checks the caller is entitled to that question (teacher always; student only if the question is in one of their attempts), then streams the WebP with `Cache-Control: private, max-age=3600`. Files live under `data/`, **never** under `public/` — otherwise Next.js would serve unpublished question figures to anyone who guessed a URL.

**Boot-time interval replaces Vercel Cron.** `instrumentation.ts#register()` runs migrations, seeds if the DB is empty, then starts a 60-second `setInterval` calling the same `sweepExpiredAttempts()` function the production cron route calls. The sweep *also* runs opportunistically inside `GET /api/attempts/:id`, so a stale attempt is caught even if the server was restarted.

**`scripts/backup.mjs` replaces `pg_dump` + Drive.** Calls PGlite's `db.dumpDataDir()` and writes it, plus a copy of `data/papers` and `data/images`, into `data/backups/<timestamp>/`. Prunes to 30 most recent. `restore.mjs` reverses it. `reset.mjs` nukes and re-seeds.

---

## 9. Seed data

`scripts/seed.mjs` creates:

| | |
|---|---|
| `Teacher` / `112345` | role `teacher`, "Demo Teacher" |
| `Student` / `112345` | role `student`, "Demo Student", batch `JEE-2027-A` |
| 12 demo students | roles `student`, **no usable password hash** — data only, cannot log in |
| 1 demo paper | ~10 hand-written questions across physics/chemistry/maths, `verified`, exercising MCQ + integer + a KaTeX matrix + an `\ce{}` chemistry equation + one image placeholder |
| 2 demo tests | one published & attempted, one draft |
| ~36 attempts | 12 students × 3, with plausible score spread and per-question timings |

The point of the 12 fake students: rank, percentile, distribution histogram, leaderboard and cohort weak-chapter views are **impossible to evaluate against a single row**. With a spread, you can see immediately whether `v_test_ranks` is right. `Student`'s own attempts stay separate so your view of the app is clean.

---

## 10. Build stages

Ordered per LLD §9 — riskiest and least reversible first — with the cloud stages replaced.

| # | Deliverable | Done when |
|---|---|---|
| **0** | `git init`, Next.js 15 + TS + Tailwind + shadcn scaffold, `.gitignore` excluding `data/`, `branding.ts`, logo SVGs, `README.local.md` | `npm run dev` serves a branded empty shell at `localhost:3000` |
| **1** | PGlite singleton, Drizzle schema (LLD §4 + §6 deltas), migrations, `instrumentation.ts` boot, local auth (scrypt + `jose` cookie), login page, `requireTeacher`/`requireStudent`, role-based redirect | Log in as both accounts; `Student` hitting `/teacher/*` gets 403; killing and restarting the server keeps you logged in and keeps the data |
| **2** | Paper upload + list + delete, SHA-256 dedupe, `pdf-lib` page count, `/api/papers/:id/pdf` stream, path-traversal guard, `/api/files/*` | Upload a real JEE PDF; it appears in the list with a correct page count; re-uploading it is rejected; the raw path is not reachable from the browser |
| **3** | **PDF.js viewer + crop tool** — canvas at scale 2.0, page nav, zoom, drag-rectangle selection, `canvas.toBlob('image/webp')`, crop persisted with `source_page` + `crop_rect` for re-crop | Drag a box on page 4 of a real paper; a WebP lands in `data/images/…` and renders back in the app. *Done early, per LLD §9 — it is the least familiar piece* |
| **4** | Extraction-prompt page + `<CopyButton>` + version dropdown; ingest page with collapsed-prompt copy, paste box, shared Zod schema, click-to-highlight error list, all-or-nothing staging as `draft` | Paste a real Gemini output for a real paper → 75 drafts staged; paste a broken one → precise per-field errors, zero rows written |
| **5** | Question editor: split PDF-left / editor-right, KaTeX + mhchem live preview, `[[IMG:…]]` placeholder resolution wired to Stage 3's cropper, verify gate (answer non-null · all placeholders resolved · LaTeX compiles), optimistic-concurrency `updated_at` check, `question_revisions` trigger, filter/search list over the GIN index. **Digitize one real paper end-to-end here.** | One complete real paper sits at `status = 'verified'` with every figure cropped and every answer keyed |
| **6** | Test builder: pick questions by subject/chapter/difficulty, ordering, per-question marks (+4/−1/0 defaults), duration, open/close window, shuffle flags, `results_policy`, publish gate rejecting any non-verified question | A publishable test exists; publishing with a draft question in it fails with a clear message |
| **7** | Test runner: instruction screen, server-authoritative timer (`serverTime` + `deadlineAt` + clock offset), 75-cell palette with the full 5-state machine incl. `answered_flagged`, mobile bottom-sheet palette, `performance.now()` per-question timing paused on tab-hide, autosave (300ms debounce · 15s heartbeat · navigation · `visibilitychange` · `beforeunload` sendBeacon), IndexedDB mirror, resume-by-reconciliation, `attempt_events` blur logging | **The LLD §8.2 disconnect test passes:** answer 10 → DevTools offline → answer 5 more → kill the browser → reopen → reconnect → **all 15 present.** This is the gate for the whole stage |
| **8** | Server-side grading in one transaction (the *only* reader of `questions.answer`), idempotent submit, numeric parse for integer answers, `results_policy` gate, review screen (your answer vs correct, marks colour-coded, worked solution, time vs `expected_time_s` flagged at >1.5×), stored-order replay | Submit a full attempt; scores match hand calculation including negative marking and unattempted; `dto.leak.test.ts` passes |
| **9** | `v_question_stats` + `v_test_ranks`; student analytics (score, subject/chapter accuracy, time profile); teacher analytics (distribution, per-question % correct, leaderboard); Recharts; CSV export | Every chart renders with real shape against the 12 seeded students |
| **10** | Responsive pass (test runner on a phone viewport is the one that matters), `backup.mjs`/`restore.mjs`/`reset.mjs`, `README.local.md` finalised, secrets audit, Vitest suite green | `npm run backup` produces a folder that `npm run restore` fully rehydrates into a working app |

**Suggested checkpoints for review:** after Stage 1 (auth + persistence), Stage 5 (one real paper digitized — this is where you learn whether the pipeline is actually pleasant), and Stage 7 (disconnect test).

---

## 11. Testing

- **Vitest, `src/lib/grading.test.ts`** — MCQ key match, integer exact, integer tolerance range, `"42.0" === "42"` numeric parse, unattempted, negative marking, marks sourced from `test_questions` not `questions`.
- **Vitest, `src/lib/dto.leak.test.ts`** — the §5 recursive answer-key leak assertion. Non-negotiable.
- **Vitest, `src/lib/zod/ingest.test.ts`** — fixture JSONs: valid 75-question paper, truncated, wrong enum, integer-type-with-options, unclosed `$`.
- **Manual, scripted in `README.local.md`** — the LLD §8.2 disconnect drill (Stage 7's gate), and a full attempt hand-scored against the grader.

No Playwright. At one user on one machine it costs more to maintain than it returns.

---

## 12. Path back to production

When the local build is proven, promoting it touches these and nothing else:

| Layer | Change |
|---|---|
| Database | `drizzle(new PGlite(dir))` → `drizzle(postgres(SUPABASE_POOLER_URL))` in `src/db/client.ts`. Schema and every query are already Postgres. |
| RLS | Apply `drizzle/production-only/9999_rls.sql`. Already written. |
| Auth | Swap `src/lib/auth.ts` internals for Supabase Auth. `requireTeacher()`/`requireStudent()` signatures stay, so no call site changes. |
| PDFs | Swap `src/lib/storage.ts` internals for the Drive service-account fetch. `/api/papers/:id/pdf` contract is already identical. |
| Images | Same file, local write → Supabase Storage + signed URL. |
| Cron | `instrumentation.ts` interval → `/api/cron/sweep-expired` + Vercel Cron, calling the same `sweepExpiredAttempts()`. |
| Credentials | **Delete the `112345` accounts.** Provision real ones. |
| Multi-teacher | Concurrency guard already built; add the 4 other teacher accounts. |

The load-bearing decision is that **PGlite is real Postgres and the storage/auth boundaries are adapters from day one** — which is why this list is short.

---

## 13. Open questions / flagged risks

1. **PGlite maturity.** Actively developed and Postgres-correct, but far less battle-tested than a server Postgres. Mitigated by nightly `backup.mjs`, and by the fact that the schema is standard SQL — if PGlite ever disappoints, pointing `client.ts` at a real Postgres is a one-line change with zero schema work.
2. **PDF.js worker on Next 15.** The worker must be pinned to the exact `pdfjs-dist` version and copied into `public/`. Version drift between the library and worker is the classic failure. Pinned exactly in `package.json`, handled in Stage 3.
3. **Clipboard fallback.** `navigator.clipboard` needs a secure context; `localhost` qualifies, so this should never bite — the `execCommand` fallback is belt-and-braces for an unexpected `127.0.0.1`-vs-`localhost` case.
4. **Digitization is still the real bottleneck** (LLD §10) and this plan does not change that. It is why Stage 5 ends with digitizing one *real* paper — you should feel the actual per-paper cost before committing to a hundred of them.
