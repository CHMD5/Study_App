import { eq } from 'drizzle-orm';
import { apiSession } from '@/lib/auth';
import { HttpError, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { papers } from '@/db/schema';
import { paperAbsPath, existsSync } from '@/lib/storage';
import fs from 'node:fs';
import { Readable } from 'node:stream';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Streams PDF bytes for the viewer/crop tool. In production this same route
 * calls `drive.files.get({ fileId, alt: 'media' })` with a service-account
 * credential and streams the response; here it streams a local file. The
 * response shape is identical either way, so the crop tool (stage 3) is built
 * against a route contract, not a storage mechanism.
 *
 * Any signed-in user may read a paper's PDF — teachers use it directly for
 * review; students never have a path to this route because nothing in the
 * student UI links to it.
 */
export const GET = withApi<Ctx>(async (_req, { params }) => {
  await apiSession();
  const { id } = await params;

  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) throw new HttpError(404, 'not_found', 'Paper not found.');
  if (!existsSync(paper.filePath)) {
    throw new HttpError(410, 'file_missing', 'The source PDF is registered but missing on disk.');
  }

  const absPath = paperAbsPath(paper.filePath);
  const stat = fs.statSync(absPath);
  const webStream = Readable.toWeb(fs.createReadStream(absPath)) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(stat.size),
      'Content-Disposition': `inline; filename="${encodeURIComponent(paper.originalFilename)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
