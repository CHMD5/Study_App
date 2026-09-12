/**
 * Production Administrator / Faculty Provisioning Script.
 *
 * Creates or updates the primary faculty administrator account in PostgreSQL
 * without inserting sample demo students or mock test attempt garbage.
 *
 * Environment variables (optional):
 *   ADMIN_USERNAME   (default: 'Teacher')
 *   ADMIN_PASSWORD   (default: '112345')
 *   ADMIN_FULLNAME   (default: 'Faculty Administrator')
 *   ADMIN_EMAIL      (default: 'admin@srsma.edu')
 *   ADMIN_PHONE      (default: '+919999999999')
 *
 * Usage:
 *   npm run seed:admin
 *   ADMIN_USERNAME="Director" ADMIN_PASSWORD="SecurePass2026!" npm run seed:admin
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '../src/db/client';
import { profiles } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'Teacher').trim();
  const rawPassword = (process.env.ADMIN_PASSWORD || '112345').trim();
  const fullName = (process.env.ADMIN_FULLNAME || 'Faculty Administrator').trim();
  const email = (process.env.ADMIN_EMAIL || 'admin@srsma.edu').trim().toLowerCase();
  const phone = (process.env.ADMIN_PHONE || '+919999999999').trim();

  if (rawPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  console.log(`[seed-admin] provisioning faculty admin: "${username}" (${email})...`);
  const db = await getDb();
  const passwordHash = await hashPassword(rawPassword);

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.username}) = lower(${username})`)
    .limit(1);

  if (existing) {
    await db
      .update(profiles)
      .set({
        fullName,
        role: 'teacher',
        email,
        phone,
        passwordHash,
        canLogin: true,
        isActive: true,
      })
      .where(sql`${profiles.id} = ${existing.id}`);

    console.log(`[seed-admin] updated existing admin account: "${username}"`);
  } else {
    await db.insert(profiles).values({
      username,
      fullName,
      email,
      phone,
      role: 'teacher',
      passwordHash,
      canLogin: true,
      isActive: true,
      batch: 'Faculty',
    });

    console.log(`[seed-admin] created new faculty admin account: "${username}"`);
  }

  console.log('[seed-admin] done. Staff can now log in at /SRSMA with these credentials.');
}

main()
  .catch((err) => {
    console.error('[seed-admin] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
