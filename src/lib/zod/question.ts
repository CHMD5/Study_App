import { z } from 'zod';

export const QuestionOptionSchema = z.object({
  key: z.enum(['A', 'B', 'C', 'D']),
  body: z.string().min(1),
});

export const QuestionAnswerSchema = z.union([
  z.object({ key: z.enum(['A', 'B', 'C', 'D']) }),
  z.object({ value: z.number().finite() }),
  z
    .object({ min: z.number().finite(), max: z.number().finite() })
    .refine((r) => r.min <= r.max, { message: 'the range minimum must not exceed its maximum' }),
]);

/**
 * PATCH /api/questions/:id body. `updatedAt` is the optimistic-concurrency
 * token (LLD §1.3/§4.4) — the client echoes back the value it last read, and
 * the server rejects the write with 409 stale_write if it no longer matches.
 */
export const QuestionUpdateSchema = z
  .object({
    updatedAt: z.string().datetime({ offset: true }),
    subject: z.enum(['physics', 'chemistry', 'maths']).optional(),
    type: z.enum(['mcq', 'integer']).optional(),
    body: z.string().min(1).optional(),
    options: z.array(QuestionOptionSchema).optional(),
    answer: QuestionAnswerSchema.nullable().optional(),
    solution: z.string().nullable().optional(),
    difficulty: z.number().int().min(1).max(10).nullable().optional(),
    expectedTimeS: z.number().int().positive().nullable().optional(),
    topic: z.string().nullable().optional(),
    chapter: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'mcq' && v.options !== undefined && v.options.length > 0 && v.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'mcq questions need at least 2 options',
      });
    }

    if (v.options) {
      const seen = new Set<string>();
      for (const opt of v.options) {
        if (seen.has(opt.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: `duplicate option key '${opt.key}'`,
          });
        }
        seen.add(opt.key);
      }
    }

    // The answer key must point at an option that actually exists.
    //
    // Nothing checked this before, so `{ key: 'D' }` could be saved against a
    // question with only A–C, pass the verify gate (which asks only "is answer
    // non-null?"), be published, and mark every single student wrong. Only
    // enforceable when this PATCH carries `options` too — the editor always
    // sends both, and the verify gate re-checks against the stored row for the
    // partial-update case.
    if (v.answer && 'key' in v.answer && v.options) {
      const keys = new Set(v.options.map((o) => o.key));
      if (!keys.has(v.answer.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer'],
          message: `answer key '${v.answer.key}' is not one of this question's options (${[...keys].join(', ') || 'none'})`,
        });
      }
    }

    // Shape must match the question type.
    if (v.type === 'mcq' && v.answer && !('key' in v.answer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message: 'an mcq question needs an option key as its answer, not a numeric value',
      });
    }
    if (v.type === 'integer' && v.answer && 'key' in v.answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message: 'a numerical question needs a value or a range as its answer, not an option key',
      });
    }
  });

export type QuestionUpdateT = z.infer<typeof QuestionUpdateSchema>;
