/**
 * CSV parsing and validation for student bulk roster import.
 */

export type StudentImportRow = {
  fullName: string;
  username: string;
  email: string;
  phone?: string | null;
  batch?: string | null;
  password?: string;
  rowNumber: number;
};

export type StudentImportValidationResult = {
  validRows: StudentImportRow[];
  errors: Array<{ row: number; field: string; message: string }>;
};

/**
 * Splits a CSV line respecting quoted commas.
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Strips dangerous leading formula injection characters.
 */
function sanitizeString(val: string): string {
  let s = val.trim();
  // Safe international phone numbers like +91 9876543210 are not formula injections
  if (/^\+\d[\d\s-]*$/.test(s)) {
    return s;
  }
  if (/^['"=+\-@\t\r]/.test(s)) {
    s = s.replace(/^['"=+\-@\t\r]+/, '').trim();
  }
  return s;
}

/**
 * Parses and validates CSV string content into student rows.
 */
export function parseStudentCsv(csvText: string): StudentImportValidationResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errors: Array<{ row: number; field: string; message: string }> = [];
  const validRows: StudentImportRow[] = [];

  if (lines.length === 0) {
    return { validRows: [], errors: [{ row: 0, field: 'csv', message: 'CSV file is empty' }] };
  }

  // Header row normalization
  const headerCells = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[\s_-]+/g, ''),
  );

  const nameIdx = headerCells.findIndex((h) => ['fullname', 'name', 'studentname'].includes(h));
  const usernameIdx = headerCells.findIndex((h) => ['username', 'user', 'login'].includes(h));
  const emailIdx = headerCells.findIndex((h) => ['email', 'emailaddress', 'mail'].includes(h));
  const phoneIdx = headerCells.findIndex((h) => ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact'].includes(h));
  const batchIdx = headerCells.findIndex((h) => ['batch', 'cohort', 'section', 'group'].includes(h));
  const passIdx = headerCells.findIndex((h) => ['password', 'pass', 'pwd'].includes(h));

  if (nameIdx === -1 || usernameIdx === -1 || emailIdx === -1) {
    const missing: string[] = [];
    if (nameIdx === -1) missing.push('full_name');
    if (usernameIdx === -1) missing.push('username');
    if (emailIdx === -1) missing.push('email');

    return {
      validRows: [],
      errors: [
        {
          row: 1,
          field: 'headers',
          message: `Missing required header column(s): ${missing.join(', ')}. Expected: full_name, username, email, phone, batch, password`,
        },
      ],
    };
  }

  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cells = parseCsvLine(lines[i]);

    if (cells.length === 1 && cells[0] === '') continue;

    let hasRowError = false;
    const rawName = cells[nameIdx] ?? '';
    const rawUsername = cells[usernameIdx] ?? '';
    const rawEmail = cells[emailIdx] ?? '';
    const rawPhone = phoneIdx !== -1 ? (cells[phoneIdx] ?? '') : '';
    const rawBatch = batchIdx !== -1 ? (cells[batchIdx] ?? '') : '';
    const rawPass = passIdx !== -1 ? (cells[passIdx] ?? '') : '';

    const fullName = sanitizeString(rawName);
    const username = sanitizeString(rawUsername);
    const email = sanitizeString(rawEmail).toLowerCase();
    const phone = rawPhone ? sanitizeString(rawPhone) : null;
    const batch = rawBatch ? sanitizeString(rawBatch) : null;
    const password = rawPass ? rawPass.trim() : '112345';

    // Validations
    if (!fullName) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'full_name', message: 'Full name is required' });
    }

    if (!username) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'username', message: 'Username is required' });
    } else if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      hasRowError = true;
      errors.push({
        row: rowNum,
        field: 'username',
        message: 'Username may only contain letters, numbers, hyphens, periods, and underscores',
      });
    } else if (seenUsernames.has(username.toLowerCase())) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'username', message: `Duplicate username in CSV: "${username}"` });
    } else {
      seenUsernames.add(username.toLowerCase());
    }

    if (!email) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'email', message: 'Email address is required' });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'email', message: `Invalid email address format: "${email}"` });
    } else if (seenEmails.has(email)) {
      hasRowError = true;
      errors.push({ row: rowNum, field: 'email', message: `Duplicate email in CSV: "${email}"` });
    } else {
      seenEmails.add(email);
    }

    if (!hasRowError) {
      validRows.push({
        fullName,
        username,
        email,
        phone: phone || null,
        batch: batch || null,
        password,
        rowNumber: rowNum,
      });
    }
  }

  return { validRows, errors };
}
