# Vidya Test Prep — local build

This is the **local-first** edition of [JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md), described in
[JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md). Everything — database, source
PDFs, cropped images — lives under `data/` on this machine. No cloud services, no API keys.

Currently implemented: **stages 0–5** of the build plan (auth, paper upload, PDF viewer + crop tool,
paste-JSON ingest, question editor with KaTeX/mhchem + verify gate). The test builder, test runner,
grading, and analytics (stages 6–9) are not built yet.

## Running it

```
npm install
npm run seed   # first time only — creates the two logins + demo data
npm run dev
```

Open http://localhost:3000 and sign in as:

| Username  | Password | Role    |
|-----------|----------|---------|
| `Teacher` | `112345` | teacher |
| `Student` | `112345` | student |

These are local-development credentials only — delete them before any deployment.

## Where everything lives

Everything mutable is under `data/` (gitignored):

- `data/pgdata/` — the PGlite (embedded Postgres) database
- `data/papers/` — uploaded source PDFs
- `data/images/` — cropped question images (WebP)
- `data/.session-secret` — auto-generated on first boot if `SESSION_SECRET` isn't set in `.env.local`

**Deleting `data/` resets the entire app to empty.** Re-run `npm run seed` afterward to get the two
logins back.

## Config

Zero-config by default. To pin a session secret or move the data directory, copy
[env.local.example](env.local.example) to `.env.local` and edit it.

## A note on security

Production relies on Postgres Row-Level Security so a student can never read an answer key at the
database level (LLD §4.9). PGlite has no auth roles, so that guarantee doesn't exist locally — see
`drizzle/production-only/9999_rls.sql` for the unapplied production policy, and §5 of the build plan
for what protects answer keys in this local build instead (an explicit-field-pick DTO layer plus an
automated leak test, both landing when the student-facing test runner is built in a later stage).

## Scripts

- `npm run dev` — start the app (copies the pdf.js worker first)
- `npm run seed` — create the two logins + 12 data-only demo students + a demo paper/questions
- `npm test` — Vitest (ingest-schema validation, body-parsing)
- `npm run typecheck` — `tsc --noEmit`

`npm run seed` and `npm run dev` cannot both hold the PGlite data directory open at once — stop the
dev server before seeding, or run seed before starting dev.
