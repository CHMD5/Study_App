# Vidya Test Prep — JEE Mains Test Platform (local build)

A JEE Mains test-platform prototype, built to run **entirely on one machine** — no
cloud services, no API keys, no external accounts. Everything the app stores
(database, source PDFs, cropped question images) lives on local disk under
`data/`.

This is the local-first edition of a production design documented in
[JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md); the local adaptation itself
is documented in [JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md).
Read those for the *why* behind the decisions below — this file just gets you running.

**Current status:** stages 0–5 of the build plan are implemented — accounts,
paper upload, the PDF viewer/crop tool, paste-JSON question ingestion, and the
question editor with a verify gate. The test builder, test runner, grading, and
analytics (stages 6–9) are not built yet.

---

## Prerequisites

- **Node.js 20+** (developed against Node 24) and npm
- No Docker, no Postgres install, no external services required

Check what you have:

```
node -v
npm -v
```

## Setup

```
npm install
npm run seed
npm run dev
```

- `npm install` — installs dependencies (no native/build-tool dependencies; nothing to compile)
- `npm run seed` — creates the two logins below, 12 data-only demo students, a
  generated demo PDF, and ~10 sample questions. Safe to re-run — it skips
  anything that already exists.
- `npm run dev` — starts the app at **http://localhost:3000**

> ⚠️ `npm run seed` and `npm run dev` cannot both hold the local database open
> at the same time. Run seed either before starting the dev server, or after
> stopping it.

## Sign in

| Username  | Password | Role    |
|-----------|----------|---------|
| `Teacher` | `112345` | teacher |
| `Student` | `112345` | student |

These are local-development credentials, seeded on purpose — delete these
accounts before any real deployment.

## What you can do right now

Signed in as **Teacher**:

1. **Papers** — upload a scanned JEE PDF (or use the generated demo paper)
2. **Extraction prompt** — copy the extraction prompt, run it yourself against
   Gemini Pro (or any LLM) in a browser tab, and paste the JSON it returns
   back into a paper's ingest screen
3. **Ingest** — paste that JSON, validate it, and stage the questions as drafts
4. **Question bank** — filter/search all questions; open one to edit it
5. **Question editor** — split view (source PDF + crop tool on the left, live
   KaTeX/mhchem preview on the right), resolve `[[IMG:...]]` image placeholders
   by dragging a crop on the PDF, set the answer key and pedagogy fields, then
   **Verify** a question once it's complete

Signed in as **Student**: a placeholder page — the test runner isn't built yet.

## Where everything lives

All mutable state is under `data/` (gitignored, never committed):

```
data/
├─ pgdata/     the embedded Postgres database (PGlite)
├─ papers/     uploaded source PDFs
├─ images/     cropped question images (WebP)
└─ .session-secret   auto-generated on first boot
```

**Deleting `data/` resets the app to empty.** Re-run `npm run seed` afterward.

## Configuration (optional)

The app runs with zero configuration. To pin a session secret or change where
data is stored, copy [env.local.example](env.local.example) to `.env.local`
and edit it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (also copies the pdf.js worker into `public/`) |
| `npm run build` / `npm start` | Production build / start |
| `npm run seed` | Create accounts + demo paper + demo questions |
| `npm test` | Run the Vitest suite (ingest-schema validation, body parsing) |
| `npm run typecheck` | `tsc --noEmit` |

## Tech stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS · Drizzle ORM ·
[PGlite](https://pglite.dev) (embedded Postgres, replaces Supabase locally) ·
KaTeX + mhchem · pdf.js · Zod · Vitest.

## Project structure

```
src/
├─ app/            routes: (auth)/login, teacher/*, student/*, api/*
├─ components/     shared UI (hand-rolled shadcn-style primitives, KaTeX renderer, PDF crop tool)
├─ db/             Drizzle schema + PGlite client
├─ lib/            auth, storage, session, validation, question-body parsing
└─ config/         branding (org name, logo, palette — the whole placeholder identity lives here)

drizzle/           SQL migrations (0000_init.sql is the schema source of truth)
prompts/           the versioned Gemini extraction prompt
scripts/           seed.ts and the pdf.js worker copy step
```

## Security note

Production relies on Postgres Row-Level Security so a student can never read
an answer key at the database level. PGlite (the local embedded database) has
no auth roles, so that particular guarantee doesn't apply locally — see
`drizzle/production-only/9999_rls.sql` (written but deliberately not applied
here) and the build plan's §5 for what protects answer keys in this local
build instead.

## Further reading

- [JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md) — the original production design
- [JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md) — how this local build maps to it, stage by stage
- [README.local.md](README.local.md) — shorter quick-reference version of this file
