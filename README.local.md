# Vidya Test Prep — Local Build Quick Reference

This is the **local-first** edition of [JEE-Test-Platform-LLD.md](JEE-Test-Platform-LLD.md), described in [JEE-Test-Platform-Local-Build-Plan.md](JEE-Test-Platform-Local-Build-Plan.md). Everything — database, source PDFs, cropped images — lives under `data/` on this machine with zero cloud dependencies.

**Current Status:** All build stages (Stages 0–10) are complete and operational.

---

## 1. Quick Start

```bash
# 1. Install packages
npm install

# 2. Seed database (first time or after reset)
npm run seed

# 3. Start local development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 2. Default Logins

| Username | Password | Role | Features |
|---|---|---|---|
| `Teacher` | `112345` | `teacher` | Digitize papers, crop images, build tests, publish, view cohort analytics, export CSV |
| `Student` | `112345` | `student` | Take timed JEE CBT exams, review step-by-step solutions, view personal analytics |

---

## 3. How to Use

### As a Teacher:
1. **Digitize Paper**: Upload PDF at `/teacher/papers` → copy prompt at `/teacher/extraction-prompt` → run Gemini in browser → paste JSON into Ingest tab.
2. **Crop & Verify**: In Question Editor (`/teacher/questions/[id]`), drag crops on the PDF canvas for `[[IMG:...]]` placeholders, set answers, and click **Verify**.
3. **Build & Publish Test**: At `/teacher/tests/new`, configure duration and shuffle settings → in Test Builder (`/teacher/tests/[id]`), add questions from bank → click **Publish Test**.
4. **Analytics**: Inspect score distribution, candidate rankings, and item accuracy at `/teacher/tests/[id]/analytics` and download the CSV scorecard.

### As a Student:
1. **Take Exam**: At `/student`, click **Take Test** → agree to instructions → enter the CBT Test Runner (`/student/attempts/[id]`).
2. **Test Runner Controls**: Switch Physics/Chemistry/Maths tabs, select options, use **Save & Next** or **Mark for Review & Next**, navigate via the 75-cell palette.
3. **Disconnect Protection**: Answers are mirrored to IndexedDB locally; you can complete exams even during offline network interruptions.
4. **Review & Analytics**: After submission, inspect step-by-step KaTeX solutions at `/student/attempts/[id]/result` and track performance curves at `/student/analytics`.

---

## 4. Scripts & Operations

| Command | Purpose |
|---|---|
| `npm run dev` | Starts local Next.js dev server |
| `npm run seed` | Seeds default accounts, demo paper, and sample tests |
| `npm run backup` | Dumps database and copies PDFs/images to `data/backups/` |
| `npm run restore` | Restores database and files from latest backup |
| `npm run reset` | Resets `data/`, re-migrates, and re-seeds |
| `npm test` | Runs the Vitest test suite |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`) |
