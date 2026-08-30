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
  return pgErrorCode(err) === '23503';
}

/**
 * Postgres error code 23505 = unique_violation. Turns a raw constraint failure
 * (re-ingesting a paper whose `human_code`s already exist; two tabs racing to
 * allocate the same `attempt_no`) into a specific 409 instead of a bare 500.
 */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505';
}

/**
 * drizzle-orm/pglite wraps the driver error as `{ query, params, cause: {...} }`,
 * so the SQLSTATE lives on `.cause`, not on the error itself.
 */
function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  const own = (err as { code?: unknown }).code;
  return typeof own === 'string' ? own : undefined;
}
