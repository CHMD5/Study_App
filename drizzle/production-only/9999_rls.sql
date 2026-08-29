-- =====================================================================
-- ⚠️  DELIBERATELY NOT APPLIED IN THE LOCAL BUILD. DO NOT WIRE THIS IN.
--
-- This is LLD §4.9 Row-Level Security, kept verbatim and ready for the first
-- Supabase deploy. It cannot work under PGlite: there are no auth roles, no
-- `auth.uid()`, and every local query runs as superuser. Applying it here would
-- either error or — worse — appear to succeed while enforcing nothing, which is
-- the most dangerous outcome available.
--
-- What protects answer keys LOCALLY instead:
--   1. src/lib/dto.ts  — the single choke point that shapes student payloads by
--      EXPLICIT FIELD PICK, so a column added later cannot leak by default.
--   2. src/lib/dto.leak.test.ts — recursively asserts no answer/solution key or
--      correct-answer value appears anywhere in a student payload. Fails `npm test`.
--
-- In production this file is defence IN ADDITION TO those two, never instead.
-- Apply it as the last migration of the first Supabase deploy.
-- =====================================================================

ALTER TABLE questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION is_teacher() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher');
$$;

-- All teachers, full access. Students: no policy on `questions` at all — there
-- is no query a student's JWT can construct that returns an answer key.
CREATE POLICY q_teacher_all ON questions FOR ALL USING (is_teacher());

CREATE POLICY a_student_own ON attempts
  FOR SELECT USING (student_id = auth.uid() OR is_teacher());

CREATE POLICY aa_student_own ON attempt_answers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM attempts a
            WHERE a.id = attempt_id AND (a.student_id = auth.uid() OR is_teacher()))
  );
