import { and, eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questionImages } from '@/db/schema';
import { deleteIfExists } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id: questionId, imageId } = await params;

  const db = await getDb();
  const [image] = await db
    .select()
    .from(questionImages)
    .where(and(eq(questionImages.id, imageId), eq(questionImages.questionId, questionId)));
  if (!image) throw new HttpError(404, 'not_found', 'Image not found.');

  await db.delete(questionImages).where(eq(questionImages.id, imageId));
  await deleteIfExists(image.storagePath);

  return json({ ok: true });
});
