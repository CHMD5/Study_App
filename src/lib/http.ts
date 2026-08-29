import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Thrown anywhere inside a route handler wrapped in `withApi`. Gives handlers a
 * single `throw new HttpError(409, 'stale_write', '...')` idiom instead of
 * threading NextResponse objects back through call stacks.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

export type ApiHandler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

/**
 * Wraps a route handler so thrown HttpErrors and ZodErrors become the JSON error
 * shapes the LLD specifies, and anything unexpected becomes a 500 without
 * leaking a stack trace to the client.
 */
export function withApi<Ctx>(handler: ApiHandler<Ctx>): ApiHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: err.code, message: err.message, ...(err.extra ?? {}) },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: 'validation_failed', issues: formatZodIssues(err) }, { status: 422 });
      }
      console.error('[api] unhandled error', err);
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }
  };
}

export type ValidationIssue = { path: string; message: string };

/** `questions[7].type — expected 'mcq' | 'integer', got 'numerical'` */
export function formatZodIssues(err: ZodError): ValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.reduce<string>(
      (acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
      '',
    ),
    message: issue.message,
  }));
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Postgres error code 23503 = foreign_key_violation. drizzle-orm/pglite wraps
 * the driver error as `{ query, params, cause: { code: '23503', ... } }` — the
 * code lives on `.cause`, not the error itself. Used to turn a raw constraint
 * failure (e.g. deleting a question still referenced by `test_questions`,
 * which is ON DELETE RESTRICT by design — LLD §4.6) into a specific message
 * instead of a bare 500.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'cause' in err &&
    typeof (err as { cause?: unknown }).cause === 'object' &&
    (err as { cause?: { code?: unknown } }).cause?.code === '23503'
  );
}
