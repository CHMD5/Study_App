import { eq, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { profiles } from '@/db/schema';

/**
 * GET /api/batches
 * Returns distinct batches and student count per batch.
 */
export const GET = withApi(async () => {
  await apiTeacher();
  const db = await getDb();

  const rows = await db
    .select({
      name: sql<string>`COALESCE(${profiles.batch}, 'General')`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(profiles)
    .where(eq(profiles.role, 'student'))
    .groupBy(sql`COALESCE(${profiles.batch}, 'General')`)
    .orderBy(sql`COALESCE(${profiles.batch}, 'General') ASC`);

  return json({ batches: rows });
});
