import type { Question, QuestionOption } from '@/db/schema';

export type StudentMarksConfig = {
  correct: number;
  wrong: number;
  unattempted: number;
};

export type StudentQuestionDto = {
  id: string;
  position: number;
  body: string;
  type: 'mcq' | 'integer';
  options: QuestionOption[];
  subject: 'physics' | 'chemistry' | 'maths';
  chapter: string | null;
  topic: string | null;
  marks: StudentMarksConfig;
};

/**
 * Single choke point for shaping student-facing question payloads (LLD §5, §5.3, §8.1).
 *
 * Explicitly picks fields rather than spreading and deleting.
 * NEVER includes `answer`, `solution`, `difficulty`, or `extraction_notes`.
 * Verified by `src/lib/dto.leak.test.ts`.
 */
export function toStudentQuestion(
  q: Pick<Question, 'id' | 'body' | 'type' | 'options' | 'subject' | 'chapter' | 'topic'>,
  position: number,
  marks: StudentMarksConfig = { correct: 4, wrong: -1, unattempted: 0 },
  optionsOrder?: string[],
): StudentQuestionDto {
  let options = q.options ?? [];

  if (q.type === 'mcq' && optionsOrder && optionsOrder.length > 0) {
    const map = new Map(options.map((o) => [o.key, o]));
    const reordered: QuestionOption[] = [];
    for (const key of optionsOrder) {
      const opt = map.get(key);
      if (opt) reordered.push(opt);
    }
    // Include any options not in optionsOrder just in case
    for (const opt of options) {
      if (!optionsOrder.includes(opt.key)) {
        reordered.push(opt);
      }
    }
    options = reordered;
  }

  return {
    id: q.id,
    position,
    body: q.body,
    type: q.type,
    options,
    subject: q.subject,
    chapter: q.chapter ?? null,
    topic: q.topic ?? null,
    marks,
  };
}
