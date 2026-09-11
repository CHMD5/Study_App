import { z } from 'zod';

export const ImagePlaceholder = z.object({
  id: z.preprocess((val) => {
    if (typeof val === 'string') {
      const match = val.trim().match(/^\[\[IMG:\s*([^\]]+)\s*\]\]$/);
      return match ? match[1].trim() : val.trim();
    }
    return val;
  }, z.string().min(1, 'placeholder id is required')),
  hint: z.string().min(1, 'a factual hint is required for every image placeholder'),
});

export const IngestOption = z.object({
  key: z.enum(['A', 'B', 'C', 'D']),
  body: z.string().min(1, 'option body cannot be empty'),
});

export const IngestQuestion = z
  .object({
    sourceQno: z.number().int().positive(),
    sourcePage: z.number().int().positive().nullable().optional(),
    subject: z.enum(['physics', 'chemistry', 'maths', 'biology']),
    type: z.enum(['mcq', 'integer']),
    body: z.string().min(1, 'question body cannot be empty'),
    options: z.array(IngestOption).default([]),
    answer: z.string().nullable().optional(),
    solution: z.string().nullable().optional(),
    imagePlaceholders: z.array(ImagePlaceholder).default([]),
    uncertain: z.array(z.string()).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'mcq' && q.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: `mcq questions need at least 2 options, got ${q.options.length}`,
      });
    }
    if (q.type === 'integer' && q.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: `integer questions must not have printed options (rule 2), got ${q.options.length}`,
      });
    }
    const dupeKeys = new Set<string>();
    for (const opt of q.options) {
      if (dupeKeys.has(opt.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: `duplicate option key '${opt.key}'`,
        });
      }
      dupeKeys.add(opt.key);
    }

    // Every [[IMG:id]] token referenced in the body, option bodies, or solution must
    // appear in imagePlaceholders, and vice versa.
    const allText = [q.body, ...q.options.map((o) => o.body), q.solution ?? ''];
    const tokenIds = allText.flatMap((text) => [...text.matchAll(/\[\[IMG:([^\]]+)\]\]/g)].map((m) => m[1]));
    const declaredIds = new Set(q.imagePlaceholders.map((p) => p.id));
    for (const id of new Set(tokenIds)) {
      if (!declaredIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `[[IMG:${id}]] appears in the question or solution but is not declared in imagePlaceholders`,
        });
      }
    }
    const tokenIdSet = new Set(tokenIds);
    for (const p of q.imagePlaceholders) {
      if (!tokenIdSet.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `imagePlaceholders declares '${p.id}' but [[IMG:${p.id}]] does not appear in the body, options, or solution`,
        });
      }
    }

    // LaTeX delimiter escaping check
    const dollarCount = (q.body.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'unclosed $ delimiter' });
    }

    if (q.solution) {
      const solDollarCount = (q.solution.match(/(?<!\\)\$/g) ?? []).length;
      if (solDollarCount % 2 !== 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['solution'], message: 'unclosed $ delimiter in solution' });
      }
    }
  });

export const IngestPayload = z.object({
  paperMeta: z
    .object({
      detectedTitle: z.string().nullable().optional(),
      totalQuestionsFound: z.number().int().nonnegative().optional(),
    })
    .optional(),
  questions: z.array(IngestQuestion).min(1, 'no questions found in the pasted JSON'),
});

export const IngestSolutionItem = z
  .object({
    sourceQno: z.number().int().positive(),
    sourcePage: z.number().int().positive().nullable().optional(),
    subject: z.enum(['physics', 'chemistry', 'maths', 'biology']).optional(),
    answer: z.string().nullable().optional(),
    solution: z.string().min(1, 'solution cannot be empty'),
    imagePlaceholders: z.array(ImagePlaceholder).default([]),
    uncertain: z.array(z.string()).default([]),
  })
  .superRefine((s, ctx) => {
    const tokenIds = [...s.solution.matchAll(/\[\[IMG:([^\]]+)\]\]/g)].map((m) => m[1]);
    const declaredIds = new Set(s.imagePlaceholders.map((p) => p.id));
    for (const id of new Set(tokenIds)) {
      if (!declaredIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `[[IMG:${id}]] appears in the solution but is not declared in imagePlaceholders`,
        });
      }
    }
    const tokenIdSet = new Set(tokenIds);
    for (const p of s.imagePlaceholders) {
      if (!tokenIdSet.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `imagePlaceholders declares '${p.id}' but [[IMG:${p.id}]] does not appear in the solution`,
        });
      }
    }
    const dollarCount = (s.solution.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['solution'], message: 'unclosed $ delimiter in solution' });
    }
  });

export const IngestSolutionsPayload = z.object({
  paperId: z.string().uuid().optional(),
  paperMeta: z
    .object({
      detectedTitle: z.string().nullable().optional(),
      totalSolutionsFound: z.number().int().nonnegative().optional(),
    })
    .optional(),
  solutions: z.array(IngestSolutionItem).min(1, 'no solutions found in the pasted JSON'),
});

export type IngestQuestionT = z.infer<typeof IngestQuestion>;
export type IngestPayloadT = z.infer<typeof IngestPayload>;
export type IngestSolutionItemT = z.infer<typeof IngestSolutionItem>;
export type IngestSolutionsPayloadT = z.infer<typeof IngestSolutionsPayload>;
