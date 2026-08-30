import { describe, expect, it } from 'vitest';
import { toStudentQuestion } from './dto';
import type { Question } from '@/db/schema';

describe('toStudentQuestion security & leak prevention', () => {
  const mockFullQuestion: Question = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    humanCode: 'JM2023-P-01',
    paperId: 'paper-123',
    sourceQno: 1,
    subject: 'physics',
    type: 'mcq',
    status: 'verified',
    body: 'What is the speed of light? [[IMG:p1_1]]',
    options: [
      { key: 'A', body: '$3 \\times 10^8\\,\\mathrm{m/s}$' },
      { key: 'B', body: '$2 \\times 10^8\\,\\mathrm{m/s}$' },
      { key: 'C', body: '$1 \\times 10^8\\,\\mathrm{m/s}$' },
      { key: 'D', body: '$4 \\times 10^8\\,\\mathrm{m/s}$' },
    ],
    answer: { key: 'SECRET_ANSWER_KEY_A' } as unknown as Question['answer'],
    solution: 'TOP_SECRET_WORKED_SOLUTION_DO_NOT_LEAK',
    difficulty: 7,
    expectedTimeS: 120,
    topic: 'Optics',
    chapter: 'Ray Optics',
    extractionNotes: { uncertain: ['UNCERTAIN_SECRET_NOTE'] },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'teacher-uuid',
    lastEditedBy: 'teacher-uuid',
    verifiedAt: new Date(),
    verifiedBy: 'teacher-uuid',
  };

  function findForbiddenKeys(obj: unknown, forbidden = ['answer', 'solution', 'difficulty', 'extraction_notes', 'extractionNotes']): string[] {
    const found: string[] = [];
    if (!obj || typeof obj !== 'object') return found;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        found.push(...findForbiddenKeys(item, forbidden));
      }
      return found;
    }

    for (const [key, val] of Object.entries(obj)) {
      if (forbidden.includes(key.toLowerCase())) {
        found.push(key);
      }
      found.push(...findForbiddenKeys(val, forbidden));
    }
    return found;
  }

  it('never includes answer, solution, difficulty or extractionNotes in student projection', () => {
    const studentDto = toStudentQuestion(mockFullQuestion, 1, { correct: 4, wrong: -1, unattempted: 0 });

    const forbidden = findForbiddenKeys(studentDto);
    expect(forbidden).toEqual([]);

    const serialized = JSON.stringify(studentDto);
    expect(serialized).not.toContain('SECRET_ANSWER_KEY_A');
    expect(serialized).not.toContain('TOP_SECRET_WORKED_SOLUTION_DO_NOT_LEAK');
    expect(serialized).not.toContain('UNCERTAIN_SECRET_NOTE');
    expect(serialized).not.toContain('answer');
    expect(serialized).not.toContain('solution');
    expect(serialized).not.toContain('difficulty');
  });

  it('correctly applies custom option ordering while preserving keys and bodies', () => {
    const customOrder = ['C', 'A', 'D', 'B'];
    const studentDto = toStudentQuestion(mockFullQuestion, 1, { correct: 4, wrong: -1, unattempted: 0 }, customOrder);

    expect(studentDto.options.map((o) => o.key)).toEqual(['C', 'A', 'D', 'B']);
    expect(studentDto.options[0].body).toBe('$1 \\times 10^8\\,\\mathrm{m/s}$');
  });
});
