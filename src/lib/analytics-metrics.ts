/**
 * Statistical and psychometric calculations for JEE test analytics.
 * Pure functions, zero database or runtime dependencies.
 */

/**
 * Calculates the exact median of an array of numbers.
 * Handles both odd and even sample sizes cleanly.
 */
export function computeMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  const avg = (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(avg * 10) / 10;
}

/**
 * Computes 25th percentile (Q1), median (Q2), 75th percentile (Q3), and IQR.
 * Uses standard method: median of lower half and upper half.
 */
export function computeQuartiles(numbers: number[]): {
  p25: number;
  median: number;
  p75: number;
  iqr: number;
} {
  if (numbers.length === 0) {
    return { p25: 0, median: 0, p75: 0, iqr: 0 };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const median = computeMedian(sorted);

  const mid = Math.floor(sorted.length / 2);
  const lowerHalf = sorted.length % 2 === 0 ? sorted.slice(0, mid) : sorted.slice(0, mid);
  const upperHalf = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);

  const p25 = lowerHalf.length > 0 ? computeMedian(lowerHalf) : median;
  const p75 = upperHalf.length > 0 ? computeMedian(upperHalf) : median;
  const iqr = Math.round(Math.max(0, p75 - p25) * 10) / 10;

  return { p25, median, p75, iqr };
}

export type ScoreBucket = {
  range: string;
  min: number;
  max: number;
  count: number;
  pct: number;
};

/**
 * Derives score distribution buckets relative to the test's maximum marks.
 * Generates negative scores (< 0) plus five positive quintiles (0-20%, 21-40%, etc.).
 */
export function computeScoreBuckets(scores: number[], maxMarks: number = 300): ScoreBucket[] {
  const safeMax = maxMarks > 0 ? maxMarks : 300;
  const total = scores.length;

  const b0_20Max = Math.round(safeMax * 0.2);
  const b21_40Max = Math.round(safeMax * 0.4);
  const b41_60Max = Math.round(safeMax * 0.6);
  const b61_80Max = Math.round(safeMax * 0.8);

  const buckets: ScoreBucket[] = [
    {
      range: '< 0',
      min: -Infinity,
      max: -0.01,
      count: 0,
      pct: 0,
    },
    {
      range: `0 – ${b0_20Max}`,
      min: 0,
      max: b0_20Max,
      count: 0,
      pct: 0,
    },
    {
      range: `${b0_20Max + 1} – ${b21_40Max}`,
      min: b0_20Max + 0.001,
      max: b21_40Max,
      count: 0,
      pct: 0,
    },
    {
      range: `${b21_40Max + 1} – ${b41_60Max}`,
      min: b21_40Max + 0.001,
      max: b41_60Max,
      count: 0,
      pct: 0,
    },
    {
      range: `${b41_60Max + 1} – ${b61_80Max}`,
      min: b41_60Max + 0.001,
      max: b61_80Max,
      count: 0,
      pct: 0,
    },
    {
      range: `${b61_80Max + 1} – ${safeMax}`,
      min: b61_80Max + 0.001,
      max: Infinity,
      count: 0,
      pct: 0,
    },
  ];

  for (const s of scores) {
    if (s < 0) {
      buckets[0].count++;
    } else if (s <= b0_20Max) {
      buckets[1].count++;
    } else if (s <= b21_40Max) {
      buckets[2].count++;
    } else if (s <= b41_60Max) {
      buckets[3].count++;
    } else if (s <= b61_80Max) {
      buckets[4].count++;
    } else {
      buckets[5].count++;
    }
  }

  for (const b of buckets) {
    b.pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
  }

  return buckets;
}

/**
 * Calculates psychometric Item Discrimination Index (DI).
 * DI = (Correct in top tertile / Total in top tertile) - (Correct in bottom tertile / Total in bottom tertile)
 * Returns a value between -1.00 and +1.00, or null if insufficient data.
 *
 * Interpretation:
 *  >= 0.40 : Very good item
 *  0.20 - 0.39 : Acceptable
 *  0.00 - 0.19 : Poor discrimination
 *  < 0.00 : Problematic item (distractor pulls top students)
 */
export function computeDiscriminationIndex(
  highGroupCorrect: number,
  highGroupTotal: number,
  lowGroupCorrect: number,
  lowGroupTotal: number,
): number | null {
  if (highGroupTotal <= 0 || lowGroupTotal <= 0) return null;
  const pHigh = highGroupCorrect / highGroupTotal;
  const pLow = lowGroupCorrect / lowGroupTotal;
  const di = pHigh - pLow;
  return Math.round(di * 100) / 100;
}

/**
 * Filters a list of attempts down to the best attempt per student.
 * If multiple attempts tie on totalMarks, chooses the earliest submitted attempt.
 */
export function filterBestAttempts<
  T extends { studentId: string; totalMarks: number | string | null; submittedAt?: string | null },
>(attempts: T[]): T[] {
  const map = new Map<string, T>();

  for (const a of attempts) {
    const marks = Number(a.totalMarks ?? 0);
    const existing = map.get(a.studentId);
    if (!existing) {
      map.set(a.studentId, a);
      continue;
    }

    const existingMarks = Number(existing.totalMarks ?? 0);
    if (marks > existingMarks) {
      map.set(a.studentId, a);
    } else if (marks === existingMarks) {
      // Tie breaker: earliest submitted
      const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity;
      const exTime = existing.submittedAt ? new Date(existing.submittedAt).getTime() : Infinity;
      if (aTime < exTime) {
        map.set(a.studentId, a);
      }
    }
  }

  return Array.from(map.values());
}
