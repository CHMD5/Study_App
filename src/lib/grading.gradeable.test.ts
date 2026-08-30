import { describe, expect, it } from 'vitest';
import { gradeQuestionResponse, isGradeableResponse } from './grading';

/**
 * Regression cover for A-19: the scorecard's notion of "attempted" and the
 * grader's disagreed.
 *
 * The result route decided attempted-ness with a bare `response !== null`,
 * while the grader required a non-blank MCQ key or a parseable number. A stored
 * `{ value: "abc" }` was therefore scored as UNATTEMPTED (0 marks) but
 * summarised on the scorecard as a WRONG answer. Both now go through
 * isGradeableResponse.
 */
describe('isGradeableResponse', () => {
  it('rejects a null or undefined response', () => {
    expect(isGradeableResponse('mcq', null)).toBe(false);
    expect(isGradeableResponse('mcq', undefined)).toBe(false);
    expect(isGradeableResponse('integer', null)).toBe(false);
  });

  it('accepts a real MCQ key and rejects a blank one', () => {
    expect(isGradeableResponse('mcq', { key: 'A' })).toBe(true);
    expect(isGradeableResponse('mcq', { key: '' })).toBe(false);
    expect(isGradeableResponse('mcq', { key: '   ' })).toBe(false);
    expect(isGradeableResponse('mcq', {})).toBe(false);
  });

  it('accepts numbers, including zero and negatives, for a numerical question', () => {
    expect(isGradeableResponse('integer', { value: 42 })).toBe(true);
    expect(isGradeableResponse('integer', { value: 0 })).toBe(true);
    expect(isGradeableResponse('integer', { value: -3.5 })).toBe(true);
    expect(isGradeableResponse('integer', { value: '42.0' })).toBe(true);
  });

  it('rejects non-numeric text in a numerical box', () => {
    expect(isGradeableResponse('integer', { value: 'abc' })).toBe(false);
    expect(isGradeableResponse('integer', { value: '' })).toBe(false);
  });

  it('agrees with the grader about what counts as an attempt', () => {
    const base = { questionId: 'q1', marksCorrect: 4, marksWrong: -1, marksUnattempted: 0 } as const;

    const cases = [
      { type: 'integer' as const, answerKey: { value: 42 }, response: { value: 'abc' } },
      { type: 'integer' as const, answerKey: { value: 42 }, response: { value: '' } },
      { type: 'integer' as const, answerKey: { value: 42 }, response: { value: 42 } },
      { type: 'integer' as const, answerKey: { value: 42 }, response: { value: 7 } },
      { type: 'mcq' as const, answerKey: { key: 'A' }, response: { key: '' } },
      { type: 'mcq' as const, answerKey: { key: 'A' }, response: { key: 'B' } },
      { type: 'mcq' as const, answerKey: { key: 'A' }, response: { key: 'A' } },
    ];

    for (const c of cases) {
      const graded = gradeQuestionResponse({ ...base, ...c });
      expect(
        graded.isAttempted,
        `grader and isGradeableResponse disagree for ${c.type} ${JSON.stringify(c.response)}`,
      ).toBe(isGradeableResponse(c.type, c.response));
    }
  });
});

describe('grading edge cases', () => {
  const base = { questionId: 'q1', marksCorrect: 4, marksWrong: -1, marksUnattempted: 0 } as const;

  it('awards unattempted marks, not negative marks, for an ungradeable entry', () => {
    const graded = gradeQuestionResponse({
      ...base,
      type: 'integer',
      answerKey: { value: 42 },
      response: { value: 'abc' },
    });
    expect(graded.marksAwarded).toBe(0);
    expect(graded.isCorrect).toBeNull();
  });

  it('marks a zero answer correct rather than treating it as absent', () => {
    const graded = gradeQuestionResponse({
      ...base,
      type: 'integer',
      answerKey: { value: 0 },
      response: { value: 0 },
    });
    expect(graded.isCorrect).toBe(true);
    expect(graded.marksAwarded).toBe(4);
  });

  it('honours an inclusive tolerance range', () => {
    const inRange = gradeQuestionResponse({
      ...base,
      type: 'integer',
      answerKey: { min: 1.4, max: 1.6 },
      response: { value: 1.6 },
    });
    expect(inRange.isCorrect).toBe(true);

    const outOfRange = gradeQuestionResponse({
      ...base,
      type: 'integer',
      answerKey: { min: 1.4, max: 1.6 },
      response: { value: 1.7 },
    });
    expect(outOfRange.isCorrect).toBe(false);
    expect(outOfRange.marksAwarded).toBe(-1);
  });
});
