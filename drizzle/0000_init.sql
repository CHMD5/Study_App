-- =====================================================================
-- 0000_init — LLD §4 schema, ported to the local PGlite build.
--
-- This SQL is the SOURCE OF TRUTH for the schema. src/db/schema.ts is a
-- typed Drizzle mirror of it for query building. Hand-written rather than
-- drizzle-kit-generated because this schema leans on enums, partial CHECK
-- constraints, GIN full-text, window-function views and plpgsql triggers
-- that a generator round-trips poorly.
--
-- Deltas from the production LLD are marked  -- [LOCAL]
-- =====================================================================

-- ---------- Enums (LLD §4.1, verbatim) -------------------------------
CREATE TYPE user_role      AS ENUM ('teacher', 'student');
CREATE TYPE subject_enum   AS ENUM ('physics', 'chemistry', 'maths');
CREATE TYPE qtype_enum     AS ENUM ('mcq', 'integer');
CREATE TYPE qstatus_enum   AS ENUM ('draft', 'verified', 'archived');
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'abandoned');
CREATE TYPE answer_state   AS ENUM ('not_seen', 'seen_unanswered', 'answered',
                                    'answered_flagged', 'flagged_unanswered');

-- ---------- Users (LLD §4.2) -----------------------------------------
CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL DEFAULT 'student',
  full_name     text      NOT NULL,
  email         text      NOT NULL UNIQUE,
  batch         text,
  is_active     boolean   NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- [LOCAL] Production authenticates against Supabase Auth (profiles.id is an
  -- FK to auth.users). Locally there is no auth service, so credentials live
  -- here. password_hash is scrypt; see src/lib/password.ts for the format.
  username      text NOT NULL UNIQUE,
  password_hash text,                       -- NULL => account exists as data only, cannot log in
  can_login     boolean NOT NULL DEFAULT true
);

CREATE INDEX profiles_role_idx ON profiles (role);

-- ---------- Source papers (LLD §4.3) ---------------------------------
CREATE TABLE papers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  code              text NOT NULL UNIQUE,   -- short slug, e.g. 'JM2023-S1'; seeds human_code
  exam_year         int,
  pdf_pages         int,
  registered_by     uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- [LOCAL] Production stores drive_file_id + drive_link and streams bytes from
  -- Google Drive via a service account. Locally the PDF is on disk. The route
  -- that serves it (/api/papers/:id/pdf) has an identical contract either way.
  file_path         text   NOT NULL,        -- relative to DATA_DIR, e.g. 'papers/<uuid>.pdf'
  original_filename text   NOT NULL,
  file_size_bytes   bigint NOT NULL,
  sha256            text   NOT NULL UNIQUE, -- re-uploading the same paper is rejected, not duplicated

  -- Closes a gap in the LLD: §6 says to record which prompt version produced a
  -- paper, but §4.3's table had nowhere to put it.
  extraction_meta   jsonb
);

-- ---------- Questions (LLD §4.4) -------------------------------------
CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_code      text UNIQUE,
  paper_id        uuid REFERENCES papers(id) ON DELETE SET NULL,
  source_qno      int,

  subject         subject_enum NOT NULL,
  type            qtype_enum   NOT NULL,
  status          qstatus_enum NOT NULL DEFAULT 'draft',

  body            text NOT NULL,
  options         jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer          jsonb,
  solution        text,

  difficulty      smallint CHECK (difficulty BETWEEN 1 AND 10),
  expected_time_s int,
  topic           text,
  chapter         text,

  extraction_notes jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Truncated to milliseconds at INSERT too, matching fn_touch_updated_at's
  -- truncation on UPDATE — see the trigger comment below for why this matters.
  updated_at      timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  created_by      uuid REFERENCES profiles(id),
  last_edited_by  uuid REFERENCES profiles(id),
  verified_at     timestamptz,
  verified_by     uuid REFERENCES profiles(id),

  -- The worst bug available here is publishing an ungradeable question, so the
  -- database itself refuses it rather than trusting application validation.
  CONSTRAINT verified_needs_answer
    CHECK (status <> 'verified' OR answer IS NOT NULL),
  CONSTRAINT mcq_needs_options
    CHECK (type <> 'mcq' OR jsonb_array_length(options) >= 2),
  CONSTRAINT integer_has_no_options
    CHECK (type <> 'integer' OR jsonb_array_length(options) = 0)
);

CREATE INDEX questions_subject_status_idx ON questions (subject, status);
CREATE INDEX questions_chapter_topic_idx  ON questions (chapter, topic);
CREATE INDEX questions_difficulty_idx     ON questions (difficulty);
CREATE INDEX questions_paper_idx          ON questions (paper_id, source_qno);
CREATE INDEX questions_body_fts           ON questions USING gin (to_tsvector('english', body));

-- ---------- Question images (LLD §4.5) -------------------------------
CREATE TABLE question_images (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  placeholder_id text NOT NULL,             -- matches the [[IMG:...]] token in body
  storage_path   text NOT NULL,             -- [LOCAL] 'images/<qid>/<placeholder>.webp'
  alt_text       text,
  width_px       int,
  height_px      int,
  source_page    int,                       -- provenance: which PDF page
  crop_rect      jsonb,                     -- {x,y,w,h} at scale 1.0, so a re-crop can be seeded
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, placeholder_id)
);

-- ---------- Question revisions (LLD §8.5, undefined there) -----------
CREATE TABLE question_revisions (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision    int  NOT NULL,
  snapshot    jsonb NOT NULL,
  edited_by   uuid REFERENCES profiles(id),
  edited_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, revision)
);

-- ---------- Tests (LLD §4.6) -----------------------------------------
CREATE TABLE tests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  duration_s        int  NOT NULL,
  opens_at          timestamptz,
  closes_at         timestamptz,
  max_attempts      int  NOT NULL DEFAULT 1,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options   boolean NOT NULL DEFAULT false,
  results_policy    text NOT NULL DEFAULT 'immediate'
                    CHECK (results_policy IN ('immediate', 'on_release')),
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

-- ---------- Attempts (LLD §4.7) --------------------------------------
CREATE TABLE attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES tests(id),
  student_id     uuid NOT NULL REFERENCES profiles(id),
  attempt_no     int  NOT NULL DEFAULT 1,

  started_at     timestamptz NOT NULL DEFAULT now(),
  deadline_at    timestamptz NOT NULL,
  submitted_at   timestamptz,
  status         attempt_status NOT NULL DEFAULT 'in_progress',

  question_order uuid[] NOT NULL,
  option_orders  jsonb  NOT NULL DEFAULT '{}'::jsonb,

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

CREATE INDEX attempt_answers_question_idx ON attempt_answers (question_id);

CREATE TABLE attempt_events (
  id          bigserial PRIMARY KEY,
  attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  meta        jsonb
);

CREATE INDEX attempt_events_attempt_idx ON attempt_events (attempt_id, at);

-- ---------- Triggers --------------------------------------------------

-- updated_at is maintained by the database, not the application, because the
-- optimistic-concurrency guard (LLD §4.4) compares the client's last-seen value
-- against it. clock_timestamp() (rather than now()) so two updates inside one
-- transaction differ. Truncated to milliseconds: a JS Date round-trips through
-- JSON at millisecond precision, so a microsecond-precision stored value would
-- never compare equal to what the client echoes back, and every legitimate
-- edit would spuriously look like a stale write.
CREATE FUNCTION fn_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := date_trunc('milliseconds', clock_timestamp());
  RETURN NEW;
END $$;

CREATE TRIGGER trg_questions_touch
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_attempt_answers_touch
  BEFORE UPDATE ON attempt_answers
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Every question UPDATE snapshots the pre-edit row. LLD §8.5 asks for this;
-- with no undo anywhere else in the editor it is cheap insurance.
CREATE FUNCTION fn_question_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_rev int;
BEGIN
  SELECT COALESCE(MAX(revision), 0) + 1 INTO next_rev
    FROM question_revisions WHERE question_id = OLD.id;
  INSERT INTO question_revisions (question_id, revision, snapshot, edited_by)
    VALUES (OLD.id, next_rev, to_jsonb(OLD), NEW.last_edited_by);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_questions_revision
  BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION fn_question_revision();

-- ---------- Analytics views (LLD §4.8, verbatim) ---------------------
CREATE VIEW v_question_stats AS
SELECT
  aa.question_id,
  q.subject, q.chapter, q.topic, q.difficulty AS assigned_difficulty,
  count(*)                                           AS times_served,
  count(*) FILTER (WHERE aa.response IS NOT NULL)    AS times_attempted,
  round(avg((aa.is_correct)::int)::numeric * 100, 1) AS pct_correct,
  round(avg(aa.time_spent_ms) / 1000.0, 1)           AS avg_time_s,
  q.expected_time_s
FROM attempt_answers aa
JOIN attempts a  ON a.id = aa.attempt_id AND a.status <> 'in_progress'
JOIN questions q ON q.id = aa.question_id
GROUP BY aa.question_id, q.subject, q.chapter, q.topic, q.difficulty, q.expected_time_s;

CREATE VIEW v_test_ranks AS
SELECT
  a.test_id, a.student_id, a.attempt_no, a.total_marks,
  rank() OVER (PARTITION BY a.test_id ORDER BY a.total_marks DESC) AS rank,
  round(100 * percent_rank() OVER (PARTITION BY a.test_id
                                   ORDER BY a.total_marks)::numeric, 1) AS percentile
FROM attempts a
WHERE a.status IN ('submitted', 'auto_submitted');
