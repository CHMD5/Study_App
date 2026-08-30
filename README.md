# Vidya Test Prep — JEE Mains Test Platform (Local Build)

A full-featured, local-first JEE Mains Computer-Based Test (CBT) platform prototype. Built to run **entirely on your machine** — no cloud dependencies, no external databases, no paid subscriptions, and no API keys required.

All runtime state (embedded Postgres database, source PDFs, cropped diagrams, and backups) lives locally on disk under `data/`.

---

## Quick Start

### 1. Prerequisites
- **Node.js 20+** (tested on Node 22 and 24)
- **npm 10+**

### 2. Installation & Seed

```bash
# 1. Install dependencies
npm install

# 2. Seed database (creates accounts, demo paper, and sample tests with attempts)
npm run seed

# 3. Start development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

> 💡 **Note:** `npm run seed` and `npm run dev` cannot hold the embedded database lock simultaneously. Run `seed` before starting `dev`, or stop the dev server before re-seeding.

---

## Logins & Credentials

| Username | Password | Role | Description |
|---|---|---|---|
| `Teacher` | `112345` | **Teacher** | Paper digitization, question bank, test builder, cohort analytics |
| `Student` | `112345` | **Student** | Timed CBT test runner, solutions review, performance analytics |

*(These are development credentials seeded locally — delete them before any production deployment).*

---

## How to Use as a Teacher

### 1. Digitize a Question Paper
1. **Upload Paper**: Navigate to **Papers** (`/teacher/papers`) and upload a PDF of a JEE Mains question paper.
2. **Extraction Prompt**: Navigate to **Extraction Prompt** (`/teacher/extraction-prompt`) and click **Copy Prompt**. Open Gemini / Claude in a browser tab, attach the PDF, and run the prompt to generate structured JSON.
3. **Ingest**: On the paper's **Ingest** tab (`/teacher/papers/[id]/ingest`), paste the JSON. The built-in Zod validator checks syntax with instant error highlighting before staging questions as drafts.
4. **Crop Figures & Verify**:
   - Open questions in the **Question Editor** (`/teacher/questions/[id]`).
   - The split-screen displays the PDF canvas on the left and KaTeX math preview on the right.
   - Drag a selection rectangle on the PDF canvas to crop diagrams for any `[[IMG:...]]` placeholder.
   - Enter the answer key and pedagogy tags, then click **Verify Question**.

---

### 2. Build & Publish a Test
1. **Create Test**: Navigate to **Tests** (`/teacher/tests`) and click **Create Test**.
2. **Configure Settings**: Set Title, Duration (e.g. 180 min), Active Window dates, Shuffle options, and Results Policy (*Immediate* vs *On Release*).
3. **Test Builder** (`/teacher/tests/[id]`):
   - Switch to the **Add from Bank** tab to search and filter questions by Subject (Physics, Chemistry, Maths), Chapter, Difficulty, or Type.
   - Reorder question positions and customize scoring schemes (+4 for correct, -1 for wrong, 0 for unattempted presets).
   - Click **Publish Test** (the Publish Gate guarantees that 100% of questions are verified before going live).

---

### 3. Review Analytics & Export CSV
1. **Test-Specific Dashboard** (`/teacher/tests/[id]/analytics`):
   - Score distribution histogram.
   - Ranked student leaderboard with percentile and time taken.
   - Question item calibration table (observing candidate % correct vs assigned difficulty).
   - Click **Export CSV** to download a complete spreadsheet of test scores.
2. **Cohort Overview** (`/teacher/analytics`):
   - View enrolled student performance across all tests.
   - Identify class-wide weak chapters that need priority revision.

---

## How to Use as a Student

### 1. Take a Timed JEE Mains CBT Test
1. Sign in as `Student` (`112345`) and view active exams on **My tests** (`/student`).
2. Click **Take Test** to open the **Instructions Screen** (`/student/tests/[id]`).
3. Read the marking scheme (+4 / -1 / 0) and the 5-color palette legend, check the declaration, and click **I am ready to begin**.
4. **Inside the Test Runner** (`/student/attempts/[id]`):
   - **Timer**: Server-authoritative countdown clock at the top.
   - **Subject Tabs**: Quickly switch between Physics, Chemistry, and Mathematics sections.
   - **Palette**: 75-cell quick-navigation grid showing:
     - 🟩 **Green**: Answered
     - 🟥 **Red**: Not Answered (Seen)
     - 🟪 **Purple**: Marked for Review
     - 🟪🟢 **Purple with Dot**: Answered & Marked for Review
     - ⬜ **Grey**: Not Visited
   - **Actions**: Use **Save & Next**, **Mark for Review & Next**, or **Clear Response**.
   - **Offline Disconnect Resilience**: In-memory state is continuously mirrored to `IndexedDB` and autosaved. If internet or server connection drops, you can continue answering uninterrupted.
   - **Submit**: Click **Submit Test** in the header to review your subject-wise attempt summary modal, then confirm submission.

---

### 2. Review Worked Solutions & Scorecard
1. Immediately upon submission (or after teacher release), open the **Scorecard & Solutions** review (`/student/attempts/[id]/result`).
2. Inspect your total marks, rank, percentile, and subject breakdowns.
3. Review question-by-question solutions with step-by-step KaTeX math, side-by-side answer comparisons, and overtime flags (>1.5x expected time).
4. Filter questions by *Correct*, *Wrong*, *Unattempted*, or *Overtime*.

---

### 3. Student Personal Analytics
1. Navigate to **Analytics** (`/student/analytics`).
2. Track your **Score Progression Curve** over successive mock tests.
3. Review your **Subject-Wise Accuracy** bar charts and **Chapter Mastery** breakdowns to target weak topics.

---

## Scripts & Operations

| Command | Description |
|---|---|
| `npm run dev` | Starts local development server on `http://localhost:3000` |
| `npm run build` | Compiles Next.js production build |
| `npm run start` | Starts production server |
| `npm run seed` | Seeds default accounts, demo paper, and sample tests |
| `npm run backup` | Creates a timestamped dump of database + PDFs + images under `data/backups/` |
| `npm run restore` | Restores database and files from the latest backup |
| `npm run reset` | Wipes `data/`, re-runs migrations, and re-seeds cleanly |
| `npm test` | Runs the Vitest test suite (grading engine, leak prevention, schemas) |
| `npm run typecheck` | Runs `tsc --noEmit` to verify TypeScript type safety |

---

## Project Structure & Architecture

```
├── data/                         # ALL runtime mutable state (never committed to git)
│   ├── pgdata/                   # Embedded Postgres (PGlite) database directory
│   ├── papers/                   # Stored source PDF files
│   ├── images/                   # Cropped question diagrams (WebP)
│   └── backups/                  # Timestamped full backups
├── drizzle/                      # SQL migrations (0000_init.sql is source of truth)
├── prompts/                      # Versioned LLM extraction prompts (extract-v1.txt)
├── scripts/                      # Seed, backup, restore, and reset scripts
└── src/
    ├── app/                      # Next.js App Router (login, teacher, student, api)
    │   ├── api/                  # REST API route handlers
    │   │   ├── analytics/        # Student & teacher analytics endpoints + CSV export
    │   │   ├── attempts/         # Test runner autosave, events, grading & results
    │   │   ├── papers/           # PDF upload, dedupe, and streaming
    │   │   ├── questions/        # Question CRUD & verification gate
    │   │   └── tests/            # Test builder, questions assignment & publishing
    │   ├── student/              # Student dashboard, test runner, review & analytics
    │   └── teacher/              # Teacher dashboard, editor, builder & analytics
    ├── components/               # UI components, KaTeX renderer, and PDF cropper
    ├── db/                       # Schema definitions & PGlite singleton
    └── lib/                      # Pure grading engine, DTO projections, auth & shuffle
```

---

## Answer-Key Leak Protection

In this local-first architecture:
1. **Single Choke Point**: Question payloads served to students pass strictly through `toStudentQuestion()` in `src/lib/dto.ts`, explicitly excluding `answer`, `solution`, and `difficulty`.
2. **Automated Leak Tests**: `src/lib/dto.leak.test.ts` recursively traverses student payloads to guarantee zero answer-key leakage in student network responses.
3. **Server-Side Grading**: `POST /api/attempts/:id/submit` is the only route that reads `questions.answer`, scoring responses atomically in a single transaction.
