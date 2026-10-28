import type { TaxYear } from "../data/schema";
import { calculate, type CalcInput, type CalcResult } from "./calculate";

/** The amounts a pay correction changes. */
const KEYS = [
  "gross",
  "salarySacrifice",
  "incomeTax",
  "nationalInsurance",
  "studentLoan",
  "postgraduateLoan",
  "pensionYou",
  "takeHome",
  "employerNationalInsurance",
] as const satisfies (keyof CalcResult)[];

/** due − paid for each amount: positive means it should have been more. */
export type Adjustment = Record<(typeof KEYS)[number], number>;

export interface PayVariance {
  paid: CalcResult;
  due: CalcResult;
  adjustment: Adjustment;
}

/**
 * What was paid against what should have been paid, on the same settings.
 * Amounts are annual, like `calculate`; scale them to the pay period with `fromAnnual`.
 */
export function payVariance(paid: number, due: number, input: Omit<CalcInput, "salary">, year: TaxYear): PayVariance {
  const a = calculate({ ...input, salary: paid }, year);
  const b = calculate({ ...input, salary: due }, year);
  const adjustment = {} as Adjustment;
  for (const k of KEYS) adjustment[k] = b[k] - a[k];
  return { paid: a, due: b, adjustment };
}
