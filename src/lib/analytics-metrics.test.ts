import { describe, expect, it } from 'vitest';
import {
  computeDiscriminationIndex,
  computeMedian,
  computeQuartiles,
  computeScoreBuckets,
  filterBestAttempts,
} from './analytics-metrics';

describe('analytics-metrics', () => {
  describe('computeMedian', () => {
    it('returns 0 for empty arrays', () => {
      expect(computeMedian([])).toBe(0);
    });

    it('handles single-item arrays', () => {
      expect(computeMedian([42])).toBe(42);
    });

    it('calculates median for odd-length arrays', () => {
      expect(computeMedian([10, 50, 20])).toBe(20);
      expect(computeMedian([1, 2, 3, 4, 5])).toBe(3);
    });

    it('calculates median for even-length arrays as average of middle elements', () => {
      expect(computeMedian([10, 20, 30, 40])).toBe(25);
      expect(computeMedian([10, 20])).toBe(15);
      expect(computeMedian([10, 15, 20, 25])).toBe(17.5);
    });
  });

  describe('computeQuartiles', () => {
    it('returns zeroes for empty arrays', () => {
      expect(computeQuartiles([])).toEqual({ p25: 0, median: 0, p75: 0, iqr: 0 });
    });

    it('calculates p25, median, p75, and iqr for a dataset', () => {
      const scores = [10, 20, 30, 40, 50, 60, 70, 80];
      const q = computeQuartiles(scores);
      expect(q.median).toBe(45);
      expect(q.p25).toBe(25);
      expect(q.p75).toBe(65);
      expect(q.iqr).toBe(40);
    });
  });

  describe('computeScoreBuckets', () => {
    it('groups scores into negative and quintile buckets', () => {
      const scores = [-10, -2, 30, 50, 100, 150, 200, 280];
      const buckets = computeScoreBuckets(scores, 300);

      expect(buckets).toHaveLength(6);
      expect(buckets[0].range).toBe('< 0');
      expect(buckets[0].count).toBe(2); // -10, -2
      expect(buckets[1].count).toBe(2); // 30, 50 (<= 60)
      expect(buckets[2].count).toBe(1); // 100 (61 - 120)
      expect(buckets[3].count).toBe(1); // 150 (121 - 180)
      expect(buckets[4].count).toBe(1); // 200 (181 - 240)
      expect(buckets[5].count).toBe(1); // 280 (> 240)
    });
  });

  describe('computeDiscriminationIndex', () => {
    it('returns null if either tertile total is zero', () => {
      expect(computeDiscriminationIndex(0, 0, 0, 10)).toBeNull();
      expect(computeDiscriminationIndex(5, 10, 0, 0)).toBeNull();
    });

    it('calculates discrimination index difference between top and bottom tertile', () => {
      // Top group: 8/10 correct = 0.8, Bottom group: 2/10 correct = 0.2
      // DI = 0.8 - 0.2 = 0.6
      expect(computeDiscriminationIndex(8, 10, 2, 10)).toBe(0.6);

      // Inverted discrimination: Top group 2/10, Bottom group 6/10 -> DI = -0.4
      expect(computeDiscriminationIndex(2, 10, 6, 10)).toBe(-0.4);
    });
  });

  describe('filterBestAttempts', () => {
    it('returns the highest-scoring attempt per student', () => {
      const attempts = [
        { studentId: 's1', attemptNo: 1, totalMarks: 120, submittedAt: '2026-09-01T10:00:00Z' },
        { studentId: 's1', attemptNo: 2, totalMarks: 180, submittedAt: '2026-09-02T10:00:00Z' },
        { studentId: 's2', attemptNo: 1, totalMarks: 210, submittedAt: '2026-09-01T10:00:00Z' },
        { studentId: 's2', attemptNo: 2, totalMarks: 195, submittedAt: '2026-09-02T10:00:00Z' },
      ];

      const best = filterBestAttempts(attempts);
      expect(best).toHaveLength(2);

      const s1 = best.find((a) => a.studentId === 's1');
      expect(s1?.totalMarks).toBe(180);

      const s2 = best.find((a) => a.studentId === 's2');
      expect(s2?.totalMarks).toBe(210);
    });
  });
});
