import { z } from 'zod';

export const QuestionOptionSchema = z.object({
  key: z.enum(['A', 'B', 'C', 'D']),
  body: z.string().min(1),
});

export const QuestionAnswerSchema = z.union([
  z.object({ key: z.enum(['A', 'B', 'C', 'D']) }),
  z.object({ value: z.number() }),
  z.object({ min: z.number(), max: z.number() }),
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
  .refine((v) => v.type !== 'mcq' || (v.options?.length ?? 0) === 0 || (v.options?.length ?? 0) >= 2, {
    message: 'mcq questions need at least 2 options',
    path: ['options'],
  });

export type QuestionUpdateT = z.infer<typeof QuestionUpdateSchema>;
