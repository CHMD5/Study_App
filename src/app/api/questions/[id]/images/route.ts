import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questionImages, questions } from '@/db/schema';
import { saveQuestionImage } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Resolves one [[IMG:placeholder]] token. The crop tool (stage 3) already did
 * the WebP encoding client-side via canvas.toBlob — this route just persists
 * the bytes and the crop provenance (source page + rect) so a re-crop can be
 * seeded from where the last one was drawn.
 */
export const POST = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: questionId } = await params;

  const db = await getDb();
  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!question) throw new HttpError(404, 'not_found', 'Question not found.');

  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, 'invalid_request', 'Expected multipart/form-data.');

  const placeholderId = String(form.get('placeholderId') ?? '').trim();
  const file = form.get('file');
  const sourcePage = form.get('sourcePage') ? Number(form.get('sourcePage')) : null;
  const cropRectRaw = form.get('cropRect');
  const altText = form.get('altText') ? String(form.get('altText')) : null;

  if (!placeholderId) throw new HttpError(422, 'validation_failed', 'placeholderId is required.');
  if (!(file instanceof File)) throw new HttpError(422, 'validation_failed', 'A cropped image file is required.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'file_too_large', `Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`);
  }

  let cropRect = null;
  if (typeof cropRectRaw === 'string') {
    try {
      cropRect = JSON.parse(cropRectRaw);
    } catch {
      throw new HttpError(422, 'validation_failed', 'cropRect must be valid JSON.');
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { relativeKey } = await saveQuestionImage(questionId, placeholderId, bytes);

  const [row] = await db
    .insert(questionImages)
    .values({
      questionId,
      placeholderId,
      storagePath: relativeKey,
      altText,
      sourcePage,
      cropRect,
    })
    .onConflictDoUpdate({
      target: [questionImages.questionId, questionImages.placeholderId],
      set: { storagePath: relativeKey, altText, sourcePage, cropRect, createdAt: new Date() },
    })
    .returning();

  return json(row, 201);
});

export const GET = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id: questionId } = await params;
  const db = await getDb();
  const rows = await db.select().from(questionImages).where(eq(questionImages.questionId, questionId));
  return json({ images: rows });
});
