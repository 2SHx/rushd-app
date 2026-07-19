// Minimal CSV parsing for the committed fixtures only (no quoted-comma fields present — verified
// against the fixture at write time). Lazy-dev ladder: no CSV dep is installed (rung 5 fails) and
// the fixture shape doesn't need one (rung 6/7 — a plain split suffices).
export interface ParsedCsv {
  header: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
  return { header, rows };
}
