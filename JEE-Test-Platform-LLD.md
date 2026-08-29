# Low-Level Design: JEE Mains Test Platform

**Version:** 2.0 (Definitive)
**Date:** 29 August 2026
**Status:** Approved for build

---

## 0. Decided Parameters

| Parameter | Decision |
|---|---|
| Teachers | **5**, shared single question bank (collaborative — any teacher can see/edit any question, authorship tracked, not access-restricted) |
| Students | ~50, teacher-provisioned, no self-signup |
| Total data footprint | **< 1 GB** in-app (questions + images + attempts). Source PDFs excluded — they live in Google Drive, outside the app's storage. |
| Build method | **Agentic AI** (e.g. Claude Code) writing the implementation from this document |
| Frontend/Backend | **Next.js 15**, App Router, TypeScript, single codebase |
| Database | **PostgreSQL via Supabase**, Mumbai region |
| Auth + image storage | **Supabase** (Auth + Storage) |
| Source PDFs | **Google Drive only.** Never re-hosted, never converted to a "readable code" format — students never see them, so they stay exactly where the teachers already put them. |
| Math/chemistry rendering | **KaTeX + mhchem** |
| Extraction LLM | **Gemini Pro** (via AI Studio / Gemini app, manual paste workflow) |
| Budget | **≤ ₹1,000/month** |
| Future | A **mobile app** is planned. This architecture is built so that step requires no backend rewrite. |

This document contains one recommendation per decision, not a menu. Where a choice affects the future mobile app or the ₹1,000 budget, that's called out inline.

---

## 1. Architecture

### 1.1 System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT — Next.js, responsive, installable PWA                      │
│                                                                      │
│  Teacher (desktop)                  Student (mobile / tablet / desk)│
│  ├─ Paste-JSON ingest screen        ├─ Test list                    │
│  ├─ Split review: PDF | parsed Qs   ├─ Instruction screen           │
│  ├─ PDF.js viewer + crop tool       ├─ Test runner (timer, palette) │
│  ├─ Question editor + KaTeX preview ├─ Review screen                │
│  ├─ Test builder                    └─ Analytics dashboard          │
│  └─ Analytics / export                                              │
└───────────────┬───────────────────────────────────┬──────────────────┘
                │ HTTPS, JWT in httpOnly cookie      │ signed URL GET
                ▼                                    │ (images only)
┌────────────────────────────────────────────────┐   │
│  Next.js Route Handlers (Vercel, region bom1)   │   │
│                                                 │   │
│  /api/papers        register Drive file, proxy  │   │
│  /api/ingest         validate + stage draft Qs  │   │
│  /api/questions      CRUD, verify/publish       │   │
│  /api/tests          build, schedule            │   │
│  /api/attempts       start, save, submit         │   │
│  │  └── SERVER-SIDE GRADING — the only place    │   │
│  │      the answer key is ever read              │   │
│  /api/analytics      aggregate queries           │   │
│  /api/cron/sweep     auto-submit expired         │   │
└───────┬─────────────────────────────┬────────────┘   │
        ▼                             ▼                │
┌───────────────────────┐   ┌─────────────────────┐    │
│  Supabase PostgreSQL  │   │  Supabase Storage    │◄───┘
│  (Mumbai) + RLS       │   │  bucket: question-    │
│                       │   │  images (private)    │
│  profiles  questions  │   │  → 1-hr signed URLs   │
│  papers    tests      │   │  → CDN-cached         │
│  attempts  answers    │   └─────────────────────┘
└───────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  GOOGLE DRIVE — teacher-owned shared folder                          │
│  100 source PDFs, never touched by students, never copied elsewhere. │
│  App holds only a `drive_file_id` per paper + a service-account       │
│  credential to stream bytes server-side into the PDF viewer.          │
└─────────────────────────────────────────────────────────────────────┘

OFFLINE / MANUAL:
  Hard copy ──scan app──▶ PDF ──teacher uploads to Drive folder
                     └──teacher also uploads same PDF to Gemini Pro
                            (chat / AI Studio) with the extraction prompt (§6)
                                   ↓
                          strict JSON ──paste into app──▶ staged drafts
```

### 1.2 Why Google Drive for PDFs, definitively

Source PDFs are teacher-only reference material used exactly twice: once during ingestion review (cropping images), and occasionally when a teacher wants to double-check a mis-parsed question against the original. Students never see them, and they are not converted into any "readable" structured format — the structured format is the `questions` table; the PDF stays a PDF.

Given that access pattern, running S3/R2 storage for ~1.5 GB of files that five people read occasionally is unjustified cost and complexity. Teachers already have Drive. The app does not host the files — it holds a reference and streams bytes on demand.

**Mechanism:** a Google Cloud service account is created once and shared (Editor access) into the teachers' Drive folder. When a teacher registers a paper in the app, they paste the Drive file's share link; the app extracts the file ID and calls the Drive API to confirm access and pull metadata (name, size). The crop tool needs actual byte access for `pdf.js` to render onto a canvas — a server route (`/api/papers/:id/pdf`) calls `drive.files.get({ fileId, alt: 'media' })` with the service-account credential and streams the bytes to the client. This is the officially supported Drive API download path (not the unofficial `uc?export=download` link), has no file-size caveats at this scale, and never requires making a file public. The Drive API's standard quota (free) comfortably covers 5 teachers occasionally opening 8 MB PDFs.

This keeps `papers` storage cost at **₹0** and removes an entire bucket, IAM policy, and lifecycle rule from the system.

### 1.3 Multi-teacher model

All 5 teachers share one question bank, one test catalogue, one student roster — this is one institution, not five silos. `profiles.role = 'teacher'` grants full read/write on `papers`, `questions`, `tests`. Authorship is tracked (`created_by`, `verified_by`) for accountability, not for access control — any teacher can edit any other teacher's draft.

Because five people can now edit the same question, **every question update carries an optimistic-concurrency check**: the client sends the `updated_at` it last saw; the server rejects the write with `409 stale_write` if it doesn't match. This is the one piece of extra machinery multi-teacher access requires, and it's cheap.

### 1.4 Future mobile app

The Next.js Route Handlers under `/api/*` and Supabase Auth's JWT session are the entire backend contract. A future Expo/React Native app authenticates against the same Supabase Auth project and calls the same `/api/*` routes — no new backend, no duplicated business logic, no separate grading implementation to keep in sync. The only new work at that point is the native UI. This is why Next.js API routes are written as a clean JSON contract now rather than mixed into React Server Component logic — kept explicit in §5.

### 1.5 Ingestion pipeline

```
1. SCAN      Hard copy → phone scan app → clean greyscale PDF, 300 DPI
2. DRIVE     Teacher uploads PDF to the shared Drive folder
3. REGISTER  Teacher pastes the Drive share link into the app
             → app resolves file ID, creates `papers` row
4. EXTRACT   Teacher uploads the same PDF to Gemini Pro (AI Studio or
             the Gemini app) with the standard prompt (§6) → strict JSON
5. PASTE     Teacher pastes the JSON into /teacher/papers/{id}/ingest
6. VALIDATE  Zod schema validation, all-or-nothing. Malformed JSON is
             rejected with per-field error paths; nothing partial saves.
7. STAGE     Rows inserted as `questions` with status = 'draft'
8. REVIEW    Split screen: PDF (streamed from Drive via the proxy route,
             left) | parsed question + live KaTeX/mhchem preview (right)
9. CROP      Teacher drags a rectangle on the PDF canvas to resolve each
             [[IMG:...]] placeholder → WebP → Supabase Storage
10. VERIFY   Gate: cannot verify while (a) answer is null, (b) any
             placeholder is unresolved, (c) LaTeX fails to compile
11. PUBLISH  Only 'verified' questions can be added to a test
```

---

## 2. Technology Stack

| Layer | Decision |
|---|---|
| Framework | Next.js 15, App Router, TypeScript — one codebase, one deploy |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | Vercel, function region `bom1` (Mumbai) — colocated with the database |
| Database | Supabase PostgreSQL, Mumbai region |
| DB access | Drizzle ORM (typed queries + migrations) over the Supabase connection pooler |
| Auth | Supabase Auth, email + password, teacher-provisioned accounts |
| Image storage | Supabase Storage, private bucket, 1-hour signed URLs |
| Source PDFs | Google Drive + Drive API v3 (service account) — no app-side storage |
| Math/chemistry | KaTeX + the `mhchem` extension |
| PDF viewer / crop | `pdfjs-dist`, rendered to canvas at scale 2.0 |
| Validation | Zod (shared client + server schema) |
| Charts | Recharts |
| Batch/ops scripts | Python (pandas, psycopg) run locally for backups, exports, bulk tagging |

**Why this combination, briefly:**

- **Next.js over a separate Python API.** An agentic coding tool writing the implementation removes the "solo developer's weaker language" concern that would otherwise argue for a Python backend — the agent writes idiomatic TypeScript as readily as Python. One codebase means one deploy pipeline, one auth story, and Server Components that keep the answer key server-side by construction rather than by discipline.
- **Supabase for everything but files that don't belong in the app.** Auth, Postgres, and image storage share one project, one dashboard, one bill, and — critically — Postgres Row-Level Security enforces "students can never read an answer key" as a database-level guarantee, not an application-level promise. At under 1 GB total, this stays inside Supabase's free tier for the life of the project at current scale.
- **KaTeX + mhchem** renders synchronously with no layout shift, which matters most on the review screen where 75 questions and 75 solutions render at once on a mid-range phone.
- **`pdfjs-dist` directly**, not a wrapper, because the crop tool needs a raw canvas reference for pixel-accurate selection.

---

## 3. Budget

| Item | Monthly cost |
|---|---|
| Vercel Hobby | ₹0 (non-commercial; see note below) |
| Supabase Free tier (Auth + Postgres 500 MB + Storage 1 GB) | ₹0 |
| Google Drive | ₹0 (existing teacher storage) |
| Google Drive API | ₹0 (standard quota, free) |
| Gemini Pro extraction | ₹0 (AI Studio free tier / existing Google account) |
| Domain | ~₹1,000/year → **~₹83/month** |
| **Total** | **~₹83/month**, well inside the ₹1,000 ceiling |

At current scale (1,235 questions/year growth pace, 90 MB images, 50 students) this stays on free tiers for years. Two triggers to watch, both well inside budget when they hit:

- **Vercel Hobby → Pro ($20/mo ≈ ₹1,750)** is required the moment the app is used commercially (fees charged, or operated for a paying institution) rather than a coaching context you personally run. Flag this before launch and budget for it once monetized, per the "future app" plan.
- **Supabase Free → Pro ($25/mo ≈ ₹2,200)** only if the database exceeds 500 MB or storage exceeds 1 GB — several years away at 7,500 questions/1,500 images.

Both exceed ₹1,000/month individually, so the ₹1,000 ceiling is a **free-tier-only constraint today**; revisit the budget conversation before flipping either switch.

---

## 4. Data Model

### 4.1 Enums

```sql
CREATE TYPE user_role      AS ENUM ('teacher', 'student');
CREATE TYPE subject_enum   AS ENUM ('physics', 'chemistry', 'maths');
CREATE TYPE qtype_enum     AS ENUM ('mcq', 'integer');
CREATE TYPE qstatus_enum   AS ENUM ('draft', 'verified', 'archived');
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'abandoned');
CREATE TYPE answer_state   AS ENUM ('not_seen', 'seen_unanswered', 'answered',
                                    'answered_flagged', 'flagged_unanswered');
```

### 4.2 Users

```sql
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'student',
  full_name    text      NOT NULL,
  email        text      NOT NULL UNIQUE,
  batch        text,                        -- e.g. 'JEE-2027-A', for cohort views
  is_active    boolean   NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Five rows will have `role = 'teacher'`. No further teacher-scoping columns anywhere else — access is uniform across all five per §1.3.

### 4.3 Source papers (Drive reference only)

```sql
CREATE TABLE papers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,             -- 'JEE Main 2023 Jan 24 Shift 1'
  exam_year      int,
  drive_file_id  text NOT NULL UNIQUE,      -- Google Drive file ID
  drive_link     text NOT NULL,             -- original share link, for teacher reference
  pdf_pages      int,
  registered_by  uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

No `pdf_path`, no bucket, no upload endpoint. The app never holds PDF bytes at rest — it fetches them from Drive on demand and discards them after streaming to the client.

### 4.4 Questions

```sql
CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_code      text UNIQUE,              -- 'JM2023-S1-P-012', app-generated
  paper_id        uuid REFERENCES papers(id) ON DELETE SET NULL,
  source_qno      int,

  subject         subject_enum NOT NULL,
  type            qtype_enum   NOT NULL,
  status          qstatus_enum NOT NULL DEFAULT 'draft',

  body            text NOT NULL,            -- markdown + $latex$ + [[IMG:id]]
  options         jsonb,                    -- [{key:'A', body:'...'}, ...] MCQ only
  answer          jsonb,                    -- {"key":"C"} | {"value":42} | {"min":3.1,"max":3.2}
  solution        text,

  difficulty      smallint CHECK (difficulty BETWEEN 1 AND 10),
  expected_time_s int,
  topic           text,
  chapter         text,

  extraction_notes jsonb,                   -- Gemini's "uncertain" flags, kept for audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  verified_at     timestamptz,
  verified_by     uuid REFERENCES profiles(id),

  CONSTRAINT verified_needs_answer
    CHECK (status <> 'verified' OR answer IS NOT NULL),
  CONSTRAINT mcq_needs_options
    CHECK (type <> 'mcq' OR jsonb_array_length(options) >= 2)
);

CREATE INDEX ON questions (subject, status);
CREATE INDEX ON questions (chapter, topic);
CREATE INDEX ON questions (difficulty);
CREATE INDEX questions_body_fts ON questions USING gin (to_tsvector('english', body));
```

- `answer` is JSONB to express exact-key, exact-value, or tolerance-range answers in one column.
- `options` uses stable keys (`'A'`/`'B'`/`'C'`/`'D'`), never positional — shuffling per student must never change what a saved response means.
- `verified_needs_answer` is a **database constraint**, not just app validation: the worst possible bug here is publishing an ungradeable question, so the database itself refuses it.
- `[[IMG:...]]` placeholders stay inline in `body` as plain text tokens — kept human-editable in a plain textarea.

**Concurrency guard** (per §1.3, five teachers editing one bank):

```sql
-- Every PATCH to questions supplies the client's last-seen updated_at.
-- Application layer: UPDATE ... WHERE id = $1 AND updated_at = $2
-- Zero rows affected → 409 stale_write, client refetches and reprompts.
```

### 4.5 Question images

```sql
CREATE TABLE question_images (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  placeholder_id text NOT NULL,             -- matches [[IMG:...]] token
  storage_path   text NOT NULL,             -- Supabase Storage key
  alt_text       text,
  width_px       int,
  height_px      int,
  source_page    int,                        -- provenance: which PDF page
  crop_rect      jsonb,                      -- {x,y,w,h} at scale 1.0, for re-crop
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, placeholder_id)
);
```

### 4.6 Tests

```sql
CREATE TABLE tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  duration_s        int  NOT NULL,
  opens_at          timestamptz,            -- NULL = open anytime
  closes_at         timestamptz,
  max_attempts      int  NOT NULL DEFAULT 1,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options   boolean NOT NULL DEFAULT false,
  results_policy    text NOT NULL DEFAULT 'immediate',  -- 'immediate' | 'on_release'
  released_at       timestamptz,
  is_published      boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE test_questions (
  test_id           uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position          int  NOT NULL,
  marks_correct     numeric(5,2) NOT NULL DEFAULT 4,
  marks_wrong       numeric(5,2) NOT NULL DEFAULT -1,
  marks_unattempted numeric(5,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (test_id, question_id),
  UNIQUE (test_id, position)
);
```

Marks live on `test_questions`, not on `questions`, so the same question can carry different marks in different tests. `ON DELETE RESTRICT` on `question_id` prevents deleting a question already used in a real test; use `status = 'archived'` instead.

### 4.7 Attempts and answers

```sql
CREATE TABLE attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES tests(id),
  student_id     uuid NOT NULL REFERENCES profiles(id),
  attempt_no     int  NOT NULL DEFAULT 1,

  started_at     timestamptz NOT NULL DEFAULT now(),
  deadline_at    timestamptz NOT NULL,      -- computed server-side at start
  submitted_at   timestamptz,
  status         attempt_status NOT NULL DEFAULT 'in_progress',

  question_order uuid[] NOT NULL,           -- materialized per-student order
  option_orders  jsonb  NOT NULL DEFAULT '{}',

  total_marks    numeric(7,2),
  max_marks      numeric(7,2),
  total_time_s   int,

  UNIQUE (test_id, student_id, attempt_no)
);

CREATE TABLE attempt_answers (
  attempt_id     uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES questions(id),
  response       jsonb,
  state          answer_state NOT NULL DEFAULT 'not_seen',
  time_spent_ms  int NOT NULL DEFAULT 0,
  visit_count    int NOT NULL DEFAULT 0,
  is_correct     boolean,
  marks_awarded  numeric(5,2),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX ON attempt_answers (question_id);

-- Optional, for anti-cheating signal:
CREATE TABLE attempt_events (
  id          bigserial PRIMARY KEY,
  attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_type  text NOT NULL,     -- 'tab_blur','tab_focus','fullscreen_exit','reconnect'
  at          timestamptz NOT NULL DEFAULT now(),
  meta        jsonb
);
```

`question_order` and `option_orders` are **materialized at attempt start and stored**, never re-derived from a seed — this makes attempts immutable historical records, so a later change to the shuffle algorithm can never retroactively alter what a past attempt looked like.

### 4.8 Analytics — views, not tables

```sql
-- Difficulty calibration (§4.2 of the brief)
CREATE VIEW v_question_stats AS
SELECT
  aa.question_id,
  q.subject, q.chapter, q.topic, q.difficulty AS assigned_difficulty,
  count(*)                                          AS times_served,
  count(*) FILTER (WHERE aa.response IS NOT NULL)   AS times_attempted,
  round(avg((aa.is_correct)::int)::numeric * 100, 1) AS pct_correct,
  round(avg(aa.time_spent_ms) / 1000.0, 1)           AS avg_time_s,
  q.expected_time_s
FROM attempt_answers aa
JOIN attempts a  ON a.id = aa.attempt_id AND a.status <> 'in_progress'
JOIN questions q ON q.id = aa.question_id
GROUP BY aa.question_id, q.subject, q.chapter, q.topic, q.difficulty, q.expected_time_s;

-- Percentile / rank within a test (§4.1 of the brief)
CREATE VIEW v_test_ranks AS
SELECT
  a.test_id, a.student_id, a.attempt_no, a.total_marks,
  rank()              OVER (PARTITION BY a.test_id ORDER BY a.total_marks DESC) AS rank,
  round(100 * percent_rank() OVER (PARTITION BY a.test_id
                                   ORDER BY a.total_marks), 1)                  AS percentile
FROM attempts a
WHERE a.status IN ('submitted', 'auto_submitted');
```

No dedicated analytics tables. `attempt_answers` already contains everything the analytics screens need; two window-function views cover percentile, rank, and difficulty calibration without denormalized counters or triggers.

### 4.9 Row-Level Security

```sql
ALTER TABLE questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION is_teacher() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher');
$$;

-- All five teachers, full access. Students: none — ever.
CREATE POLICY q_teacher_all ON questions FOR ALL USING (is_teacher());

-- A student sees only their own attempts.
CREATE POLICY a_student_own ON attempts
  FOR SELECT USING (student_id = auth.uid() OR is_teacher());

CREATE POLICY aa_student_own ON attempt_answers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM attempts a
            WHERE a.id = attempt_id AND (a.student_id = auth.uid() OR is_teacher()))
  );
```

Students have **no read policy on `questions` at all**. There is no query a student's JWT can construct that returns an answer key — question content reaches them only through server routes using the service role, which explicitly project out `answer` and `solution`.

---

## 5. API Design

Next.js Route Handlers, authenticated via httpOnly session cookie. `T` = teacher, `S` = student.

### 5.1 Papers and ingestion

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/papers` | T | Register a paper from a Drive share link; resolves `drive_file_id` |
| GET | `/api/papers/:id/pdf` | T | Streams PDF bytes server-side from Drive (service account) for the viewer/crop tool |
| POST | `/api/papers/:id/ingest` | T | Validate + stage pasted Gemini JSON |
| GET | `/api/questions` | T | Filter by subject/chapter/topic/difficulty/type/status; paginated |
| PATCH | `/api/questions/:id` | T | Update any field; requires `updated_at` for the concurrency check |
| POST | `/api/questions/:id/images` | T | Upload a crop; resolve a placeholder |
| DELETE | `/api/questions/:id/images/:imageId` | T | Remove a crop |
| POST | `/api/questions/:id/verify` | T | Run gate checks; set status `verified` |

**`POST /api/papers`**

```jsonc
// Request
{ "title": "JEE Main 2023 Jan 24 Shift 1", "examYear": 2023,
  "driveLink": "https://drive.google.com/file/d/1AbCdEf.../view" }

// 201
{ "id": "paper-uuid", "driveFileId": "1AbCdEf...", "pdfPages": 24 }

// 403 — service account cannot access the file
{ "error": "drive_access_denied",
  "message": "Share this file with jee-app@<project>.iam.gserviceaccount.com" }
```

**`POST /api/papers/:id/ingest`**

```jsonc
// Request
{
  "questions": [
    {
      "sourceQno": 12, "subject": "physics", "type": "mcq",
      "body": "A solid sphere of mass $m$ and radius $R$ rolls ... [[IMG:p12_1]]",
      "options": [
        { "key": "A", "body": "$\\frac{2}{5}mR^2$" },
        { "key": "B", "body": "$\\frac{7}{5}mR^2$" },
        { "key": "C", "body": "$\\frac{2}{3}mR^2$" },
        { "key": "D", "body": "$mR^2$" }
      ],
      "imagePlaceholders": [{ "id": "p12_1", "hint": "inclined plane with sphere at top" }],
      "uncertain": ["subscript on second term of option B unclear"]
    }
  ]
}

// 200
{ "created": 75, "questionIds": ["...", "..."],
  "warnings": [{ "sourceQno": 12, "field": "options[1].body", "message": "LaTeX compiled with warnings" }] }

// 422 — nothing saved
{ "error": "validation_failed",
  "issues": [
    { "path": "questions[7].type",  "message": "expected 'mcq' | 'integer', got 'numerical'" },
    { "path": "questions[41].body", "message": "unclosed $ delimiter" }
  ] }
```

422 is all-or-nothing: partially ingesting 68 of 75 questions leaves the teacher reconciling which seven are missing, which is worse than fixing the JSON once and re-pasting.

### 5.2 Test management

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/tests` | T | Create draft test |
| PUT | `/api/tests/:id/questions` | T | Set question list, positions, per-question marks |
| PATCH | `/api/tests/:id` | T | Duration, window, shuffle flags, retake policy |
| POST | `/api/tests/:id/publish` | T | Validate all questions verified; publish |
| POST | `/api/tests/:id/release-results` | T | Set `released_at` when policy is `on_release` |
| GET | `/api/tests/available` | S | Tests open to this student, with attempts-remaining |

### 5.3 Attempt lifecycle

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/tests/:id/attempts` | S | Start attempt; returns id + deadline + materialized ordering |
| GET | `/api/attempts/:id/questions` | S | Full payload, **answer key stripped** |
| PATCH | `/api/attempts/:id/answers` | S | Batched autosave |
| POST | `/api/attempts/:id/submit` | S | Grade and finalize |
| GET | `/api/attempts/:id/result` | S | Review payload incl. answers + solutions |
| POST | `/api/cron/sweep-expired` | — | Vercel Cron; auto-submit overdue attempts |

**`POST /api/tests/:id/attempts`** — the security-critical route.

```jsonc
// 201
{
  "attemptId": "…", "serverTime": "2026-08-29T09:00:00.000Z",
  "deadlineAt": "2026-08-29T12:00:00.000Z",
  "questionOrder": ["q-uuid-…", "…"],
  "instructions": {
    "totalQuestions": 75, "durationS": 10800,
    "markingScheme": [
      { "type": "mcq", "correct": 4, "wrong": -1, "unattempted": 0 },
      { "type": "integer", "correct": 4, "wrong": 0, "unattempted": 0 }
    ]
  }
}
```

Server steps: verify window is open → verify `attempt_no <= max_attempts` → compute `deadline_at = now() + duration_s` → generate and persist `question_order`/`option_orders` → pre-insert all `attempt_answers` rows at `not_seen`. Pre-inserting every row means autosave is always `UPDATE`, never a race-prone upsert, and "not seen" is a real recorded state rather than an absence.

**`GET /api/attempts/:id/questions`** returns body, options (pre-shuffled per-student, original keys intact), image signed URLs, and marks — **never** `answer`, `solution`, or `difficulty`. A student inspecting network traffic learns nothing about the correct answer.

**`PATCH /api/attempts/:id/answers`** — autosave, batched, idempotent. `timeSpentMs` is sent as a **cumulative total per question**, not a delta, so replay after a dropped connection can never double-count; the server keeps `max(existing, incoming)`.

**`POST /api/attempts/:id/submit`** — the only route that reads `questions.answer`:

```
1. Reject if already submitted (idempotent: return the existing result).
2. Load attempt_answers + questions.answer via the service role.
3. Grade each row: no response → marks_unattempted; MCQ → key match;
   integer → exact value or within {min,max} range.
4. Sum → attempts.total_marks; set status, submitted_at, total_time_s.
5. One transaction. Return the result summary.
```

### 5.4 Analytics

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/analytics/student/me` | S | Cross-test trend, subject/chapter accuracy, time profile |
| GET | `/api/analytics/tests/:id` | T | Distribution, completion, per-question stats |
| GET | `/api/analytics/cohort` | T | Leaderboard, class-wide weak chapters |
| GET | `/api/analytics/calibration` | T | Assigned difficulty vs. observed % correct |
| GET | `/api/analytics/tests/:id/export.csv` | T | CSV export |

---

## 6. Gemini Extraction Prompt

Two schemas: **`IngestQuestion`** (what Gemini produces — extraction fields only) and **`Question`** (what the database stores — adds teacher-supplied pedagogy fields). `questionId` is app-generated; `answer`, `difficulty`, `expectedTime`, `solution`, `topic`, `chapter` are teacher-supplied, never asked of the model — a plausible-looking guessed answer key is more dangerous than none, because it looks authoritative and a tired reviewer will wave it through.

```text
You are a precise document-extraction tool. You are given a scanned PDF of a
JEE Mains question paper (Physics, Chemistry, Mathematics). Extract every
question into strict JSON.

OUTPUT CONTRACT
Return ONLY a JSON object. No prose, no explanation, no markdown code fences.
The first character of your response must be { and the last must be }.

SCHEMA
{
  "paperMeta": { "detectedTitle": string|null, "totalQuestionsFound": integer },
  "questions": [
    {
      "sourceQno": integer,
      "subject": "physics"|"chemistry"|"maths",
      "type": "mcq"|"integer",
      "body": string,
      "options": [ { "key": "A"|"B"|"C"|"D", "body": string } ],
      "imagePlaceholders": [ { "id": string, "hint": string } ],
      "uncertain": [string]
    }
  ]
}

RULES

1. COMPLETENESS
   Extract every question. Do not skip, summarize, merge, or invent
   questions. Preserve the printed question number in sourceQno.

2. TYPE
   "mcq" has four printed options. "integer" has a numerical-value answer
   with no printed options — options MUST be [] for "integer".

3. MATHEMATICS — LaTeX for KaTeX
   Inline math: $x^2 + 2x$    Display math: $$\int_0^1 x^2\,dx$$
   Escape backslashes for JSON: "$\\frac{a}{b}$".
   Use \frac, \sqrt, \int, \sum, \lim, \vec, \hat, \times, \cdot, \pm, \Delta,
   \theta, \alpha, \infty, \le, \ge, \ne, \approx, \propto.
   Matrices: \begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}
   Units upright: "$5\\,\\mathrm{m/s^2}$".
   Preserve subscripts/superscripts exactly; if ambiguous, pick the more
   likely reading and flag it in "uncertain".

4. CHEMISTRY — mhchem syntax
   "$\\ce{H2SO4}$"   "$\\ce{2H2 + O2 -> 2H2O}$"
   "$\\ce{CH3CH2OH ->[H2SO4][\\Delta] CH2=CH2 + H2O}$"
   "$\\ce{A <=> B}$"   Oxidation states: "$\\ce{Fe^3+}$"
   Do NOT draw or describe structural diagrams (benzene rings, chair
   conformations, Newman projections, stereochemistry, mechanism arrows).
   Every structural diagram is an IMAGE — see rule 5.

5. IMAGES — placeholders only
   Wherever a figure, diagram, graph, circuit, structural formula, or
   table-as-image appears, insert inline at the exact position:
       [[IMG:q<sourceQno>_<n>]]
   List it in imagePlaceholders with a 5–12 word factual hint.
   NEVER describe the figure in "body" instead of placing a placeholder.
   NEVER omit a placeholder because the figure seems decorative.

6. MULTI-PART QUESTIONS
   Parts (i), (ii), (iii) stay one question object; preserve labels with
   \n. Match-the-column with text columns → markdown table; if either
   column is a diagram, use an image placeholder.

7. UNCERTAINTY
   Flag anything you're not confident about: illegible characters,
   ambiguous sub/superscripts, unclear option boundaries, possible
   page-break text loss, a guessed symbol. Be liberal — a flagged question
   costs the teacher 20 seconds; an unflagged wrong one costs a student
   marks.

8. WHAT NOT TO PRODUCE
   No answers, correct options, solutions, difficulty ratings, topic tags,
   chapter tags, expected time, or question IDs. These are supplied by a
   human afterwards.

9. TEXT FIDELITY
   Reproduce wording exactly. No grammar correction, no rewording, no
   digit changes.

Begin. Output only the JSON object.
```

**Operating notes:**

- Process 20–25 pages per request, split by subject section, not a whole 40-page paper — long documents degrade mid-document attention and risk truncated JSON.
- If output truncates, prompt: *"Continue the JSON from exactly where you stopped. Output only the remaining array elements, no wrapper object, no repetition."* Stitch client-side. Prefer smaller chunks so this never happens.
- Validate before pasting — the app's Zod schema rejects malformed JSON with per-field errors in under a second; a linter pass locally is faster still.
- Version the prompt (`prompts/extract-v1.txt`) and record which version produced each paper in `papers.extraction_meta`, so a future prompt improvement doesn't silently mean two eras of papers were extracted differently without a record of it.
- Never let Gemini produce answers even if it volunteers them — a mostly-correct, invisible-failure answer key is worse than none.

---

## 7. Key Workflows

### 7.1 Timer — server-authoritative

```
Start:   server returns serverTime + deadlineAt; client renders a
         countdown from (deadlineAt - (Date.now() + clockOffset)).
Enforce: every autosave and submit re-check now() > deadline_at server-side.
         A changed device clock or a backgrounded phone gains nothing.
Sweep:   Vercel Cron every 5 min auto-submits any in_progress attempt
         past deadline, so an abandoned tab still gets graded.
```

Per-question time, client side, using `performance.now()` (immune to system clock changes), paused while the tab is hidden:

```
On question mount:                    activeSince = performance.now()
On unmount / navigate away / blur:    accumulated[qid] += now - activeSince
On visibilitychange → hidden:         stop accumulating, log event
On visibilitychange → visible:        resume, log event
```

### 7.2 Autosave and disconnect-resume

```
Client: single in-memory store, mirrored to IndexedDB on every change.
Flush:  answer change (300ms debounce) · flag toggle · navigation ·
        15s heartbeat · visibilitychange · beforeunload (sendBeacon)
Offline: keep the pending batch in IndexedDB, show a quiet "saving…"
         indicator (never a modal mid-exam), retry with backoff.
Reconnect: flush the full cumulative state; server's max() makes replay safe.
Resume:  GET /api/attempts/:id returns server truth; client reconciles by
         taking the more-advanced of local-IndexedDB vs. server per question.
```

### 7.3 Palette state machine

```
not_seen ──open──► seen_unanswered ──answer──► answered ◄──unflag── answered_flagged
                          │                                              ▲
                        flag                                           flag
                          ▼                                              │
                  flagged_unanswered ─────────────────answer─────────────┘
```

`answered_flagged` is a first-class state — students routinely answer and flag the same question, and forcing a choice between the two is immediately, obviously wrong in a JEE-style interface. On mobile, the 75-cell palette collapses to a bottom sheet behind a persistent counter button (`Answered 42 · Flagged 6 · Left 27`).

### 7.4 Shuffle and scoring

`question_order` and `option_orders` are generated once at attempt start and persisted (§4.7). Responses always store the **original option key**, so grading compares `response.key` to `answer.key` directly with no un-permutation step, and the review screen replays the stored orders so the student sees exactly what they saw during the exam. Marks come from `test_questions` (§4.6); integer answers parse numerically before comparison, never as strings, so `"42.0"` matches `"42"`.

### 7.5 Solution review

Gated on `tests.results_policy`: `on_release` returns `403 awaiting_release` until `released_at` is set — otherwise a student could read a submitted attempt's answer key and relay it to a classmate in a later slot. Screen shows, per question: body, the student's answer, correct answer, marks awarded (colour-coded), the full worked solution, time taken vs. `expected_time_s` (flagged at >1.5×), and difficulty, filterable by subject/status/chapter.

---

## 8. Non-Functional Requirements

### 8.1 Security and access control

| Risk | Control |
|---|---|
| Student reads answer keys | RLS gives students no read policy on `questions`; content is served only via server routes that project away `answer`/`solution`; grading is exclusively server-side |
| Student reads another student's attempt | RLS `student_id = auth.uid()` |
| Student reaches raw storage | Images: private bucket, 1-hour signed URLs, minted only for entitled questions. PDFs: never touch app storage at all — they're in Drive behind a service account the client never sees. |
| Two teachers silently overwrite each other's edit | Optimistic concurrency on `questions.updated_at` (§4.4) |
| Answer key leak via result endpoint | `results_policy` gate enforced server-side (§7.5) |
| Secret leakage | Supabase service-role key and the Drive service-account credential are server-only; anything prefixed `NEXT_PUBLIC_` is in the browser bundle — audit before launch |

### 8.2 Reliability

Autosave + IndexedDB + cumulative-value idempotency caps worst-case loss at 15 seconds (§7.2). The Cron sweep auto-submits abandoned attempts. Submit is idempotent. All grading runs in one transaction. **Test the disconnect path deliberately**: start an attempt, answer 10 questions, enable airplane mode, answer 5 more, kill the browser, reopen, reconnect — all 15 must be present. This is the single most important manual test in the project.

### 8.3 Scalability (50 → 500+ students)

Use the Supabase connection pooler (Supavisor/PgBouncer) from day one, not the direct connection string — serverless-functions-times-Postgres-connections is the standard failure mode and costs nothing to avoid up front. Materialize `v_test_ranks` only if a dashboard feels slow at higher volume. Nothing else in this design needs to change before roughly 2,000 students.

### 8.4 Anti-cheating

Per-student question and option shuffle (§7.4) is the most effective control here — it breaks neighbour-copying and answer-sharing directly. Server-side-only answer keys (§8.1) close the client-inspection route entirely. Tab-switch and fullscreen-exit are **logged, not enforced** — auto-submitting on blur will fire on notifications and Android keyboard quirks and will wrongly kill legitimate attempts; a blur count surfaced to the teacher is a better trade than a false-positive failure. Nothing here claims to be cheat-proof against a student with a second device — the goal is to make casual cheating inconvenient and give the teacher signal, not to proctor.

### 8.5 Backup, versioning, retention

Supabase Free provides no reliable point-in-time recovery — run a nightly `pg_dump` from a scheduled script to any cheap cold storage (or the same Drive folder structure, since it's already in use and free), retaining 30 daily + 12 monthly. Add a `question_revisions` table written by an update trigger (question_id, revision, snapshot, edited_by, edited_at) — with five teachers editing one bank, "who changed this and when" will come up. Attempts are kept indefinitely as the student's record; archive older than two years if the free-tier database size becomes a concern. Source PDFs need no backup policy from this app at all — they're Drive's responsibility, and Drive already versions and backs them up.

### 8.6 MVP vs. Phase 2

**MVP:**

| Included | Excluded |
|---|---|
| Auth, teacher-provisioned students, 5 teachers shared bank | Self-signup, social login, MFA |
| Drive paper registration + streamed PDF viewer | — |
| Paste-JSON ingest + Zod validation | In-app LLM API calls |
| Question editor + KaTeX/mhchem live preview + concurrency guard | Rich-text WYSIWYG |
| Crop-from-PDF placeholder resolution | Image editing tools |
| Draft → verified gate | Multi-reviewer approval workflow |
| Test builder: select, marks, negative marks, duration, schedule | Auto-generated tests |
| Question + option shuffle | — |
| Test runner: timer, full palette, autosave, resume, auto-submit | — |
| Server-side grading | — |
| Review screen with solutions + filters | — |
| Student analytics: score, subject/chapter accuracy, time | Percentile trend charts |
| Teacher analytics: distribution, per-question % correct, leaderboard | Difficulty calibration dashboard |
| CSV export | PDF report export |
| Fullscreen + blur logging | Proctoring, webcam |
| **3 digitized papers to prove the pipeline** | 100 papers |

**Phase 2** (after real usage shows what matters):

- Difficulty calibration dashboard; auto-suggest difficulty from observed % correct
- Practice mode: filter by chapter/difficulty, untimed, instant feedback
- Progress-over-time trend charts, weak-chapter revision recommendations
- Bulk tagging tools and keyboard-driven editor shortcuts — likely the highest-value single Phase 2 item, given the digitization time cost below
- PDF report cards
- Question revision history UI
- Timing-anomaly cheating flags
- PWA offline shell
- **The planned mobile app** — built against the existing `/api/*` contract and Supabase Auth session, no backend changes required (§1.4)

---

## 9. Build Order

Sequenced for an agentic coding tool, riskiest and least-reversible pieces first.

| Stage | Deliverable |
|---|---|
| 1 | Next.js + Supabase skeleton. Auth, roles for 5 teachers, RLS policies. Deploy to Vercel bom1. Verify a student JWT cannot read `questions`. |
| 2 | Schema + migrations. Google service account setup; `/api/papers` registration + `/api/papers/:id/pdf` streaming proxy. |
| 3 | PDF.js viewer + crop tool against a Drive-streamed PDF — the least-familiar piece, done early while there's time to change approach. |
| 4 | Ingest: Zod schema, paste screen, validation errors, draft staging. |
| 5 | Question editor + KaTeX/mhchem preview + verify gate + concurrency guard. **Digitize 3 real papers here.** |
| 6 | Test builder + publish. |
| 7 | Test runner: timer, palette, autosave, IndexedDB, resume. Deliberately test the disconnect path. |
| 8 | Server-side grading + review screen. |
| 9 | Analytics views + dashboards + CSV export. |
| 10 | Responsive pass on real devices. Backup script. `NEXT_PUBLIC_` secret audit. |
| 11 | Pilot: one real test with 5 students. Fix what breaks. Then scale digitization to 100 papers. |

---

## 10. Open Risks

| Risk | Mitigation |
|---|---|
| Digitization effort across 100 papers is the true bottleneck, not engineering | Ship with 3 papers; invest in editor speed (bulk tagging, keyboard shortcuts) before volume |
| Five teachers editing one bank causes silent overwrites | Optimistic concurrency check on every question update (§4.4) |
| Drive API quota or access hiccup blocks the crop tool mid-review | Service account with Editor access set up once, verified in Stage 2; `403 drive_access_denied` surfaces the exact fix |
| A student's attempt is lost to a network failure | Deliberate disconnect testing in build Stage 7 — the most trust-destroying possible failure |
| Vercel Hobby's non-commercial limit is breached without notice once monetized | Flag the Pro upgrade ($20/mo) as a pre-launch checklist item once the "future app" plan becomes real |

---

*End of document.*
