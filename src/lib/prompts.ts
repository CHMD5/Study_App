import fs from 'node:fs';
import path from 'node:path';
import { PROMPTS_DIR } from './paths';

export type PromptKind = 'questions' | 'solutions' | 'both';

export type PromptVersion = {
  version: string;
  filename: string;
  text: string;
  kind: PromptKind;
};

/**
 * Lists prompts on disk filtered by kind, newest version first.
 * - 'questions': extract-v*.txt or extract-questions-v*.txt
 * - 'solutions': extract-solutions-v*.txt
 * - 'both': extract-both-v*.txt
 */
export function listExtractionPrompts(kind: PromptKind = 'questions'): PromptVersion[] {
  let pattern: RegExp;
  if (kind === 'solutions') {
    pattern = /^extract-solutions-v(\d+)\.txt$/;
  } else if (kind === 'both') {
    pattern = /^extract-both-v(\d+)\.txt$/;
  } else {
    pattern = /^extract(?:-questions)?-v(\d+)\.txt$/;
  }

  const files = fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => pattern.test(f))
    .sort((a, b) => {
      const vA = Number(a.match(pattern)?.[1] ?? 0);
      const vB = Number(b.match(pattern)?.[1] ?? 0);
      return vB - vA;
    });

  return files.map((filename) => ({
    version: filename.replace(/\.txt$/, ''),
    filename,
    text: fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf8'),
    kind,
  }));
}

export function getAllExtractionPrompts(): Record<PromptKind, PromptVersion[]> {
  return {
    questions: listExtractionPrompts('questions'),
    solutions: listExtractionPrompts('solutions'),
    both: listExtractionPrompts('both'),
  };
}

export function getExtractionPrompt(kindOrVersion?: PromptKind | string, version?: string): PromptVersion {
  const isKind = kindOrVersion === 'questions' || kindOrVersion === 'solutions' || kindOrVersion === 'both';
  const targetKind: PromptKind = isKind ? (kindOrVersion as PromptKind) : 'questions';
  const targetVersion = isKind ? version : kindOrVersion;

  const all = listExtractionPrompts(targetKind);
  if (all.length === 0) {
    throw new Error(`No extraction prompts found in prompts/ for kind '${targetKind}'`);
  }
  const found = targetVersion ? all.find((p) => p.version === targetVersion) : all[0];
  return found ?? all[0];
}

export function getTruncationRecoveryPrompt(): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, 'truncation-recovery.txt'), 'utf8');
}
