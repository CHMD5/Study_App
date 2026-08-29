import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { imageKey, paperKey, resolveDataPath } from './paths';

/** Streams a Web ReadableStream/Buffer to disk while computing its sha256. */
export async function saveBufferWithHash(
  relativeKey: string,
  bytes: Buffer,
): Promise<{ absPath: string; sha256: string; size: number }> {
  const absPath = resolveDataPath(relativeKey);
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  await fsp.writeFile(absPath, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { absPath, sha256, size: bytes.length };
}

export function paperAbsPath(relativeKey: string): string {
  return resolveDataPath(relativeKey);
}

export async function deleteIfExists(relativeKey: string): Promise<void> {
  const abs = resolveDataPath(relativeKey);
  await fsp.rm(abs, { force: true });
}

export async function readBuffer(relativeKey: string): Promise<Buffer> {
  return fsp.readFile(resolveDataPath(relativeKey));
}

export function existsSync(relativeKey: string): boolean {
  return fs.existsSync(resolveDataPath(relativeKey));
}

export async function saveQuestionImage(
  questionId: string,
  placeholderId: string,
  bytes: Buffer,
): Promise<{ relativeKey: string; size: number }> {
  const relativeKey = imageKey(questionId, placeholderId);
  const abs = resolveDataPath(relativeKey);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, bytes);
  return { relativeKey, size: bytes.length };
}

export async function deleteQuestionImageDir(questionId: string): Promise<void> {
  await fsp.rm(resolveDataPath(`images/${questionId}`), { recursive: true, force: true });
}

export { paperKey };
