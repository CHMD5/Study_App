import { z } from 'zod';

/**
 * `IngestQuestion` — what Gemini (or any extraction LLM) produces, per LLD §6.
 * Deliberately does NOT include answer, difficulty, expectedTime, solution,
 * topic, or chapter — those are teacher-supplied afterward (LLD §6 rule 8).
 * A model that volunteers them anyway has those fields silently stripped by
 * `.strip()`ping this schema before staging, never trusted.
 *
 * Shared between the client (instant feedback before paste) and the server
 * (authoritative — LLD §5.1's all-or-nothing validation).
 */

export const ImagePlaceholder = z.object({
  id: z.string().min(1, 'placeholder id is required'),
  hint: z.string().min(1, 'a factual hint is required for every image placeholder'),
});

export const IngestOption = z.object({
  key: z.enum(['A', 'B', 'C', 'D']),
  body: z.string().min(1, 'option body cannot be empty'),
});

export const IngestQuestion = z
  .object({
    sourceQno: z.number().int().positive(),
    subject: z.enum(['physics', 'chemistry', 'maths']),
    type: z.enum(['mcq', 'integer']),
    body: z.string().min(1, 'question body cannot be empty'),
    options: z.array(IngestOption).default([]),
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

    // Every [[IMG:id]] token referenced in the body OR an option's body must
    // appear in imagePlaceholders, and vice versa — an unresolved or orphaned
    // placeholder is caught here, before staging. A match-the-column question
    // can put a diagram inside an option (LLD §6 rule 6), so options are
    // scanned too, not just body — a token that only ever appeared inside an
    // option used to pass validation silently.
    const allText = [q.body, ...q.options.map((o) => o.body)];
    const tokenIds = allText.flatMap((text) => [...text.matchAll(/\[\[IMG:([^\]]+)\]\]/g)].map((m) => m[1]));
    const declaredIds = new Set(q.imagePlaceholders.map((p) => p.id));
    for (const id of new Set(tokenIds)) {
      if (!declaredIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `[[IMG:${id}]] appears in the question but is not declared in imagePlaceholders`,
        });
      }
    }
    const tokenIdSet = new Set(tokenIds);
    for (const p of q.imagePlaceholders) {
      if (!tokenIdSet.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['imagePlaceholders'],
          message: `imagePlaceholders declares '${p.id}' but [[IMG:${p.id}]] does not appear in the body or any option`,
        });
      }
    }

    // A crude but effective guard against rule-3 LaTeX escaping mistakes: an
    // odd number of unescaped '$' delimiters means something won't render.
    const dollarCount = (q.body.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['body'], message: 'unclosed $ delimiter' });
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

export type IngestQuestionT = z.infer<typeof IngestQuestion>;
export type IngestPayloadT = z.infer<typeof IngestPayload>;
