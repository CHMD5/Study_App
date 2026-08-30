import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { apiTeacher } from '@/lib/auth';
import { HttpError, isUniqueViolation, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { paperKey } from '@/lib/paths';
import { saveBufferWithHash, deleteIfExists } from '@/lib/storage';

export const GET = withApi(async () => {
  await apiTeacher();
  const db = await getDb();
  const rows = await db.select().from(papers).orderBy(desc(papers.createdAt));
  return json({ papers: rows });
});

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // 60MB — generous for a 20-30 page scanned paper

/**
 * Local substitute for the LLD's Drive-registration route. Same idea — register
 * a paper's source document — different transport: multipart upload instead of
 * a Drive share link.
 */
export const POST = withApi(async (req) => {
  const session = await apiTeacher();

  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, 'invalid_request', 'Expected multipart/form-data.');

  const title = String(form.get('title') ?? '').trim();
  const examYearRaw = form.get('examYear');
  const file = form.get('file');

  if (!title) throw new HttpError(422, 'validation_failed', 'Title is required.');
  if (!(file instanceof File)) throw new HttpError(422, 'validation_failed', 'A PDF file is required.');
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new HttpError(422, 'invalid_file_type', 'Only PDF files are accepted.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'file_too_large', `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let pdfPages: number | null = null;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pdfPages = doc.getPageCount();
  } catch {
    throw new HttpError(422, 'invalid_pdf', 'Could not read this file as a PDF.');
  }

  const db = await getDb();

  // sha256 is computed before any write. If it collides with an existing paper,
  // reject with the existing paper named, rather than silently duplicating disk
  // space for a re-upload of the same file.
  const tempHash = createHash('sha256').update(bytes).digest('hex');
  const [dupe] = await db.select().from(papers).where(eq(papers.sha256, tempHash));
  if (dupe) {
    throw new HttpError(409, 'duplicate_paper', `This exact file is already registered as "${dupe.title}".`, {
      existingPaperId: dupe.id,
    });
  }

  const id = crypto.randomUUID();
  const relativeKey = paperKey(id);
  const { sha256, size } = await saveBufferWithHash(relativeKey, bytes);

  try {
    const examYearParsed = examYearRaw ? Number(examYearRaw) : undefined;
    const examYear =
      examYearParsed !== undefined && Number.isInteger(examYearParsed) && examYearParsed >= 1950 && examYearParsed <= 2100
        ? examYearParsed
        : undefined;

    if (examYearRaw && examYear === undefined) {
      throw new HttpError(422, 'validation_failed', 'Exam year must be a four-digit year between 1950 and 2100.');
    }

    // nextPaperCode is not atomic; on the rare collision, recompute and retry
    // once rather than surfacing a raw constraint violation.
    let row;
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = await nextPaperCode(examYear);
      try {
        [row] = await db
          .insert(papers)
          .values({
            id,
            title,
            code,
            examYear: examYear ?? null,
            pdfPages,
            registeredBy: session.userId,
            filePath: relativeKey,
            originalFilename: file.name,
            fileSizeBytes: size,
            sha256,
          })
          .returning();
        break;
      } catch (err) {
        if (attempt === 0 && isUniqueViolation(err)) continue;
        throw err;
      }
    }

    return json(row, 201);
  } catch (err) {
    // Insert failed after the file was already written — clean up so a partial
    // paper doesn't leave an orphaned file with nothing pointing at it.
    await deleteIfExists(relativeKey);
    throw err;
  }
});

/**
 * Next free `<prefix>-<n>` code.
 *
 * Was a full-table scan of every code into a Set, then a linear probe from 1.
 * Now asks the database for the highest suffix already in use for this prefix
 * and adds one — index-friendly, and it doesn't load the whole table.
 *
 * Still not atomic against a concurrent upload, so the caller catches 23505 and
 * retries. That is the right trade here: making it atomic would need a
 * sequence per prefix, and paper registration is a rare, human-paced action.
 */
async function nextPaperCode(examYear?: number): Promise<string> {
  const db = await getDb();
  const prefix = examYear ? `JM${examYear}` : 'JM';

  const [row] = await db
    .select({
      maxN: sql<number>`cast(coalesce(max(substring(${papers.code} from ${`^${prefix}-(\\d+)$`})::int), 0) as int)`,
    })
    .from(papers)
    .where(sql`${papers.code} ~ ${`^${prefix}-\\d+$`}`);

  return `${prefix}-${(row?.maxN ?? 0) + 1}`;
}
