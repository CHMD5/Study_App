/**
 * Safely parses JSON strings produced by LLMs (e.g. Gemini, ChatGPT) that may
 * contain unescaped or improperly escaped LaTeX backslashes inside string literals.
 *
 * LLMs frequently produce `\epsilon` (invalid JSON escape `\e`), `\mathrm` (`\m`),
 * `\alpha` (`\a`), or single-backslash `\times` (which would otherwise parse as
 * a tab character `\t` + `imes`).
 */
export function repairJsonString(jsonStr: string): string {
  let inString = false;
  let out = '';
  let i = 0;

  while (i < jsonStr.length) {
    const c = jsonStr[i];

    if (!inString) {
      if (c === '"') inString = true;
      out += c;
      i++;
    } else {
      if (c === '"') {
        inString = false;
        out += c;
        i++;
      } else if (c === '\\') {
        const next = jsonStr[i + 1];

        if (next === undefined) {
          out += '\\\\';
          i++;
          continue;
        }

        if (next === '\\') {
          // Already escaped backslash \\
          out += '\\\\';
          i += 2;
        } else if (next === '"' || next === '/') {
          // Standard JSON escape for quotes or forward slash
          out += '\\' + next;
          i += 2;
        } else if (next === 'n') {
          // Check if this is a LaTeX token like \nu, \neq, \nabla, \notin, \ni, \not
          const after = jsonStr.slice(i + 2, i + 8);
          if (/^(u|eq|abla|otin|i|ot)\b/.test(after)) {
            out += '\\\\n';
            i += 2;
          } else {
            out += '\\n';
            i += 2;
          }
        } else if (next === 't') {
          // Check if this is LaTeX like \times, \theta, \tau, \tan, \text, \to, \tilde
          const after = jsonStr.slice(i + 2, i + 8);
          if (/^(imes|heta|au|an|ext|o|ilde|frac)\b/.test(after)) {
            out += '\\\\t';
            i += 2;
          } else {
            out += '\\t';
            i += 2;
          }
        } else if (next === 'r') {
          // Check if this is LaTeX like \rho, \right, \rangle, \rm
          const after = jsonStr.slice(i + 2, i + 8);
          if (/^(ho|ight|angle|m)\b/.test(after)) {
            out += '\\\\r';
            i += 2;
          } else {
            out += '\\r';
            i += 2;
          }
        } else if (next === 'b') {
          // Check if this is LaTeX like \beta, \begin, \binom, \bar, \big, \bullet, \bmatrix
          const after = jsonStr.slice(i + 2, i + 8);
          if (/^(eta|egin|inom|ar|ig|ullet|matrix)\b/.test(after)) {
            out += '\\\\b';
            i += 2;
          } else {
            out += '\\b';
            i += 2;
          }
        } else if (next === 'f') {
          // Check if this is LaTeX like \frac, \forall, \flat
          const after = jsonStr.slice(i + 2, i + 8);
          if (/^(rac|orall|lat)\b/.test(after)) {
            out += '\\\\f';
            i += 2;
          } else {
            out += '\\f';
            i += 2;
          }
        } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(jsonStr.slice(i + 2, i + 6))) {
          // Valid Unicode escape sequence \uXXXX
          out += jsonStr.slice(i, i + 6);
          i += 6;
        } else {
          // Any other character (e.g. \e in \epsilon, \m in \mathrm, \a in \alpha, \p in \pm, \, etc.)
          // must be escaped to a literal backslash \\ in JSON
          out += '\\\\';
          i++;
        }
      } else {
        out += c;
        i++;
      }
    }
  }

  return out;
}

export function parseIngestJson<T = unknown>(jsonStr: string): { parsed: T; repaired: boolean } {
  try {
    return { parsed: JSON.parse(jsonStr) as T, repaired: false };
  } catch {
    const repairedStr = repairJsonString(jsonStr);
    return { parsed: JSON.parse(repairedStr) as T, repaired: true };
  }
}
