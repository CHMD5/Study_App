-- =====================================================================
-- 0001_audit_fixes — corrections from the 2026-08-30 code audit.
--
-- Forward-only, applied by the runMigrations() loop in src/db/client.ts.
-- Every statement is idempotent-safe to re-run against a fresh database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A-5: ungraded attempts were ranking #1 with a 100th percentile.
--
-- Postgres defaults to NULLS FIRST for DESC and NULLS LAST for ASC. Any
-- attempt that had been closed without a score (see A-4 — the sweep used to
-- flip `status` without grading) therefore carried total_marks = NULL and
-- sorted to the TOP of `rank() ... ORDER BY total_marks DESC`, and to the top
-- of the percentile scale as well. An abandoned tab outranked the whole class,
-- and that flowed into every leaderboard, every scorecard, the CSV export and
-- the cohort averages.
--
-- Two independent guards, because either alone would be enough and both are
-- cheap: exclude unscored attempts from the view outright, and pin the NULL
-- ordering so a future unscored row can never float to the top again.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_test_ranks AS
SELECT
  a.test_id, a.student_id, a.attempt_no, a.total_marks,
  rank() OVER (PARTITION BY a.test_id ORDER BY a.total_marks DESC NULLS LAST) AS rank,
  round(100 * percent_rank() OVER (PARTITION BY a.test_id
                                   ORDER BY a.total_marks ASC NULLS FIRST)::numeric, 1) AS percentile
FROM attempts a
WHERE a.status IN ('submitted', 'auto_submitted')
  AND a.total_marks IS NOT NULL;

-- ---------------------------------------------------------------------
-- A-35: question_revisions filled up with non-edits.
--
-- fn_question_revision fired on EVERY update, so flipping status to 'verified'
-- (which touches no content) snapshotted a full row, as did any write that
-- changed nothing at all. Snapshot only when something a teacher would
-- recognise as the question's content actually changed.
--
-- `IS DISTINCT FROM` rather than `<>` so a NULL on either side compares
-- correctly — `answer <> answer` is NULL, not false, when either is NULL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_question_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_rev int;
BEGIN
  IF  NEW.body            IS NOT DISTINCT FROM OLD.body
  AND NEW.options         IS NOT DISTINCT FROM OLD.options
  AND NEW.answer          IS NOT DISTINCT FROM OLD.answer
  AND NEW.solution        IS NOT DISTINCT FROM OLD.solution
  AND NEW.subject         IS NOT DISTINCT FROM OLD.subject
  AND NEW.type            IS NOT DISTINCT FROM OLD.type
  AND NEW.difficulty      IS NOT DISTINCT FROM OLD.difficulty
  AND NEW.expected_time_s IS NOT DISTINCT FROM OLD.expected_time_s
  AND NEW.topic           IS NOT DISTINCT FROM OLD.topic
  AND NEW.chapter         IS NOT DISTINCT FROM OLD.chapter
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(revision), 0) + 1 INTO next_rev
    FROM question_revisions WHERE question_id = OLD.id;
  INSERT INTO question_revisions (question_id, revision, snapshot, edited_by)
    VALUES (OLD.id, next_rev, to_jsonb(OLD), NEW.last_edited_by);
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- A-16: attempt_no was computed as `existingAttempts.length + 1` from a read
-- taken outside the insert's transaction, so two tabs (or a double-click on
-- "I am ready to begin") both computed 1 and the second hit the unique
-- constraint as a bare 500. The route now allocates inside a transaction; this
-- index makes that MAX(attempt_no) lookup an index-only scan rather than a
-- sequential one.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS attempts_student_test_idx
  ON attempts (test_id, student_id, attempt_no DESC);

-- Supports the sweep's "in_progress and past deadline" scan, which now runs
-- once a minute and grades what it finds rather than only flipping a flag.
CREATE INDEX IF NOT EXISTS attempts_open_deadline_idx
  ON attempts (deadline_at)
  WHERE status = 'in_progress';
