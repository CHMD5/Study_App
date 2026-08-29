import fs from 'node:fs';
import path from 'node:path';
import { PROMPTS_DIR } from './paths';

export type PromptVersion = { version: string; filename: string; text: string };

/**
 * Lists every prompts/extract-v*.txt on disk, newest version first. Adding
 * extract-v2.txt makes it appear in the teacher UI with no code change — this
 * is what lets prompts/extract-v1.txt be revised without redeploying anything.
 */
export function listExtractionPrompts(): PromptVersion[] {
  const files = fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => /^extract-v\d+\.txt$/.test(f))
    .sort((a, b) => versionOf(b) - versionOf(a));

  return files.map((filename) => ({
    version: filename.replace(/\.txt$/, ''),
    filename,
    text: fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8'),
  }));
}

export function getExtractionPrompt(version?: string): PromptVersion {
  const all = listExtractionPrompts();
  if (all.length === 0) throw new Error('no extraction prompts found in prompts/');
  const found = version ? all.find((p) => p.version === version) : all[0];
  return found ?? all[0];
}

export function getTruncationRecoveryPrompt(): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, 'truncation-recovery.txt'), 'utf8');
}

function versionOf(filename: string): number {
  return Number(filename.match(/extract-v(\d+)\.txt/)?.[1] ?? 0);
}
