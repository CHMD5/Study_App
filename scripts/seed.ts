/**
 * Seeds the two real logins plus 12 data-only demo students (LLD-local plan
 * §9), a generated demo PDF, ~10 hand-written questions covering MCQ, integer,
 * a KaTeX matrix, and an mhchem equation, and 2 demo tests with ~36 graded
 * attempts spread across the 12 demo students.
 *
 * Idempotent: re-running skips anything that already exists by username /
 * paper code / test title, so it's safe to run again after a partial failure.
 *
 * The tests + attempts are seeded directly at the database level even though
 * the test-builder and test-runner UI (build stages 6-8) don't exist yet — the
 * schema (tests, test_questions, attempts, attempt_answers) is already fully
 * built, and `v_question_stats`/`v_test_ranks` (LLD §4.8) are meaningless
 * against a single row. Seeding a plausible score spread now means those views
 * can be verified today, and the analytics UI in stage 9 has real data to
 * render against the moment it's built.
 */
import { and, eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb, closeDb } from '../src/db/client';
import {
  attemptAnswers,
  attempts,
  papers,
  profiles,
  questions,
  testQuestions,
  tests,
  type Question,
  type QuestionAnswer,
  type QuestionOption,
} from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import { saveBufferWithHash } from '../src/lib/storage';
import { paperKey } from '../src/lib/paths';

const DEMO_STUDENT_NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Ishaan Gupta', 'Ananya Reddy', 'Vihaan Iyer',
  'Myra Nair', 'Arjun Rao', 'Sara Khan', 'Kabir Menon', 'Riya Joshi',
  'Aditya Verma', 'Zara Ahmed',
];

async function main() {
  const db = await getDb();

  // ---- Accounts -----------------------------------------------------------
  const passwordHash = await hashPassword('112345');

  await upsertProfile(db, {
    username: 'Teacher',
    fullName: 'Demo Teacher',
    email: 'teacher@local.vidyatest.dev',
    role: 'teacher',
    passwordHash,
    canLogin: true,
  });

  await upsertProfile(db, {
    username: 'Student',
    fullName: 'Demo Student',
    email: 'student@local.vidyatest.dev',
    role: 'student',
    passwordHash,
    canLogin: true,
    batch: 'JEE-2027-A',
  });

  for (let i = 0; i < DEMO_STUDENT_NAMES.length; i++) {
    await upsertProfile(db, {
      username: `demo_student_${i + 1}`,
      fullName: DEMO_STUDENT_NAMES[i],
      email: `demo${i + 1}@local.vidyatest.dev`,
      role: 'student',
      passwordHash: null, // data-only: cannot log in
      canLogin: false,
      batch: 'JEE-2027-A',
    });
  }
  console.log(`[seed] accounts ready: Teacher, Student, ${DEMO_STUDENT_NAMES.length} demo students`);

  // ---- Demo paper (a generated placeholder PDF, so the viewer/crop tool has
  //      something real to open) --------------------------------------------
  const [teacher] = await db.select().from(profiles).where(eq(profiles.username, 'Teacher'));

  const existingPaper = await db.select().from(papers).where(eq(papers.code, 'DEMO-1'));
  let paperId: string;

  if (existingPaper.length > 0) {
    paperId = existingPaper[0].id;
    console.log('[seed] demo paper already exists, skipping');
  } else {
    const pdfBytes = await buildDemoPdf();
    paperId = crypto.randomUUID();
    const { sha256, size } = await saveBufferWithHash(paperKey(paperId), Buffer.from(pdfBytes));

    await db.insert(papers).values({
      id: paperId,
      title: 'Demo Paper — Sample JEE Questions',
      code: 'DEMO-1',
      examYear: new Date().getFullYear(),
      pdfPages: 3,
      registeredBy: teacher.id,
      filePath: paperKey(paperId),
      originalFilename: 'demo-paper.pdf',
      fileSizeBytes: size,
      sha256,
      extractionMeta: { promptVersion: 'seed-script', extractedAt: new Date().toISOString() },
    });
    console.log('[seed] demo paper created');
  }

  // ---- Demo questions -------------------------------------------------------
  const existingQs = await db.select({ id: questions.id }).from(questions).where(eq(questions.paperId, paperId));
  if (existingQs.length > 0) {
    console.log(`[seed] ${existingQs.length} demo questions already exist, skipping`);
  } else {
    const rows = demoQuestions(paperId, teacher.id);
    await db.insert(questions).values(rows);
    console.log(`[seed] ${rows.length} demo questions created (1 left unresolved-image on purpose)`);
  }

  await seedTestsAndAttempts(db, teacher.id, paperId);

  console.log('[seed] done. Sign in as Teacher/112345 or Student/112345.');
}

const DEMO_TEST_TITLE = 'Demo Test — Physics, Chemistry & Maths Mix';

async function seedTestsAndAttempts(
  db: Awaited<ReturnType<typeof getDb>>,
  teacherId: string,
  paperId: string,
) {
  if ((await db.select().from(tests).where(eq(tests.title, DEMO_TEST_TITLE))).length > 0) {
    console.log('[seed] demo test + attempts already exist, skipping');
    return;
  }

  const verifiedQs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.paperId, paperId), eq(questions.status, 'verified')));

  // Only the 12 data-only demo students get attempts — the real `Student`
  // login's dashboard stays empty/clean, per the plan.
  const fakeStudents = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.role, 'student'), eq(profiles.canLogin, false)));

  const now = Date.now();

  const [publishedTest] = await db
    .insert(tests)
    .values({
      title: DEMO_TEST_TITLE,
      description: 'Auto-generated so rank, percentile and per-question analytics have real data to show.',
      durationS: 3600,
      opensAt: new Date(now - 7 * 86_400_000),
      closesAt: new Date(now + 7 * 86_400_000),
      maxAttempts: 3,
      shuffleQuestions: true,
      shuffleOptions: true,
      resultsPolicy: 'immediate',
      isPublished: true,
      createdBy: teacherId,
    })
    .returning();

  const [draftTest] = await db
    .insert(tests)
    .values({
      title: 'Demo Test — Full Mock (draft)',
      description: 'Still being assembled — demonstrates an unpublished test in the builder.',
      durationS: 10_800,
      maxAttempts: 1,
      isPublished: false,
      createdBy: teacherId,
    })
    .returning();

  for (const test of [publishedTest, draftTest]) {
    await db.insert(testQuestions).values(
      verifiedQs.map((q, i) => ({ testId: test.id, questionId: q.id, position: i + 1 })),
    );
  }

  const maxMarks = verifiedQs.length * 4;
  let attemptCount = 0;

  for (let si = 0; si < fakeStudents.length; si++) {
    const student = fakeStudents[si];
    const rand = mulberry32(1000 + si * 97);
    const skill = 0.35 + rand() * 0.55; // this student's chance of answering correctly, 0.35-0.90
    const numAttempts = 1 + Math.floor(rand() * 3); // 1-3 attempts on the published test

    for (let attemptNo = 1; attemptNo <= numAttempts; attemptNo++) {
      attemptCount += await seedOneAttempt(db, publishedTest.id, student.id, attemptNo, verifiedQs, maxMarks, rand, skill);
    }
  }

  console.log(`[seed] 2 demo tests created; ${attemptCount} graded demo attempt(s) created`);
}

async function seedOneAttempt(
  db: Awaited<ReturnType<typeof getDb>>,
  testId: string,
  studentId: string,
  attemptNo: number,
  verifiedQs: Question[],
  maxMarks: number,
  rand: () => number,
  skill: number,
): Promise<number> {
  const durationMs = 3600_000;
  const startedAt = new Date(Date.now() - Math.floor(rand() * 6) * 86_400_000 - durationMs);
  const deadlineAt = new Date(startedAt.getTime() + durationMs);

  const optionOrders: Record<string, string[]> = {};
  for (const q of verifiedQs) {
    if (q.type === 'mcq') optionOrders[q.id] = shuffle(q.options.map((o) => o.key), rand);
  }

  const [attempt] = await db
    .insert(attempts)
    .values({
      testId,
      studentId,
      attemptNo,
      startedAt,
      deadlineAt,
      status: 'submitted',
      questionOrder: shuffle(verifiedQs.map((q) => q.id), rand),
      optionOrders,
    })
    .returning();

  let totalMarks = 0;
  let totalTimeMs = 0;

  for (const q of verifiedQs) {
    // Higher-skill students both attempt more questions and get more of the
    // ones they attempt right — a plausible-looking spread rather than
    // uniform noise, so v_test_ranks/v_question_stats show a real gradient.
    const attempted = rand() < 0.55 + skill * 0.4;
    const timeSpentMs = attempted
      ? Math.round((20 + rand() * 90) * 1000 * (1.3 - skill * 0.6))
      : Math.round(rand() * 8000);

    let response: { key?: string; value?: number } | null = null;
    let isCorrect: boolean | null = null;
    let marks = 0;

    if (attempted) {
      const willBeCorrect = rand() < skill;
      const graded = gradeSimulatedResponse(q, willBeCorrect, rand);
      response = graded.response;
      isCorrect = graded.isCorrect;
      marks = isCorrect ? 4 : -1;
    }

    totalMarks += marks;
    if (attempted) totalTimeMs += timeSpentMs;

    await db.insert(attemptAnswers).values({
      attemptId: attempt.id,
      questionId: q.id,
      response,
      state: attempted ? (rand() < 0.1 ? 'answered_flagged' : 'answered') : 'seen_unanswered',
      timeSpentMs,
      visitCount: attempted ? 1 + Math.floor(rand() * 2) : 1,
      isCorrect,
      marksAwarded: String(marks),
    });
  }

  const submittedAt = new Date(startedAt.getTime() + Math.min(totalTimeMs, durationMs - 30_000));
  await db
    .update(attempts)
    .set({
      submittedAt,
      totalMarks: String(totalMarks),
      maxMarks: String(maxMarks),
      totalTimeS: Math.round(totalTimeMs / 1000),
    })
    .where(eq(attempts.id, attempt.id));

  return 1;
}

/** Simulates a student's answer without knowing the real answer's shape ahead of time. */
function gradeSimulatedResponse(
  q: Question,
  willBeCorrect: boolean,
  rand: () => number,
): { response: { key?: string; value?: number }; isCorrect: boolean } {
  const answer = q.answer as QuestionAnswer;

  if ('key' in answer) {
    const correctKey = answer.key;
    const key = willBeCorrect ? correctKey : pickWrongKey(q.options, correctKey, rand);
    return { response: { key }, isCorrect: key === correctKey };
  }

  if ('value' in answer) {
    const value = willBeCorrect ? answer.value : answer.value + (rand() < 0.5 ? 1 : -1) * (1 + Math.floor(rand() * 3));
    return { response: { value }, isCorrect: value === answer.value };
  }

  // Tolerance-range integer answer ({min, max}).
  const mid = (answer.min + answer.max) / 2;
  const value = willBeCorrect ? mid : mid + (answer.max - answer.min) * 3 + 1;
  return { response: { value }, isCorrect: value >= answer.min && value <= answer.max };
}

function pickWrongKey(options: QuestionOption[], correctKey: string, rand: () => number): string {
  const wrongs = options.map((o) => o.key).filter((k) => k !== correctKey);
  return wrongs[Math.floor(rand() * wrongs.length)] ?? correctKey;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic PRNG (mulberry32) so re-seeding from scratch reproduces the same spread. */
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

async function upsertProfile(
  db: Awaited<ReturnType<typeof getDb>>,
  values: {
    username: string;
    fullName: string;
    email: string;
    role: 'teacher' | 'student';
    passwordHash: string | null;
    canLogin: boolean;
    batch?: string;
  },
) {
  const [existing] = await db.select().from(profiles).where(eq(profiles.username, values.username));
  if (existing) return existing;
  const [row] = await db.insert(profiles).values(values).returning();
  return row;
}

async function buildDemoPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]); // A4
    page.drawText(`Demo Paper — Page ${i}`, { x: 50, y: 780, size: 18, font, color: rgb(0.12, 0.23, 0.54) });
    page.drawText('This is a placeholder PDF generated by scripts/seed.ts so the', {
      x: 50, y: 740, size: 11, font,
    });
    page.drawText('PDF viewer and crop tool have a real file to open locally.', { x: 50, y: 722, size: 11, font });
    page.drawRectangle({ x: 50, y: 500, width: 200, height: 140, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
    page.drawText('figure placeholder', { x: 90, y: 565, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
  }

  return doc.save();
}

function demoQuestions(paperId: string, teacherId: string) {
  const base = {
    paperId,
    createdBy: teacherId,
    lastEditedBy: teacherId,
    verifiedBy: teacherId,
    verifiedAt: new Date(),
    status: 'verified' as const,
  };

  return [
    {
      ...base,
      humanCode: 'DEMO-1-P-001',
      sourceQno: 1,
      subject: 'physics' as const,
      type: 'mcq' as const,
      body: 'A body of mass $m$ moves with velocity $v$. Its kinetic energy is:',
      options: [
        { key: 'A', body: '$\\frac{1}{2}mv$' },
        { key: 'B', body: '$\\frac{1}{2}mv^2$' },
        { key: 'C', body: '$mv^2$' },
        { key: 'D', body: '$2mv^2$' },
      ],
      answer: { key: 'B' },
      solution: 'Kinetic energy is defined as $KE = \\frac{1}{2}mv^2$.',
      difficulty: 2,
      expectedTimeS: 45,
      chapter: 'Work, Energy and Power',
      topic: 'Kinetic energy',
    },
    {
      ...base,
      humanCode: 'DEMO-1-P-002',
      sourceQno: 2,
      subject: 'physics' as const,
      type: 'integer' as const,
      body: 'A particle undergoes uniform acceleration of $2\\,\\mathrm{m/s^2}$ starting from rest. Find its velocity (in m/s) after 5 seconds.',
      options: [],
      answer: { value: 10 },
      solution: '$v = u + at = 0 + 2 \\times 5 = 10\\,\\mathrm{m/s}$.',
      difficulty: 3,
      expectedTimeS: 60,
      chapter: 'Kinematics',
      topic: 'Equations of motion',
    },
    {
      ...base,
      humanCode: 'DEMO-1-C-001',
      sourceQno: 3,
      subject: 'chemistry' as const,
      type: 'mcq' as const,
      body: 'Balance the following reaction and identify the correct stoichiometric equation:\n\n$$\\ce{N2 + H2 -> NH3}$$\n\nWhich of these is correctly balanced?',
      options: [
        { key: 'A', body: '$\\ce{N2 + H2 -> 2NH3}$' },
        { key: 'B', body: '$\\ce{N2 + 3H2 -> 2NH3}$' },
        { key: 'C', body: '$\\ce{2N2 + 3H2 -> 2NH3}$' },
        { key: 'D', body: '$\\ce{N2 + 3H2 -> NH3}$' },
      ],
      answer: { key: 'B' },
      solution: 'Balancing nitrogen and hydrogen atoms gives $\\ce{N2 + 3H2 -> 2NH3}$.',
      difficulty: 3,
      expectedTimeS: 50,
      chapter: 'Chemical Equilibrium',
      topic: 'Stoichiometry',
    },
    {
      ...base,
      humanCode: 'DEMO-1-C-002',
      sourceQno: 4,
      subject: 'chemistry' as const,
      type: 'integer' as const,
      body: 'The oxidation state of chromium in $\\ce{K2Cr2O7}$ is +x. What is the value of x?',
      options: [],
      answer: { value: 6 },
      solution: 'In $\\ce{K2Cr2O7}$, K is +1 and O is -2. $2(1) + 2(x) + 7(-2) = 0 \\Rightarrow x = 6$.',
      difficulty: 4,
      expectedTimeS: 70,
      chapter: 'Redox Reactions',
      topic: 'Oxidation states',
    },
    {
      ...base,
      humanCode: 'DEMO-1-M-001',
      sourceQno: 5,
      subject: 'maths' as const,
      type: 'mcq' as const,
      body: 'If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, then $\\det(A)$ equals:',
      options: [
        { key: 'A', body: '$-2$' },
        { key: 'B', body: '$2$' },
        { key: 'C', body: '$-1$' },
        { key: 'D', body: '$10$' },
      ],
      answer: { key: 'A' },
      solution: '$\\det(A) = (1)(4) - (2)(3) = 4 - 6 = -2$.',
      difficulty: 3,
      expectedTimeS: 55,
      chapter: 'Matrices',
      topic: 'Determinants',
    },
    {
      ...base,
      humanCode: 'DEMO-1-M-002',
      sourceQno: 6,
      subject: 'maths' as const,
      type: 'integer' as const,
      body: 'Evaluate: $$\\int_0^1 x^2\\,dx \\times 3$$',
      options: [],
      answer: { min: 0.99, max: 1.01 },
      solution: '$\\int_0^1 x^2\\,dx = \\frac{1}{3}$, so $\\frac{1}{3} \\times 3 = 1$.',
      difficulty: 4,
      expectedTimeS: 80,
      chapter: 'Integral Calculus',
      topic: 'Definite integrals',
    },
    {
      ...base,
      status: 'draft' as const, // deliberately left draft: demonstrates the verify gate
      verifiedAt: null,
      verifiedBy: null,
      humanCode: 'DEMO-1-P-003',
      sourceQno: 7,
      subject: 'physics' as const,
      type: 'mcq' as const,
      body: 'The circuit below shows a Wheatstone bridge configuration. [[IMG:q7_1]]\n\nAt balance, which relation holds?',
      options: [
        { key: 'A', body: '$\\frac{P}{Q} = \\frac{R}{S}$' },
        { key: 'B', body: '$P \\cdot Q = R \\cdot S$' },
        { key: 'C', body: '$P + Q = R + S$' },
        { key: 'D', body: '$\\frac{P}{R} = \\frac{Q}{S}$' },
      ],
      answer: { key: 'A' },
      solution: 'At balance, no current flows through the galvanometer: $\\frac{P}{Q} = \\frac{R}{S}$.',
      difficulty: 5,
      expectedTimeS: 90,
      chapter: 'Current Electricity',
      topic: 'Wheatstone bridge',
      extractionNotes: { uncertain: ['Circuit diagram not yet cropped — see the crop tool.'] },
    },
  ];
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
