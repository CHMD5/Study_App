import { describe, expect, it } from 'vitest';
import { parseIngestJson, repairJsonString } from './json-repair';
import { IngestPayload } from './zod/ingest';

describe('json-repair', () => {
  it('parses valid JSON without modification', () => {
    const raw = '{"a": 1, "b": "hello"}';
    const { parsed, repaired } = parseIngestJson(raw);
    expect(repaired).toBe(false);
    expect(parsed).toEqual({ a: 1, b: 'hello' });
  });

  it('repairs unescaped LaTeX backslashes like \\epsilon and \\mathrm', () => {
    const raw = '{"body": "Laser $\\epsilon_0 = 9 \\times 10^{-12}\\mathrm{SI}$"}';
    const { parsed, repaired } = parseIngestJson<{ body: string }>(raw);
    expect(repaired).toBe(true);
    expect(parsed.body).toBe('Laser $\\epsilon_0 = 9 \\times 10^{-12}\\mathrm{SI}$');
  });

  it('preserves real JSON newlines and escaped quotes', () => {
    const raw = '{"text": "Line 1\\nLine 2\\n\\"quoted\\""}';
    const { parsed } = parseIngestJson<{ text: string }>(raw);
    expect(parsed.text).toBe('Line 1\nLine 2\n"quoted"');
  });

  it('repairs full JEE paper JSON with unescaped math commands', () => {
    const raw = `{
      "paperMeta": {
        "detectedTitle": null,
        "totalQuestionsFound": 2
      },
      "questions": [
        {
          "sourceQno": 1,
          "subject": "physics",
          "type": "mcq",
          "body": "A $27\\\\,\\mathrm{mW}$ laser beam has a cross-sectional area of $10\\\\,\\mathrm{mm^2}$. The magnitude of the maximum electric field in this electromagnetic wave is given by [Given permittivity of space $\\epsilon_0 = 9 \\times 10^{-12}\\mathrm{\\\\ SI\\\\ units}$, Speed of light $\\mathrm{c} = 3 \\times 10^8\\\\,\\mathrm{m/s}$]:-",
          "options": [
            { "key": "A", "body": "$1\\\\,\\mathrm{kV/m}$" },
            { "key": "B", "body": "$2\\\\,\\mathrm{kV/m}$" },
            { "key": "C", "body": "$1.4\\\\,\\mathrm{kV/m}$" },
            { "key": "D", "body": "$0.7\\\\,\\mathrm{kV/m}$" }
          ],
          "imagePlaceholders": [],
          "uncertain": []
        },
        {
          "sourceQno": 2,
          "subject": "physics",
          "type": "mcq",
          "body": "How will the reading of ammeter change if the key k is closed ?\\n\\n[[IMG:q2_1]]",
          "options": [
            { "key": "A", "body": "Increase" },
            { "key": "B", "body": "Decrease" },
            { "key": "C", "body": "Remains same" },
            { "key": "D", "body": "Information insufficient" }
          ],
          "imagePlaceholders": [
            {
              "id": "q2_1",
              "hint": "Circuit network with resistors R and 2R, key K, ammeter, and DC voltage source"
            }
          ],
          "uncertain": []
        }
      ]
    }`;

    const { parsed, repaired } = parseIngestJson(raw);
    expect(repaired).toBe(true);
    const validated = IngestPayload.safeParse(parsed);
    expect(validated.success).toBe(true);
    if (validated.success) {
      expect(validated.data.questions.length).toBe(2);
      expect(validated.data.questions[0].options[0].body).toContain('kV/m');
    }
  });
});
