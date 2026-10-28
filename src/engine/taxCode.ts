import type { Region } from "../data/schema";

/**
 * A parsed PAYE tax code.
 * - allowance: tax-free amount (negative for K codes). assumedSuffix is set when the code had no letter.
 * - flat: whole income taxed at one band ("BR" = basic, "D0" = one band above basic, ...)
 * - none: NT, no tax
 * - standard: a letter without a number ("L", "M", "S"...); the allowance is worked out as usual.
 *   M and N set Marriage Allowance (receive and transfer).
 * - noNumberK: a K without its number; no allowance is used.
 */
export type ParsedTaxCode =
  | { kind: "allowance"; allowance: number; region?: Region; assumedSuffix?: "L" }
  | { kind: "flat"; bandsAboveBasic: number; region?: Region }
  | { kind: "none"; region?: Region }
  | { kind: "standard"; marriage?: "transfer" | "receive"; region?: Region }
  | { kind: "noNumberK"; region?: Region };

/** Returns null for an empty code, throws on an unrecognised one. */
export function parseTaxCode(input: string): ParsedTaxCode | null {
  let code = input.toUpperCase().replace(/\s+/g, "");
  if (!code) return null;

  // Emergency / non-cumulative suffixes don't change the annual figure.
  code = code.replace(/(W1|M1|X|NONCUM)$/, "");

  let region: Region | undefined;
  if (code.startsWith("S")) {
    region = "scotland";
    code = code.slice(1);
  } else if (code.startsWith("C")) {
    region = "ruk"; // Wales uses the same rates as England
    code = code.slice(1);
  }
  // A letter O is easy to type for a zero in 0T, D0 and SD0.
  if (code === "OT" || code === "DO") code = code.replace("O", "0");

  // HMRC: "there is no SNT or CNT code".
  if (code === "NT" && !region) return { kind: "none" };
  if (code === "BR") return { kind: "flat", bandsAboveBasic: 0, region };
  // D0/D1 everywhere; Scotland adds D2 (advanced) and D3 (top).
  let m = code.match(region === "scotland" ? /^D([0-3])$/ : /^D([01])$/);
  // D0/D1 without the S prefix are rUK rates (40%/45%) wherever you live.
  if (m) return { kind: "flat", bandsAboveBasic: Number(m[1]) + 1, region: region ?? "ruk" };
  if (code === "0T") return { kind: "allowance", allowance: 0, region };
  // At most 6 digits, no leading zero (HMRC FPS schema). There is no K0; nil allowance is 0T.
  // Payroll turns the number into number × 10 + 9, for K codes too (PAYE tax table routines §4.3.1b).
  m = code.match(/^K([1-9]\d{0,5})$/);
  if (m) return { kind: "allowance", allowance: -(Number(m[1]) * 10 + 9), region };
  // P and Y are withdrawn but still valid on an FPS.
  m = code.match(/^([1-9]\d{0,5})[LMNPTY]$/);
  if (m) return { kind: "allowance", allowance: Number(m[1]) * 10 + 9, region };
  // HMRC never issues a bare number, but it's usually a dropped L. HMRC's own checker accepts it too.
  m = code.match(/^([1-9]\d{0,5})$/);
  if (m) return { kind: "allowance", allowance: Number(m[1]) * 10 + 9, region, assumedSuffix: "L" };

  // Just the letter, as people often know it.
  if (code === "K") return { kind: "noNumberK", region };
  if (code === "M") return { kind: "standard", marriage: "receive", region };
  if (code === "N") return { kind: "standard", marriage: "transfer", region };
  if (code === "" || code === "L" || code === "T") return { kind: "standard", region };

  throw new Error(`Unrecognised tax code "${input}"`);
}
