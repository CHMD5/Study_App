import { describe, expect, it } from 'vitest';
import { gradeAttempt, gradeQuestionResponse } from './grading';

describe('gradeQuestionResponse', () => {
  it('correctly grades MCQ with matching key', () => {
    const res = gradeQuestionResponse({
      questionId: 'q1',
      type: 'mcq',
      answerKey: { key: 'C' },
      response: { key: 'C' },
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(true);
    expect(res.isCorrect).toBe(true);
    expect(res.marksAwarded).toBe(4);
  });

  it('grades MCQ case-insensitively with whitespace trimmed', () => {
    const res = gradeQuestionResponse({
      questionId: 'q1',
      type: 'mcq',
      answerKey: { key: 'B' },
      response: { key: ' b ' },
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isCorrect).toBe(true);
    expect(res.marksAwarded).toBe(4);
  });

  it('correctly applies negative marks for wrong MCQ', () => {
    const res = gradeQuestionResponse({
      questionId: 'q1',
      type: 'mcq',
      answerKey: { key: 'A' },
      response: { key: 'B' },
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(true);
    expect(res.isCorrect).toBe(false);
    expect(res.marksAwarded).toBe(-1);
  });

  it('marks unattempted MCQ with 0 marks', () => {
    const res = gradeQuestionResponse({
      questionId: 'q1',
      type: 'mcq',
      answerKey: { key: 'A' },
      response: null,
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(false);
    expect(res.isCorrect).toBe(null);
    expect(res.marksAwarded).toBe(0);
  });

  it('correctly grades integer exact numeric value (e.g. "42.0" === 42)', () => {
    const res = gradeQuestionResponse({
      questionId: 'q2',
      type: 'integer',
      answerKey: { value: 42 },
      response: { value: '42.0' },
      marksCorrect: 4,
      marksWrong: 0,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(true);
    expect(res.isCorrect).toBe(true);
    expect(res.marksAwarded).toBe(4);
  });

  it('correctly grades numerical tolerance range', () => {
    const res = gradeQuestionResponse({
      questionId: 'q3',
      type: 'integer',
      answerKey: { min: 3.14, max: 3.16 },
      response: { value: 3.15 },
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(true);
    expect(res.isCorrect).toBe(true);
    expect(res.marksAwarded).toBe(4);
  });

  it('rejects numerical value outside tolerance range', () => {
    const res = gradeQuestionResponse({
      questionId: 'q3',
      type: 'integer',
      answerKey: { min: 3.14, max: 3.16 },
      response: { value: 3.2 },
      marksCorrect: 4,
      marksWrong: -1,
      marksUnattempted: 0,
    });
    expect(res.isAttempted).toBe(true);
    expect(res.isCorrect).toBe(false);
    expect(res.marksAwarded).toBe(-1);
  });
});

describe('gradeAttempt', () => {
  it('correctly aggregates multiple questions including negative marking and unattempted', () => {
    const result = gradeAttempt([
      {
        questionId: 'q1',
        type: 'mcq',
        answerKey: { key: 'A' },
        response: { key: 'A' },
        marksCorrect: 4,
        marksWrong: -1,
        marksUnattempted: 0,
      },
      {
        questionId: 'q2',
        type: 'mcq',
        answerKey: { key: 'B' },
        response: { key: 'C' },
        marksCorrect: 4,
        marksWrong: -1,
        marksUnattempted: 0,
      },
      {
        questionId: 'q3',
        type: 'integer',
        answerKey: { value: 10 },
        response: null,
        marksCorrect: 4,
        marksWrong: 0,
        marksUnattempted: 0,
      },
      {
        questionId: 'q4',
        type: 'integer',
        answerKey: { value: 25 },
        response: { value: 25 },
        marksCorrect: 4,
        marksWrong: 0,
        marksUnattempted: 0,
      },
    ]);

    expect(result.maxMarks).toBe(16);
    expect(result.totalMarks).toBe(7); // +4 -1 +0 +4 = 7
    expect(result.items).toHaveLength(4);
  });
});
