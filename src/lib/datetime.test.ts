import { describe, expect, it } from 'vitest';
import { fromLocalInputValue, toLocalInputValue } from './datetime';

/**
 * Regression cover for A-13.
 *
 * The test builder rendered a datetime-local input with `iso.slice(0, 16)` and
 * read it back with `new Date(value).toISOString()`. Those are not inverses:
 * slicing drops the `Z`, so the browser read a UTC wall-clock time as LOCAL,
 * and saving added the offset back on. At IST (+05:30) a 09:00 window became
 * 14:30 on the first save and 20:00 on the second — it compounded every time
 * the settings tab was opened.
 */
describe('datetime-local round trip', () => {
  it('is lossless to the minute', () => {
    const instants = [
      '2026-08-30T09:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:00.000Z',
      '2026-06-15T18:30:00.000Z',
    ];

    for (const iso of instants) {
      const roundTripped = fromLocalInputValue(toLocalInputValue(iso));
      expect(roundTripped, `round trip changed ${iso}`).not.toBeNull();
      // Compare at minute resolution — the input has no seconds field.
      expect(new Date(roundTripped!).getTime()).toBe(Math.floor(new Date(iso).getTime() / 60_000) * 60_000);
    }
  });

  it('renders the local wall-clock time, not the UTC one', () => {
    const iso = '2026-08-30T09:00:00.000Z';
    const local = toLocalInputValue(iso);
    const date = new Date(iso);

    const expected =
      `${date.getFullYear()}-` +
      `${String(date.getMonth() + 1).padStart(2, '0')}-` +
      `${String(date.getDate()).padStart(2, '0')}T` +
      `${String(date.getHours()).padStart(2, '0')}:` +
      `${String(date.getMinutes()).padStart(2, '0')}`;

    expect(local).toBe(expected);
  });

  it('does not drift when applied repeatedly, as a settings tab would', () => {
    let value = toLocalInputValue('2026-08-30T09:00:00.000Z');
    const first = value;

    // Open the settings tab and save, five times over.
    for (let i = 0; i < 5; i++) {
      value = toLocalInputValue(fromLocalInputValue(value));
    }

    expect(value).toBe(first);
  });

  it('treats empty and invalid input as no value', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(toLocalInputValue('')).toBe('');
    expect(toLocalInputValue('not a date')).toBe('');
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue(null)).toBeNull();
    expect(fromLocalInputValue('nonsense')).toBeNull();
  });
});
