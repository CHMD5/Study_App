import type { QuestionAnswer } from '@/db/schema';

export type GradingItem = {
  questionId: string;
  type: 'mcq' | 'integer';
  answerKey: QuestionAnswer | null;
  response: { key?: string; value?: number | string } | null | undefined;
  marksCorrect: number | string;
  marksWrong: number | string;
  marksUnattempted: number | string;
};

export type GradedItemResult = {
  questionId: string;
  isAttempted: boolean;
  isCorrect: boolean | null; // null when unattempted
  marksAwarded: number;
};

export type GradedAttemptResult = {
  totalMarks: number;
  maxMarks: number;
  items: GradedItemResult[];
};

/**
 * Evaluates a single student response against the question's answer key.
 *
 * Handles:
 * - MCQ exact key matching ('A', 'B', 'C', 'D')
 * - Numerical / Integer exact value matching (with floating point string parsing e.g. "42.0" === 42)
 * - Numerical tolerance range matching ({ min, max })
 * - Positive, negative, and zero marks
 */
export function gradeQuestionResponse(item: GradingItem): GradedItemResult {
  const correctMarks = Number(item.marksCorrect);
  const wrongMarks = Number(item.marksWrong);
  const unattemptedMarks = Number(item.marksUnattempted);

  // Check if unattempted
  if (!item.response) {
    return {
      questionId: item.questionId,
      isAttempted: false,
      isCorrect: null,
      marksAwarded: unattemptedMarks,
    };
  }

  const { key, value } = item.response;
  const answer = item.answerKey;

  if (!answer) {
    // If no answer key was set (shouldn't happen on verified questions), award unattempted marks
    return {
      questionId: item.questionId,
      isAttempted: false,
      isCorrect: null,
      marksAwarded: unattemptedMarks,
    };
  }

  if (item.type === 'mcq') {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      return {
        questionId: item.questionId,
        isAttempted: false,
        isCorrect: null,
        marksAwarded: unattemptedMarks,
      };
    }

    if ('key' in answer && typeof answer.key === 'string') {
      const isCorrect = key.trim().toUpperCase() === answer.key.trim().toUpperCase();
      return {
        questionId: item.questionId,
        isAttempted: true,
        isCorrect,
        marksAwarded: isCorrect ? correctMarks : wrongMarks,
      };
    }
  } else if (item.type === 'integer') {
    if (value === undefined || value === null || value === '' || Number.isNaN(Number(value))) {
      return {
        questionId: item.questionId,
        isAttempted: false,
        isCorrect: null,
        marksAwarded: unattemptedMarks,
      };
    }

    const numValue = Number(value);

    if ('value' in answer && typeof answer.value === 'number') {
      const isCorrect = Math.abs(numValue - answer.value) < 1e-6;
      return {
        questionId: item.questionId,
        isAttempted: true,
        isCorrect,
        marksAwarded: isCorrect ? correctMarks : wrongMarks,
      };
    }

    if ('min' in answer && 'max' in answer && typeof answer.min === 'number' && typeof answer.max === 'number') {
      const isCorrect = numValue >= answer.min - 1e-6 && numValue <= answer.max + 1e-6;
      return {
        questionId: item.questionId,
        isAttempted: true,
        isCorrect,
        marksAwarded: isCorrect ? correctMarks : wrongMarks,
      };
    }
  }

  // Fallback for unrecognized answer type or missing response
  return {
    questionId: item.questionId,
    isAttempted: false,
    isCorrect: null,
    marksAwarded: unattemptedMarks,
  };
}

/**
 * Pure function to grade a full attempt.
 */
export function gradeAttempt(items: GradingItem[]): GradedAttemptResult {
  const gradedItems = items.map(gradeQuestionResponse);
  const totalMarks = gradedItems.reduce((sum, item) => sum + item.marksAwarded, 0);
  const maxMarks = items.reduce((sum, item) => sum + Number(item.marksCorrect), 0);

  return {
    totalMarks: Math.round(totalMarks * 100) / 100,
    maxMarks: Math.round(maxMarks * 100) / 100,
    items: gradedItems,
  };
}
