import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
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
    const examYear = examYearRaw ? Number(examYearRaw) : undefined;
    const code = await nextPaperCode(examYear);
    const [row] = await db
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

    return json(row, 201);
  } catch (err) {
    // Insert failed after the file was already written — clean up so a partial
    // paper doesn't leave an orphaned file with nothing pointing at it.
    await deleteIfExists(relativeKey);
    throw err;
  }
});

async function nextPaperCode(examYear?: number): Promise<string> {
  const db = await getDb();
  const prefix = examYear ? `JM${examYear}` : 'JM';
  const rows = await db.select({ code: papers.code }).from(papers);
  const existing = new Set(rows.map((r) => r.code));
  let n = 1;
  while (existing.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}
