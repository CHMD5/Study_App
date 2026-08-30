/**
 * Shuffle utilities for tests and options.
 *
 * Materialised at attempt start (LLD §4.7 / Local Build Plan §3).
 * Shuffling is stored once so attempts are immutable historical records.
 */

/** Fisher-Yates array shuffle (in-place clone) */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
