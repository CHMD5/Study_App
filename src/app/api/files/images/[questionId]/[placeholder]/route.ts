import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { apiSession } from '@/lib/auth';
import { HttpError, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts, questionImages } from '@/db/schema';
import { paperAbsPath, existsSync } from '@/lib/storage';

type Ctx = { params: Promise<{ questionId: string; placeholder: string }> };

/**
 * Substitutes Supabase Storage's 1-hour signed URLs. Same access rule either
 * way: a teacher can always read a question image; a student can read one only
 * if the question is part of an attempt they own — never by guessing a path.
 * Files live under DATA_DIR, never under public/, so this check is the only
 * way to reach them.
 */
export const GET = withApi<Ctx>(async (req, { params }) => {
  const session = await apiSession();
  const { questionId, placeholder } = await params;

  const db = await getDb();
  const [image] = await db
    .select()
    .from(questionImages)
    .where(and(eq(questionImages.questionId, questionId), eq(questionImages.placeholderId, placeholder)));
  if (!image) throw new HttpError(404, 'not_found', 'Image not found.');

  if (session.role !== 'teacher') {
    const [owned] = await db
      .select({ id: attemptAnswers.questionId })
      .from(attemptAnswers)
      .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
      .where(and(eq(attemptAnswers.questionId, questionId), eq(attempts.studentId, session.userId)))
      .limit(1);
    if (!owned) throw new HttpError(403, 'forbidden', 'Not entitled to this image.');
  }

  if (!existsSync(image.storagePath)) {
    throw new HttpError(410, 'file_missing', 'The image is registered but missing on disk.');
  }

  const absPath = paperAbsPath(image.storagePath);
  const stat = fs.statSync(absPath);
  const etag = `"${Math.floor(stat.mtimeMs)}-${stat.size}"`;

  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'no-cache, private, must-revalidate',
      },
    });
  }

  const webStream = Readable.toWeb(fs.createReadStream(absPath)) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-cache, private, must-revalidate',
      ETag: etag,
    },
  });
});
