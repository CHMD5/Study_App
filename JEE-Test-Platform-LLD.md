# Low-Level Design: JEE & NEET Test Platform

**Version:** 3.0 (Definitive Live Architecture)  
**Date:** 11 September 2026  
**Status:** In Production / Fully Implemented  

---

## 0. Decided Parameters

| Parameter | Decision |
|---|---|
| **Teachers** | **Collaborative Faculty**, shared question bank across Physics, Chemistry, Mathematics, and Biology. Authorship tracked (`created_by`, `verified_by`, `last_edited_by`), optimistic concurrency enforced on every write. |
| **Students** | Teacher-provisioned, no self-signup. Provisioned individually or via bulk CSV upload with batch tag, phone number, and auto-generated or manual credentials. |
| **Subjects** | **4 subjects**: `physics`, `chemistry`, `maths`, `biology` (supporting both JEE Main/Advanced and NEET examinations). |
| **Authentication** | **Dual-Engine Custom Session Auth**: Phone Number Sign-in for students (E.164 normalization, automatic provisioning, no OTP verification required for now, 90-day persistent browser session cookie) and Staff Portal at `/SRSMA` (username + salted scrypt password). Role-based access control (`teacher` vs `student`) stored in signed httpOnly cookies (`jose`). |
| **Source PDFs & Storage** | **Direct multipart upload** (up to 60 MB, sha256 deduplicated, page count computed via `pdf-lib`). Persisted to local/mounted disk storage under `DATA_DIR` (`data/papers/` and `data/images/`). |
| **Math/Chemistry Rendering** | **KaTeX + mhchem** for zero-layout-shift mathematical and chemical notation rendering. |
| **Extraction & Ingestion** | **Dual-Prompt Gemini Workflow** with Google AI Studio: (1) Question Ingestion Prompt and (2) Solution Ingestion Prompt with JSON repair utility. Verified in split-screen PDF.js Canvas Crop Studio. |
| **Test Engine** | Authentic JEE test runner: server-authoritative countdown timer, NTA-standard 5-state question palette, per-question timing accumulator, anti-cheating question & option shuffling, offline IndexedDB sync, and server-side atomic grading. |
| **Database** | **Dual-Engine PostgreSQL**: Embedded **PGlite** (`./data/pgdata`) for zero-config local development; connection-pooled **PostgreSQL** (`pg.Pool` on Supabase, Neon, Railway, or VPS) for production managed via **Drizzle ORM** (`drizzle/*.sql` and `src/db/schema.ts`). |
| **Future Mobile App** | Responsive installable web app today; clean RESTful JSON API contract (`/api/*`) enables native mobile app (React Native / Expo) without backend modifications. |

---

## 1. System Architecture

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLIENT — Next.js 15 App Router, Responsive PWA, Tailwind CSS v4             │
│                                                                             │
│ Teacher Portal (Desktop / Tablet)         Student Interface (Mobile/Desktop)│
│ ├─ PDF Upload & Deduplication (60MB)     ├─ Test Catalog & Available Tests  │
│ ├─ Split Review & Ingestion Studio       ├─ Instructions & System Checks    │
│ ├─ PDF.js Viewer + Canvas Crop Tool      ├─ JEE Test Runner (Timer/Palette) │
│ ├─ Question Bank & Taxonomy Management   ├─ Realtime Autosave (IndexedDB)   │
│ ├─ Test Builder (Paper Filter, Marks)    ├─ Result Review & KaTeX Solutions │
│ ├─ Student Management & Bulk CSV Import  └─ Personal Analytics & Scorecards │
│ └─ Cohort & Test Analytics Export                                           │
└───────────────────────┬───────────────────────────────┬─────────────────────┘
                        │ HTTPS, Signed Session Cookie  │ Image GET / Proxy
                        ▼                               │
┌───────────────────────────────────────────────────────┴─────────────────────┐
│ Next.js Route Handlers (Node.js Runtime)                                    │
│                                                                             │
│ /api/auth             Username/Password & Phone OTP sessions                │
│ /api/students         Roster CRUD & Bulk CSV provisioning                   │
│ /api/papers           Upload, Deduplication, PDF proxy, Ingest, Crop        │
│ /api/questions        Bank CRUD, Taxonomy, Bulk Tagging, Revisions, Images  │
│ /api/tests            Creation, Paper-filtered Question Picker, Clone, Live │
│ /api/attempts         Start, Shuffled Order, Answers Autosave, Submit, Grade│
│ /api/analytics        Score distributions, Accuracy breakdown, CSV exports  │
│ /api/cron             Sweep expired in-progress attempts                    │
└───────────────────────┬───────────────────────────────┬─────────────────────┘
                        ▼                               ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────────┐
│ PostgreSQL Database (Drizzle ORM)     │   │ Persistent Storage (DATA_DIR)   │
│                                       │   │                                 │
│ • profiles         • tests            │   │ /data/papers/                   │
│ • papers           • test_questions   │   │   └── <sha256>.pdf              │
│ • questions        • attempts         │   │                                 │
│ • question_images  • attempt_answers  │   │ /data/images/<question_id>/     │
│ • question_revs    • attempt_events   │   │   └── <placeholder_id>.png      │
└───────────────────────────────────────┘   └─────────────────────────────────┘
```

### 1.2 Source PDF Ingestion & Persistent Storage

Source PDFs are uploaded directly to `/api/papers` as multipart form data.
1. **Validation & Deduplication**: The server calculates the `sha256` hash of the binary buffer. If a paper with the identical hash exists, the upload is rejected with `409 Conflict`, avoiding redundant storage.
2. **Page Count Extraction**: The server loads the PDF using `pdf-lib` to determine the total page count (`pdf_pages`).
3. **Storage**: The file is stored to `DATA_DIR/papers/<sha256>.pdf` with write-streaming.
4. **Byte Streaming for Review**: The PDF.js viewer loads the file through `/api/papers/:id/pdf`. The client-side canvas enables pixel-accurate cropping of diagrams and figures directly into PNG assets stored under `DATA_DIR/images/<question_id>/<placeholder_id>.png`.

### 1.3 Multi-Teacher Model & Optimistic Concurrency

All teachers collaborate on a unified question bank. Permissions are role-based (`role = 'teacher'`).
- Authorship is tracked via `created_by`, `last_edited_by`, and `verified_by`.
- To prevent silent overwrites when multiple teachers review or edit questions simultaneously, updates use **optimistic concurrency control**: the client sends the last known `updated_at` timestamp. If the database record has a newer `updated_at`, the write is rejected with `409 Conflict (stale_write)`.

### 1.4 API Contract for Native Mobile Apps

All business logic, question shuffling, and grading reside exclusively in route handlers (`/api/*`). A future React Native or Flutter client connects to the exact same endpoints using session tokens, requiring zero backend adjustments.

---

## 2. Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | Server Components + Route Handlers, React 19, TypeScript 5.9 |
| **Styling** | Tailwind CSS v4 | CSS variables, responsive design, dark mode, high-contrast palette |
| **Icons** | Lucide React | Clean, standard UI icons |
| **Database** | PostgreSQL | Local, Neon, or Supabase connection pooled via Drizzle ORM |
| **ORM** | Drizzle ORM 0.44 | Typed schema definitions, relational queries, zero overhead |
| **Authentication** | Custom Scrypt & Phone OTP | `crypto.scrypt` with salt for passwords, Phone OTP with international normalization, HMAC-signed httpOnly session cookies |
| **PDF Processing** | `pdf-lib` & `pdfjs-dist` | `pdf-lib` for metadata/page counting; `pdfjs-dist` 4.10 with custom worker for browser canvas rendering |
| **Math & Chemistry** | KaTeX 0.16 + mhchem | Synchronous client-side rendering for mathematical notation and chemical equations |
| **Validation** | Zod 3.25 | Universal client and server schema validation |
| **Testing** | Vitest 3.2 | High-speed unit and integration tests (14 test suites, 94 tests) |

---

## 3. Infrastructure & Budget

| Component | Cost | Notes |
|---|---|---|
| **Next.js Hosting** | ₹0 | Self-hosted Node.js or Vercel Hobby |
| **PostgreSQL Database** | ₹0 | Local instance / Neon Free tier / Supabase Free tier |
| **File Storage** | ₹0 | Persistent local filesystem or attached volume |
| **Gemini Ingestion** | ₹0 | Google AI Studio free tier / Gemini Chat |
| **Domain** | ~₹80/month | Standard domain registration (~₹1,000/year) |
| **Total** | **< ₹100/month** | Well within the ₹1,000 monthly ceiling |

---

## 4. Data Model & Schema (PostgreSQL via Drizzle ORM)

### 4.1 Enums

```sql
CREATE TYPE user_role      AS ENUM ('teacher', 'student');
CREATE TYPE subject_enum   AS ENUM ('physics', 'chemistry', 'maths', 'biology');
CREATE TYPE qtype_enum     AS ENUM ('mcq', 'integer');
CREATE TYPE qstatus_enum   AS ENUM ('draft', 'verified', 'archived');
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'abandoned');
CREATE TYPE answer_state   AS ENUM ('not_seen', 'seen_unanswered', 'answered', 'answered_flagged', 'flagged_unanswered');
```

### 4.2 Profiles & Dual Authentication

```sql
CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL DEFAULT 'student',
  full_name     text NOT NULL,
  email         text NOT NULL UNIQUE,
  username      text NOT NULL UNIQUE,
  phone         text,
  password_hash text,
  batch         text,                        -- e.g. 'JEE-2027-A' or 'NEET-2026'
  is_active     boolean NOT NULL DEFAULT true,
  can_login     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

### 4.3 Source Papers

```sql
CREATE TABLE papers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  code              text NOT NULL UNIQUE,       -- e.g. 'JEE-2024-JAN-S1'
  exam_year         int,
  pdf_pages         int,
  file_path         text NOT NULL,              -- local relative path under DATA_DIR
  original_filename text NOT NULL,
  file_size_bytes   bigint NOT NULL,
  sha256            text NOT NULL UNIQUE,
  extraction_meta   jsonb,                      -- prompt version, model, question counts
  registered_by     uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

### 4.4 Questions

```sql
CREATE TABLE questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_code       text UNIQUE,                 -- e.g. 'JEE24-S1-P-001'
  paper_id         uuid REFERENCES papers(id) ON DELETE SET NULL,
  source_qno       int,
  source_page      int,

  subject          subject_enum NOT NULL,
  type             qtype_enum NOT NULL,
  status           qstatus_enum NOT NULL DEFAULT 'draft',

  body             text NOT NULL,               -- KaTeX math + [[IMG:placeholder]]
  options          jsonb NOT NULL DEFAULT '[]', -- [{key: 'A', body: '...'}, ...]
  answer           jsonb,                       -- {"key":"C"} | {"value":42} | {"min":3.1,"max":3.2}
  solution         text,                        -- Step-by-step worked KaTeX solution

  difficulty       smallint,                    -- 1 to 10 scale
  expected_time_s  int,                         -- Target time in seconds
  chapter          text,
  topic            text,

  extraction_notes jsonb,                       -- Uncertainty flags from extraction
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES profiles(id),
  last_edited_by   uuid REFERENCES profiles(id),
  verified_at      timestamptz,
  verified_by      uuid REFERENCES profiles(id)
);

CREATE INDEX questions_subject_status_idx ON questions (subject, status);
CREATE INDEX questions_chapter_topic_idx   ON questions (chapter, topic);
CREATE INDEX questions_difficulty_idx      ON questions (difficulty);
CREATE INDEX questions_paper_idx           ON questions (paper_id, source_qno);
```

### 4.5 Question Images

```sql
CREATE TABLE question_images (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  placeholder_id text NOT NULL,                -- matches [[IMG:...]] token in body
  storage_path   text NOT NULL,                -- relative path under DATA_DIR
  alt_text       text,
  width_px       int,
  height_px      int,
  source_page    int,
  crop_rect      jsonb,                        -- {x, y, w, h} coordinates
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, placeholder_id)
);
```

### 4.6 Question Revisions (Audit & History)

```sql
CREATE TABLE question_revisions (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision    int NOT NULL,
  snapshot    jsonb NOT NULL,
  edited_by   uuid REFERENCES profiles(id),
  edited_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, revision)
);
```

### 4.7 Tests & Test Questions

```sql
CREATE TABLE tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  duration_s        int NOT NULL,
  opens_at          timestamptz,
  closes_at         timestamptz,
  max_attempts      int NOT NULL DEFAULT 1,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options   boolean NOT NULL DEFAULT false,
  results_policy    text NOT NULL DEFAULT 'immediate', -- 'immediate' | 'on_release'
  released_at       timestamptz,
  is_published      boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE test_questions (
  test_id           uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position          int NOT NULL,
  marks_correct     numeric(5, 2) NOT NULL DEFAULT '4',
  marks_wrong       numeric(5, 2) NOT NULL DEFAULT '-1',
  marks_unattempted numeric(5, 2) NOT NULL DEFAULT '0',
  PRIMARY KEY (test_id, question_id),
  UNIQUE (test_id, position)
);
```

### 4.8 Attempts, Answers, & Anti-Cheating Telemetry Events

```sql
CREATE TABLE attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES tests(id),
  student_id     uuid NOT NULL REFERENCES profiles(id),
  attempt_no     int NOT NULL DEFAULT 1,

  started_at     timestamptz NOT NULL DEFAULT now(),
  deadline_at    timestamptz NOT NULL,
  submitted_at   timestamptz,
  status         attempt_status NOT NULL DEFAULT 'in_progress',

  question_order uuid[] NOT NULL,              -- Frozen student-specific order
  option_orders  jsonb NOT NULL DEFAULT '{}',  -- Per-question shuffled option keys
  total_marks    numeric(7, 2),
  max_marks      numeric(7, 2),
  total_time_s   int,

  UNIQUE (test_id, student_id, attempt_no)
);

CREATE TABLE attempt_answers (
  attempt_id     uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES questions(id),
  response       jsonb,                        -- {"key":"B"} or {"value":24}
  state          answer_state NOT NULL DEFAULT 'not_seen',
  time_spent_ms  int NOT NULL DEFAULT 0,
  visit_count    int NOT NULL DEFAULT 0,
  is_correct     boolean,
  marks_awarded  numeric(5, 2),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE attempt_events (
  id         bigserial PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_type text NOT NULL,                    -- 'tab_blur', 'tab_focus', 'fullscreen_exit'
  at         timestamptz NOT NULL DEFAULT now(),
  meta       jsonb
);
```

---

## 5. API Surface Specification

### 5.1 Authentication & Session Routes

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate with username and password, returns signed session cookie |
| `POST` | `/api/auth/logout` | User | Clears the session cookie |
| `GET` | `/api/auth/session` | User | Validates and returns current user profile session |
| `POST` | `/api/auth/phone/send-otp` | Public | Sends or simulates 6-digit OTP to normalized phone number |
| `POST` | `/api/auth/phone/verify-otp` | Public | Verifies OTP and issues session cookie for student |

### 5.2 Student Provisioning & Bulk Management

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/students` | Teacher | List all students with batch and account status |
| `POST` | `/api/students` | Teacher | Create a new student account |
| `POST` | `/api/students/bulk` | Teacher | Bulk CSV ingestion of student roster (name, username, phone, batch) |
| `PATCH` | `/api/students/:id` | Teacher | Update details, toggle `canLogin`, or reset password |

### 5.3 Papers & Ingestion Studio

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/papers` | Teacher | List all registered source papers |
| `POST` | `/api/papers` | Teacher | Upload PDF multipart (up to 60MB), sha256 check, extracts page count |
| `GET` | `/api/papers/:id` | Teacher | Get paper metadata and ingest status |
| `GET` | `/api/papers/:id/pdf` | Teacher | Stream raw PDF bytes to client PDF.js viewer |
| `POST` | `/api/papers/:id/ingest` | Teacher | Ingest structured Gemini JSON (questions or solutions) |
| `POST` | `/api/papers/:id/crop` | Teacher | Save canvas crop coordinates and write image file to disk |

### 5.4 Question Bank & Taxonomy

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/questions` | Teacher | Paginated question bank search with subject, type, status, and paper filters |
| `GET` | `/api/questions/taxonomy` | Teacher | Aggregated chapters, topics, and paper list with question counts |
| `PATCH` | `/api/questions/:id` | Teacher | Update question; validates optimistic lock via `updated_at` |
| `POST` | `/api/questions/:id/verify` | Teacher | Gated verification (ensures answer exists and placeholders resolved) |
| `POST` | `/api/questions/:id/images/:placeholder` | Teacher | Upload/replace PNG for inline `[[IMG:...]]` placeholder |
| `POST` | `/api/questions/bulk` | Teacher | Bulk actions (set chapter, set difficulty, bulk delete) |

### 5.5 Test Management & Test Builder

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/tests` | Teacher | List all tests with attempt counts and publish status |
| `POST` | `/api/tests` | Teacher | Create new test with title, duration, schedule, and shuffle options |
| `GET` | `/api/tests/:id` | Teacher | Get test configuration and assigned question list |
| `PATCH` | `/api/tests/:id` | Teacher | Update test settings (duration, open/close window, shuffle flags) |
| `PUT` | `/api/tests/:id/questions` | Teacher | Atomic replace of assigned questions and custom marks schemes |
| `POST` | `/api/tests/:id/publish` | Teacher | Publish gate: enforces all assigned questions are verified |
| `DELETE` | `/api/tests/:id/publish` | Teacher | Unpublish test, withdrawing it from student view |
| `POST` | `/api/tests/:id/clone` | Teacher | Duplicate test and question order for a new cohort |
| `POST` | `/api/tests/:id/release-results` | Teacher | Release or revoke solutions when results policy is `on_release` |

### 5.6 Attempt Lifecycle & Server-Side Grading

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/tests/available` | Student | List tests open to current student with remaining attempt counts |
| `POST` | `/api/tests/:id/attempts` | Student | Start attempt: locks deadline, persists student-specific question/option order |
| `GET` | `/api/attempts/:id/questions` | Student | Load test questions in assigned order with **answer key stripped** |
| `PATCH` | `/api/attempts/:id/answers` | Student | Batched autosave of question responses, visit counts, and cumulative time |
| `POST` | `/api/attempts/:id/submit` | Student | Server-side transaction: grades all responses against answer key |
| `GET` | `/api/attempts/:id/result` | Student | Review scorecard, KaTeX solutions, and peer percentile (subject to policy) |
| `POST` | `/api/cron/sweep-expired` | System | Auto-submits overdue in-progress attempts past deadline |

---

## 6. Extraction Prompts & Gemini Ingestion Contracts

The ingestion studio supports two distinct prompts: **Question Ingestion** and **Solution Ingestion**.

### 6.1 Question Extraction Prompt (v2)

Extracts problem text, MCQ options, math, chemistry, and image placeholders:
```json
{
  "paperMeta": { "detectedTitle": "string", "totalQuestionsFound": 30 },
  "questions": [
    {
      "sourceQno": 1,
      "subject": "physics",
      "type": "mcq",
      "body": "A uniform cylinder of radius $R$ rolls without slipping... [[IMG:q1_1]]",
      "options": [
        { "key": "A", "body": "$\\frac{1}{2}mR^2$" },
        { "key": "B", "body": "$\\frac{3}{4}mR^2$" },
        { "key": "C", "body": "$\\frac{2}{5}mR^2$" },
        { "key": "D", "body": "$mR^2$" }
      ],
      "imagePlaceholders": [{ "id": "q1_1", "hint": "cylinder on incline diagram" }],
      "uncertain": []
    }
  ]
}
```

### 6.2 Solution Extraction Prompt

Extracts official answer keys and step-by-step explanations, matched by `sourceQno`:
```json
{
  "solutions": [
    {
      "sourceQno": 1,
      "subject": "physics",
      "answer": "B",
      "solution": "Step 1: Write equation of rolling motion...\n$$a_{cm} = \\frac{g\\sin\\theta}{1 + I/mR^2}$$\nStep 2: Substitute moment of inertia...",
      "imagePlaceholders": []
    }
  ]
}
```

### 6.3 Mathematical & Chemical Notation Standards
- **KaTeX**: Inline expressions use `$x^2$`, display math uses `$$\int_0^1 f(x)dx$$`.
- **mhchem**: Chemical reactions and formulas use `$\ce{...}$`, e.g., `$\ce{CH3COOH <=> CH3COO- + H+}$`.
- **Images**: Preserved as clean text tokens `[[IMG:placeholder_id]]` within markdown.

---

## 7. Key Workflows & Engineering Mechanics

### 7.1 Test Builder: "Add from Bank", Paper Filtering & Sequence Sorting

The Test Builder (`/teacher/tests/[id]`) provides a rapid test construction workflow:
1. **Multi-Criteria Filter**: Filter question bank items by **Search Query**, **Subject**, **Question Type**, **Verification Status**, and **Source Paper**.
2. **Paper Dropdown with Counts**: The Paper filter displays all ingested papers with real-time counts of available questions (e.g. `JEE-2024-JAN-S1 — JEE Main 2024 Shift 1 (30)`).
3. **Paper Sequence Sorting**: When filtered to a specific paper, questions automatically sort by `sourceQno` ascending (`Q1, Q2, Q3...`), mirroring the original paper layout.
4. **1-Click Batch Ingestion**: Teachers can click **"Add All Filtered Verified"** to pull an entire paper's verified questions into the test in a single click.
5. **Provenance Badges**: Assigned questions and bank cards display origin paper badges (`📄 JEE-2024-S1 • Q12`) for complete traceability.

### 7.2 Server-Authoritative Exam Timer & Auto-Sweep

1. **Attempt Start**: Server computes `deadline_at = now() + test.duration_s` and returns the server's current time.
2. **Client Countdown**: The client displays a countdown synchronized with the calculated clock offset. Altering the device clock has zero effect.
3. **Server Gate**: Every autosave and submit endpoint verifies `now() <= deadline_at + 30s` (grace period for network latency).
4. **Sweep Cron**: A background sweep job automatically grades and closes any abandoned attempts past their deadline.

### 7.3 Palette State Machine (NTA JEE Standard)

The student test runner palette follows the official 5-state NTA exam model:
```
not_seen ──open──► seen_unanswered ──answer──► answered ◄──unflag── answered_flagged
                          │                                              ▲
                        flag                                           flag
                          ▼                                              │
                  flagged_unanswered ─────────────────answer─────────────┘
```
- **Not Visited (Grey)**: `not_seen`
- **Not Answered (Red)**: `seen_unanswered`
- **Answered (Green)**: `answered`
- **Marked for Review (Purple)**: `flagged_unanswered`
- **Answered & Marked for Review (Purple with Green Dot)**: `answered_flagged` (evaluated in scoring).

### 7.4 Autosave, IndexedDB Mirror & Replay Idempotency

- Every response change is written to local `IndexedDB` immediately.
- A debounced network worker flushes batches to `/api/attempts/:id/answers`.
- Time tracking sends cumulative milliseconds per question (`timeSpentMs`). The server applies `greatest(existing, incoming)`, guaranteeing that connection drops and replays never duplicate time.

### 7.5 Dynamic Question & Option Shuffling

- When enabled, questions and MCQ options (A/B/C/D) are randomized uniquely for each student at the moment the attempt begins.
- The resulting permutations are permanently recorded in `attempts.question_order` and `attempts.option_orders`.
- The student's recorded answer stores the original question's canonical option key, ensuring grading is direct, robust, and reproducible.

### 7.6 Solution Release Policy

- `results_policy = 'immediate'`: Score and full KaTeX solutions appear immediately upon test submission.
- `results_policy = 'on_release'`: Submissions display a confirmation screen. Solutions and peer rankings remain hidden with `403 Forbidden` until the teacher triggers **"Release Results"** (`/api/tests/:id/release-results`).

### 7.7 Phone Authentication & Persistent Session Lifecycle

1. **Phone Input**: User enters mobile number with country code selector (`+91` default, international selector, or custom prefix) on `/login`.
2. **Normalization**: System normalizes input into E.164 international format (`normalizePhone`).
3. **Instant Auto-Provisioning (No OTP Required)**: Existing student accounts are authenticated directly. New phone numbers are auto-provisioned immediately with the `student` role, zero passwords, and immediate dashboard access.
4. **Persistent 90-Day Browser Memory**: A signed JWT session cookie (`vtp_session`) is issued with `maxAge = 90 days` and an explicit `expires` timestamp. Returning students are remembered across browser sessions and redirected straight to `/student` without being prompted to sign in again unless they click "Logout".
5. **Staff Role Separation**: Faculty and administration credentials authenticate exclusively through `/SRSMA`. Attempting to use a faculty phone number on the student portal is rejected with `403 Forbidden`.

---

## 8. Non-Functional Requirements & Security

### 8.1 Security & Data Isolation
- **Answer Key Security**: Answer keys are never transmitted to students during active tests. The student attempt payload (`/api/attempts/:id/questions`) explicitly projects out `answer` and `solution`.
- **Password Security**: Passwords are saved with salted `crypto.scrypt` hashes. Authentication responses return constant-time generic failures to prevent username enumeration.
- **Role Isolation**: API endpoints verify session roles (`apiTeacher()` vs `apiStudent()`) using server-signed cookies. Students cannot access teacher routes or view other students' attempts.

### 8.2 Reliability & Fault-Tolerant Recovery
- If a student loses network connectivity during an exam, answers persist in `IndexedDB`.
- Upon re-opening the browser or reconnecting, the client pulls the server state, merges uncommitted local changes, and resumes without loss.

### 8.3 Concurrency & Database Locking (`withDbLock`)
- Critical state transitions (test question rearrangement, grading submissions, student provisioning) run inside transactional locks (`withDbLock`) to prevent race conditions and partial writes.

---

## 9. Current Implementation Status & Capabilities Matrix

| Feature Module | Implementation Status | Notes |
|---|---|---|
| **Dual Auth & Phone Auth** | Complete (Production) | Student phone login with 90-day browser memory + Staff portal at `/SRSMA` |
| **Student Bulk CSV Import** | Complete (Production) | Provisioning with batch allocation and validation |
| **PDF Ingestion & Canvas Crop** | Complete (Production) | PDF.js canvas viewer, direct PNG generation, deduplication |
| **Dual Gemini Ingestion** | Complete (Production) | Question and Solution prompts with JSON repair |
| **Question Bank & Taxonomy** | Complete (Production) | Chapters, topics, difficulty, bulk tagging, KaTeX preview |
| **Test Builder & Paper Filter** | Complete (Production) | Filter by paper, sequence sorting, 1-click batch add, clone test |
| **JEE Exam Runner & Palette** | Complete (Production) | Authentic 5-state palette, server timer, offline IndexedDB sync |
| **Server-Side Grading** | Complete (Production) | Atomic transactional evaluation, marks schemes, results policy |
| **Analytics & Export** | Complete (Production) | Student scorecards, cohort weak-chapter breakdown, CSV exports |
| **Dual-Engine DB & Prod Cron** | Complete (Production) | PGlite local + PostgreSQL pool prod; `/api/cron/sweep-expired` endpoint |

---

## 10. Production Operations & Rollout Protocol

### 10.1 Environment Variables
Production deployments require the following environment variables (see `.env.production.example`):
- `DATABASE_URL`: Connection string to managed PostgreSQL (Supabase, Neon, Railway, or AWS RDS).
- `SESSION_SECRET`: 32+ character cryptographic secret to sign session cookies.
- `COOKIE_SECURE`: Set to `true` for production HTTPS environments.
- `CRON_SECRET`: Bearer token authorizing the auto-submit cron at `/api/cron/sweep-expired`.
- `DATA_DIR`: Mounted persistent directory for source PDFs and diagram crops (defaults to `./data`).

### 10.2 Database Operations
- **Migrations**: `npm run migrate` executes all SQL migrations against the active database.
- **Admin Seeding**: `npm run seed:admin` provisions or updates the staff administrator account cleanly without inserting sample mock data.

### 10.3 Scheduled Exam Timer Sweeps
- On Vercel: Configured via `vercel.json` (`schedule: "*/2 * * * *"` targeting `/api/cron/sweep-expired`).
- On VPS / Railway / External Monitors: Invoke `POST /api/cron/sweep-expired` with header `Authorization: Bearer <CRON_SECRET>` every 1 to 2 minutes.

For the exhaustive walkthrough and hosting setup, refer to [PRODUCTION-SETUP-GUIDE.md](file:///c:/Users/panga/OneDrive/Desktop/Seva/SRSMA/Study_App/PRODUCTION-SETUP-GUIDE.md).

---

*End of Architecture Document.*
