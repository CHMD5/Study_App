/**
 * Conversions between an ISO-8601 UTC instant and the value an
 * `<input type="datetime-local">` expects.
 *
 * The test builder used to do this with `iso.slice(0, 16)` in one direction and
 * `new Date(localString).toISOString()` in the other. Those are not inverses:
 * slicing strips the `Z`, so the input rendered a UTC wall-clock time but the
 * browser read it as LOCAL; saving then converted that same wall-clock reading
 * from local to UTC and added the offset. At IST (+05:30) a window set for
 * 09:00 saved as 14:30, then 20:00 on the next save — it compounded on every
 * visit to the settings tab.
 */

/** ISO instant → `YYYY-MM-DDTHH:mm` in the viewer's local timezone. */
export function toLocalInputValue(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';

  // Shift by the offset so the UTC-based toISOString() prints local wall time.
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMs).toISOString().slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` in local time → ISO instant, or null when empty. */
export function fromLocalInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  // `new Date('2026-08-30T09:00')` — no zone designator — is parsed as local
  // time by every modern engine, which is exactly what the input means.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
