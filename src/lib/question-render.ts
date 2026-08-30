/** Pure helpers for parsing a question `body` string. No React here, so this
 * is usable from both server routes (the verify gate) and client components
 * (the editor preview) without pulling in a DOM. */

const IMG_TOKEN_RE = /\[\[IMG:([^\]]+)\]\]/g;

export function extractImageTokens(body: string): string[] {
  const ids = [...body.matchAll(IMG_TOKEN_RE)].map((m) => m[1]);
  return [...new Set(ids)];
}

/**
 * A [[IMG:id]] token can appear in the question body OR in an option's body —
 * match-the-column questions routinely put a diagram in one column (LLD §6
 * rule 6), and any option can carry a figure. Every consumer that needs "every
 * placeholder this question references" (ingest validation, the verify gate,
 * the editor's unresolved-image count) must scan both, or an image placeholder
 * living only inside an option silently bypasses whichever check forgot it.
 */
export function extractAllImageTokens(body: string, optionBodies: string[]): string[] {
  return [...new Set([...extractImageTokens(body), ...optionBodies.flatMap(extractImageTokens)])];
}

export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; tex: string; display: boolean }
  | { kind: 'image'; placeholderId: string };

/**
 * Splits a question body into ordered segments: plain text/markdown, $inline$
 * and $$display$$ math, and [[IMG:id]] placeholders. KaTeX renders the math
 * segments; <Katex> (the component) handles that. Kept as a pure string ->
 * data-structure function so it's unit-testable without a DOM.
 */
export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  // Order matters: $$...$$ must be tried before a lone $...$ would otherwise
  // greedily split it in half.
  //
  // The `(?<!\\)` lookbehinds make an escaped `\$` a literal dollar sign, which
  // is what the ingest validator has always assumed (it counts unescaped `$` to
  // detect an unclosed delimiter). Without them the two disagreed: a body the
  // validator accepted as having balanced delimiters could still be split into
  // broken math here, and a price like "\$5" opened a math run.
  const tokenRe = /((?<!\\)\$\$[\s\S]+?(?<!\\)\$\$|(?<!\\)\$[^$\n]+?(?<!\\)\$|\[\[IMG:[^\]]+\]\])/g;

  /** `\$` is a literal dollar once we are no longer scanning for delimiters. */
  const unescape = (text: string) => text.replace(/\\\$/g, '$');

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(body))) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: unescape(body.slice(lastIndex, match.index)) });
    }
    const token = match[0];
    if (token.startsWith('[[IMG:')) {
      segments.push({ kind: 'image', placeholderId: token.slice(6, -2) });
    } else if (token.startsWith('$$')) {
      segments.push({ kind: 'math', tex: token.slice(2, -2), display: true });
    } else {
      segments.push({ kind: 'math', tex: token.slice(1, -1), display: false });
    }
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < body.length) {
    segments.push({ kind: 'text', text: unescape(body.slice(lastIndex)) });
  }
  return segments;
}
