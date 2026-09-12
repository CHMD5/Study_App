# Complete Production Setup & Deployment Guide

This guide provides end-to-end instructions for deploying the **Vidya Test Prep / SRSMA JEE & NEET Test Platform** to production while preserving the zero-config local development setup.

---

## 0. Key Production Architecture Decisions

1. **Dual-Engine Database Layer**:
   - **Local Mode**: When `DATABASE_URL` is unset, the app uses embedded **PGlite** (`./data/pgdata`) with zero cloud dependencies and zero setup.
   - **Production Mode**: When `DATABASE_URL` is provided, the application connects to a pooled **PostgreSQL** instance (Supabase, Neon, Railway, or AWS RDS) automatically.
2. **Authentication Flow (Active & Live)**:
   - **Students**: Sign in at `/login` by entering their mobile number (supports India `+91` and international country codes). **No OTP or Gmail verification is required for now**. Accounts are auto-provisioned or retrieved instantly.
   - **Persistent 90-Day Login**: Sessions are preserved via signed HTTP-only cookies with a 90-day lifetime. Returning students and teachers are automatically recognized and routed directly to their dashboard without being prompted to re-login.
   - **Faculty / Teachers**: Sign in at the restricted staff portal at `/SRSMA` using username and password.
3. **Timer Sweep Cron**:
   - Background sweep endpoint at `/api/cron/sweep-expired` auto-submits exams when students run out of time or close their browser.

---

## Step 1: Set Up a Production PostgreSQL Database

Choose any managed PostgreSQL provider (free-tier available):

### Option A: Supabase (Recommended — Free Tier)
1. Go to [database.new](https://database.new) and create a free project (e.g. region: `South Asia (Mumbai)`).
2. Go to **Project Settings** → **Database** → **Connection string**.
3. Select **URI** mode and copy the connection string.
   - Use the **Transaction Pooler** or **Session Pooler** string (port `6543` or `5432`):
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
     ```
4. Note down your database password.

### Option B: Neon (Serverless Postgres — Free Tier)
1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. Copy the pooled connection string from the dashboard:
   ```
   postgresql://[USER]:[PASSWORD]@[ENDPOINT].neon.tech/[DBNAME]?sslmode=require
   ```

### Option C: Railway or Self-Hosted Docker
- In Railway, click **New** → **Database** → **PostgreSQL**, and copy `DATABASE_URL`.

---

## Step 2: Configure Production Environment Variables

Generate a secure random session secret in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Create your production environment configuration (or enter these in your hosting platform dashboard):

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string from Step 1 | `postgresql://postgres:pass@host:5432/dbname?sslmode=require` |
| `SESSION_SECRET` | 32+ character random string to sign JWT cookies | `vK8_w39F...random_string` |
| `COOKIE_SECURE` | Set to `true` to require HTTPS cookies | `true` |
| `CRON_SECRET` | Secret key to protect the sweep cron endpoint | `my-secret-sweep-key-2026` |
| `DATA_DIR` | Directory for PDFs and cropped diagram images | `./data` (or persistent volume path `/mnt/data`) |
| `NEXT_PUBLIC_APP_URL` | Public production URL | `https://study.srsma.in` |

*(Refer to [`.env.production.example`](file:///.env.production.example) for a pre-formatted template).*

---

## Step 3: Run Database Migrations & Seed Faculty Administrator

Before launching the web server, initialize the schema and create the faculty administrator account.

Run from your local development machine (or deployment CI/CD pipeline) with `DATABASE_URL` pointing to your production database:

### 1. Run Schema Migrations:
```bash
# Windows PowerShell:
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require"
npm run migrate

# Linux / macOS:
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require" npm run migrate
```
*Output: `[migrate] all migrations applied successfully.`*

### 2. Create the Faculty Administrator:
```bash
# Windows PowerShell:
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require"
$env:ADMIN_USERNAME="Teacher"
$env:ADMIN_PASSWORD="YourSecurePasswordHere!"
$env:ADMIN_FULLNAME="Head of Faculty"
$env:ADMIN_EMAIL="admin@srsma.edu"
npm run seed:admin

# Linux / macOS:
DATABASE_URL="postgresql://..." ADMIN_USERNAME="Teacher" ADMIN_PASSWORD="YourSecurePasswordHere!" ADMIN_FULLNAME="Head of Faculty" ADMIN_EMAIL="admin@srsma.edu" npm run seed:admin
```
*Output: `[seed-admin] created new faculty admin account: "Teacher"`*

*(Note: Unlike `npm run seed`, `seed:admin` inserts only the verified faculty account and leaves mock tests and demo student accounts completely clean).*

---

## Step 4: Deploy the Web Application

### Deployment Option 1: Vercel (Fastest Serverless Hosting)
1. Push your repository to GitHub / GitLab.
2. Import the repository in [vercel.com/new](https://vercel.com/new).
3. In **Environment Variables**, add:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `COOKIE_SECURE` = `true`
   - `CRON_SECRET`
   - `DISABLE_SWEEP_TIMER` = `true`
4. Click **Deploy**.

#### Setting up the Auto-Submit Cron on Vercel:
Create or verify `vercel.json` in the project root:
```json
{
  "crons": [
    {
      "path": "/api/cron/sweep-expired",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

### Deployment Option 2: Railway or Render (Recommended for Attached Disk Storage)
When uploading 30–60 MB source PDFs and diagram crops, a platform with persistent disk storage keeps all files in one place:
1. Connect your GitHub repository to Railway or Render.
2. Attach a **Persistent Volume** mounted at `/data`.
3. Set `DATA_DIR=/data`.
4. Add the environment variables (`DATABASE_URL`, `SESSION_SECRET`, `COOKIE_SECURE=true`, etc.).
5. Start command: `npm run build && npm run start`.

### Deployment Option 3: Self-Hosted Linux VPS (Ubuntu / Debian / Nginx)
1. Install Node.js 20+ and PM2:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm
   sudo npm install -g pm2
   ```
2. Clone repository and install dependencies:
   ```bash
   git clone <repo-url> /var/www/study-app
   cd /var/www/study-app
   npm install
   ```
3. Create `.env.production` with your settings.
4. Run migrations and build:
   ```bash
   npm run migrate
   npm run build
   ```
5. Start with PM2:
   ```bash
   pm2 start npm --name "srsma-app" -- start
   pm2 save
   pm2 startup
   ```
6. Point Nginx reverse proxy to `http://127.0.0.1:3000`.

---

## Step 5: Schedule the Auto-Submit Cron Sweep

In CBT examinations, students whose countdown timer expires must have their active attempts automatically closed and scored even if they disconnect or close their tab.

### If hosted on Vercel:
Vercel automatically invokes `/api/cron/sweep-expired` based on `vercel.json`.

### If using an external cron monitor (cron-job.org / EasyCron):
1. Create a new cron job triggering every 1 to 2 minutes.
2. URL: `https://your-domain.com/api/cron/sweep-expired?key=YOUR_CRON_SECRET`
3. Method: `GET` or `POST`.

### If using Linux crontab:
```bash
*/2 * * * * curl -s -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/sweep-expired > /dev/null
```

---

## Step 6: Production Verification Checklist

Follow these steps to verify your live deployment:

- [ ] **Persistent Student Login**:
  - Open `https://your-domain.com/login`.
  - Enter mobile number (e.g. `9876543210`).
  - Click **Sign in as Student**.
  - Verify redirection to `/student`.
  - Close the browser, reopen `https://your-domain.com`, and verify you remain logged in without any prompt.
- [ ] **Faculty Portal**:
  - Open `https://your-domain.com/SRSMA`.
  - Sign in with your seeded administrator credentials.
  - Verify access to `/teacher` dashboard.
- [ ] **Paper & Question Digitization**:
  - In `/teacher/papers`, upload a sample JEE question paper PDF.
  - In `/teacher/questions/upload`, paste extracted Gemini JSON questions.
  - Verify and crop diagrams using the canvas tool.
- [ ] **Test Runner & Grading**:
  - Create and publish a mock test in `/teacher/tests`.
  - In student mode, launch the test at `/student/tests/[id]`.
  - Answer questions, observe the 5-state NTA question palette, and submit.
  - Verify instant scorecard generation and KaTeX worked solutions.
- [ ] **Local Mode Unaffected**:
  - In local development without `DATABASE_URL`, run `npm run dev`.
  - Verify that embedded PGlite and local development continue functioning with zero dependencies.
