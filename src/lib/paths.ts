import fs from 'node:fs';
import path from 'node:path';

/**
 * Every byte of runtime state lives under DATA_DIR. Deleting it resets the app;
 * copying it is a complete backup. Nothing persistent lives anywhere else.
 */
export const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data');

export const PGDATA_DIR = path.join(DATA_DIR, 'pgdata');
export const PAPERS_DIR = path.join(DATA_DIR, 'papers');
export const IMAGES_DIR = path.join(DATA_DIR, 'images');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle');
export const PROMPTS_DIR = path.resolve(process.cwd(), 'prompts');

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, PAPERS_DIR, IMAGES_DIR, BACKUPS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolve a DATA_DIR-relative path, refusing anything that escapes it.
 *
 * Every path that reaches the filesystem from a URL segment goes through here.
 * `..`, absolute paths, and Windows drive-relative paths all resolve outside
 * DATA_DIR and are rejected before any fs call happens.
 */
export function resolveDataPath(relative: string): string {
  const abs = path.resolve(DATA_DIR, relative);
  const root = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
  if (abs !== DATA_DIR && !abs.startsWith(root)) {
    throw new Error(`path_escapes_data_dir: ${relative}`);
  }
  return abs;
}

/** Storage key for a paper's PDF, relative to DATA_DIR. */
export function paperKey(paperId: string): string {
  return `papers/${paperId}.pdf`;
}

/** Storage key for a cropped question image, relative to DATA_DIR. */
export function imageKey(questionId: string, placeholderId: string): string {
  return `images/${questionId}/${sanitizeSegment(placeholderId)}.webp`;
}

/**
 * Placeholder ids come from LLM output, so they are untrusted. They are used as
 * a filename, so they are reduced to a safe character set before they get there.
 */
export function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  if (!cleaned) throw new Error('empty_segment');
  return cleaned.slice(0, 120);
}
