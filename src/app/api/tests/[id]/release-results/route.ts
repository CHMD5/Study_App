import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const [updated] = await db
    .update(tests)
    .set({ releasedAt: new Date() })
    .where(eq(tests.id, id))
    .returning();

  return json(updated);
});
