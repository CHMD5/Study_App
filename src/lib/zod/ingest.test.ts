import { describe, expect, it } from 'vitest';
import { IngestPayload, IngestSolutionsPayload } from './ingest';

const validQuestion = {
  sourceQno: 12,
  subject: 'physics',
  type: 'mcq',
  body: 'A solid sphere rolls down. [[IMG:p12_1]]',
  options: [
    { key: 'A', body: '$\\frac{2}{5}mR^2$' },
    { key: 'B', body: '$\\frac{7}{5}mR^2$' },
    { key: 'C', body: '$\\frac{2}{3}mR^2$' },
    { key: 'D', body: '$mR^2$' },
  ],
  imagePlaceholders: [{ id: 'p12_1', hint: 'inclined plane with sphere at top' }],
  uncertain: [],
};

describe('IngestPayload', () => {
  it('accepts a well-formed paper', () => {
    const result = IngestPayload.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
  });

  it('accepts biology as a subject', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          subject: 'biology',
          body: 'Which cell organelle is known as the powerhouse of the cell?',
          options: [
            { key: 'A', body: 'Mitochondria' },
            { key: 'B', body: 'Ribosome' },
            { key: 'C', body: 'Golgi apparatus' },
            { key: 'D', body: 'Nucleus' },
          ],
          imagePlaceholders: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts questions with answer and solution (both mode)', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          answer: 'A',
          solution: 'Mitochondria produce ATP through cellular respiration.',
          imagePlaceholders: [{ id: 'p12_1', hint: 'inclined plane with sphere at top' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts questions with sourcePage', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          sourcePage: 3,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].sourcePage).toBe(3);
    }
  });

  it('rejects an unknown type enum value (LLD §5.1 example)', () => {
    const result = IngestPayload.safeParse({
      questions: [{ ...validQuestion, type: 'numerical' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an mcq question with fewer than 2 options', () => {
    const result = IngestPayload.safeParse({
      questions: [{ ...validQuestion, options: [{ key: 'A', body: 'x' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an integer question that has printed options (rule 2)', () => {
    const result = IngestPayload.safeParse({
      questions: [{ ...validQuestion, type: 'integer', body: 'Find x.', imagePlaceholders: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unclosed $ delimiter', () => {
    const result = IngestPayload.safeParse({
      questions: [{ ...validQuestion, body: 'Unbalanced $x^2 delimiter', imagePlaceholders: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a body referencing an undeclared image placeholder', () => {
    const result = IngestPayload.safeParse({
      questions: [{ ...validQuestion, imagePlaceholders: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a declared placeholder that never appears in body or options', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          body: 'No image token here.',
          options: validQuestion.options.map((o) => ({ ...o })), // no [[IMG:]] in any option either
          imagePlaceholders: [{ id: 'p12_1', hint: 'orphaned' }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an image placeholder that lives only inside an option (match-the-column)', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          body: 'Match the diagram to its label:',
          options: [
            { key: 'A', body: '[[IMG:opt_a]]' },
            { key: 'B', body: 'A plain text option' },
          ],
          imagePlaceholders: [{ id: 'opt_a', hint: 'diagram inside option A' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an image token inside an option that is not declared in imagePlaceholders', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          body: 'Match the diagram to its label:',
          options: [
            { key: 'A', body: '[[IMG:opt_a]]' },
            { key: 'B', body: 'A plain text option' },
          ],
          imagePlaceholders: [], // opt_a never declared
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('is all-or-nothing: one bad question fails the whole payload', () => {
    const result = IngestPayload.safeParse({
      questions: [validQuestion, { ...validQuestion, sourceQno: 13, type: 'numerical' }],
    });
    expect(result.success).toBe(false);
  });

  it('normalizes and accepts placeholder ids wrapped in [[IMG:...]]', () => {
    const result = IngestPayload.safeParse({
      questions: [
        {
          ...validQuestion,
          body: 'Figure showing triangle: [[IMG:q5_1]]',
          imagePlaceholders: [{ id: '[[IMG:q5_1]]', hint: 'Right triangle' }],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].imagePlaceholders[0].id).toBe('q5_1');
    }
  });

  it('rejects an empty questions array', () => {
    const result = IngestPayload.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });
});

describe('IngestSolutionsPayload', () => {
  it('accepts a valid solutions payload', () => {
    const result = IngestSolutionsPayload.safeParse({
      solutions: [
        {
          sourceQno: 1,
          sourcePage: 5,
          subject: 'biology',
          answer: 'A',
          solution: 'Step 1: Cell biology defines mitochondria as the powerhouse. [[IMG:sol1_1]]',
          imagePlaceholders: [{ id: 'sol1_1', hint: 'mitochondria diagram' }],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.solutions[0].sourcePage).toBe(5);
    }
  });

  it('rejects an undeclared placeholder in solution', () => {
    const result = IngestSolutionsPayload.safeParse({
      solutions: [
        {
          sourceQno: 1,
          solution: 'Solution with [[IMG:sol1_undeclared]]',
          imagePlaceholders: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unclosed dollar in solution', () => {
    const result = IngestSolutionsPayload.safeParse({
      solutions: [
        {
          sourceQno: 1,
          solution: 'Unclosed math $\\frac{1}{2} without close',
          imagePlaceholders: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
