import type { Region } from "../data/schema";

/**
 * A parsed PAYE tax code.
 * - allowance: tax-free amount (negative for K codes)
 * - flat: whole income taxed at one band ("BR" = basic, "D0" = one band above basic, ...)
 * - none: NT, no tax
 */
export type ParsedTaxCode =
  | { kind: "allowance"; allowance: number; region?: Region }
  | { kind: "flat"; bandsAboveBasic: number; region?: Region }
  | { kind: "none"; region?: Region };

/** Returns null for an empty code, throws on an unrecognised one. */
export function parseTaxCode(input: string): ParsedTaxCode | null {
  let code = input.toUpperCase().replace(/\s+/g, "");
  if (!code) return null;

  // Emergency / non-cumulative suffixes don't change the annual figure.
  code = code.replace(/(W1|M1|X)$/, "");

  let region: Region | undefined;
  if (code.startsWith("S")) {
    region = "scotland";
    code = code.slice(1);
  } else if (code.startsWith("C")) {
    region = "ruk"; // Wales uses the same rates as England
    code = code.slice(1);
  }

  if (code === "NT") return { kind: "none", region };
  if (code === "BR") return { kind: "flat", bandsAboveBasic: 0, region };
  let m = code.match(/^D(\d)$/);
  // D0/D1 without the S prefix are rUK rates (40%/45%) wherever you live.
  if (m) return { kind: "flat", bandsAboveBasic: Number(m[1]) + 1, region: region ?? "ruk" };
  if (code === "0T") return { kind: "allowance", allowance: 0, region };
  m = code.match(/^K(\d+)$/);
  if (m) return { kind: "allowance", allowance: -Number(m[1]) * 10, region };
  m = code.match(/^(\d+)[LMNTY]$/);
  if (m) return { kind: "allowance", allowance: Number(m[1]) * 10, region };

  throw new Error(`Unrecognised tax code "${input}"`);
}
