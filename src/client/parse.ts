/** "35000", "35,000", "£35,000.50" and "35k" are fine; "35,5" and "abc" are not. */
export function parseAmount(raw: string): number | undefined | null {
  const s = raw.trim().replace(/^£\s*/, "").replace(/\s+/g, "").toLowerCase();
  if (s === "") return undefined;
  const m = /^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(k?)$/.exec(s);
  if (!m) return null;
  return parseFloat(m[1]!.replace(/,/g, "")) * (m[2] ? 1000 : 1);
}
