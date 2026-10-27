import type { Band, LoanPlanId, Region, TaxYear } from "../data/schema";
import { parseTaxCode } from "./taxCode";

export type PensionMethod = "salarySacrifice" | "netPay" | "reliefAtSource";

export interface PensionInput {
  /** Percent of the basis, or annual £ when type is "fixed". For relief at source this is the gross (total) amount. */
  amount: number;
  type: "percent" | "fixed";
  /** "qualifying" = auto-enrolment qualifying earnings band only. */
  basis: "full" | "qualifying";
  method: PensionMethod;
}

export interface CalcInput {
  /** Annual gross pay, including overtime and bonuses. */
  salary: number;
  region: Region;
  /** Optional PAYE code; when set, it replaces the calculated allowance. */
  taxCode?: string;
  pension?: PensionInput;
  studentLoans?: LoanPlanId[];
  blind?: boolean;
  marriageAllowance?: "none" | "transfer" | "receive";
  /** Over State Pension age: no employee National Insurance. */
  overPensionAge?: boolean;
}

export interface BandResult {
  name: string;
  rate: number;
  taxable: number;
  tax: number;
}

export interface CalcResult {
  /** Positive when a K code's 50% cap defers tax to later; already taken off incomeTax. */
  taxDeferred: number;
  yearId: string;
  region: Region;
  gross: number;
  salarySacrifice: number;
  allowance: number;
  taxable: number;
  bands: BandResult[];
  incomeTax: number;
  nationalInsurance: number;
  employerNationalInsurance: number;
  studentLoan: number;
  postgraduateLoan: number;
  /** What leaves your pay (sacrifice, net pay or the 80% you pay under relief at source). */
  pensionYou: number;
  /** What lands in the pension pot from you, including tax relief added by the provider. */
  pensionTotal: number;
  takeHome: number;
  warnings: string[];
}

const UNDERGRAD_PLANS: LoanPlanId[] = ["plan1", "plan2", "plan4", "plan5"];
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function basicBandIndex(bands: Band[]) {
  const i = bands.findIndex((b) => b.name.toLowerCase() === "basic");
  if (i < 0) throw new Error('Tax bands need one named "basic"');
  return i;
}

/**
 * Marriage Allowance needs both partners below higher rate (Scotland: intermediate or below).
 * Relief-at-source contributions extend that limit.
 */
function aboveMarriageLimit(taxable: number, bands: Band[], extension: number) {
  const higher = bands.findIndex((b) => b.name.toLowerCase() === "higher");
  const limit = higher > 0 ? bands[higher - 1]!.upTo : null;
  return limit !== null ? taxable > limit + extension : false;
}

function taxOnBands(taxable: number, bands: Band[]): BandResult[] {
  let lower = 0;
  return bands.map((b) => {
    const upper = b.upTo ?? Infinity;
    const inBand = clamp(taxable, lower, upper) - lower;
    lower = upper;
    return { name: b.name, rate: b.rate, taxable: inBand, tax: inBand * b.rate };
  });
}

function pensionContribution(salary: number, year: TaxYear, p?: PensionInput) {
  if (!p || p.amount <= 0) return 0;
  if (p.type === "fixed") return Math.min(p.amount, salary);
  const { qualifyingEarningsLower: lo, qualifyingEarningsUpper: hi } = year.pension;
  const base = p.basis === "qualifying" ? clamp(salary, lo, hi) - lo : salary;
  return Math.min((base * p.amount) / 100, salary);
}

export function calculate(input: CalcInput, year: TaxYear): CalcResult {
  const warnings: string[] = [];
  const salary = Math.max(0, input.salary || 0);
  const parsedCode = input.taxCode ? parseTaxCode(input.taxCode) : null;
  const region = parsedCode?.region ?? input.region;
  const bands = year.incomeTax.bands[region];

  // Pension
  const contribution = pensionContribution(salary, year, input.pension);
  const method = input.pension?.method ?? "netPay";
  const salarySacrifice = method === "salarySacrifice" ? contribution : 0;
  const netPayPension = method === "netPay" ? contribution : 0;
  const reliefAtSourceGross = method === "reliefAtSource" ? contribution : 0;
  // Under relief at source the provider claims UK basic-rate relief (even in Scotland); you pay the rest.
  // UK basic rate (20% today): relief-at-source top-up and the Marriage Allowance credit both use it.
  const ukBasicRate = year.incomeTax.bands.ruk[basicBandIndex(year.incomeTax.bands.ruk)]!.rate;
  const reliefAtSourceNet = reliefAtSourceGross * (1 - ukBasicRate);

  const payAfterSacrifice = salary - salarySacrifice;
  const taxablePay = payAfterSacrifice - netPayPension;

  // Income tax
  let allowance = 0;
  let incomeTax = 0;
  let taxable = 0;
  let taxDeferred = 0;
  let bandResults: BandResult[] = bands.map((b) => ({ name: b.name, rate: b.rate, taxable: 0, tax: 0 }));
  const it = year.incomeTax;

  if (parsedCode?.kind === "none") {
    // NT: no tax at all
  } else if (parsedCode?.kind === "flat") {
    const idx = basicBandIndex(bands) + parsedCode.bandsAboveBasic;
    const band = bands[Math.min(idx, bands.length - 1)]!;
    taxable = taxablePay;
    incomeTax = taxablePay * band.rate;
    bandResults = bandResults.map((b) => (b.name === band.name ? { ...b, taxable, tax: incomeTax } : b));
  } else {
    if (parsedCode) {
      allowance = parsedCode.allowance;
    } else {
      const adjustedNetIncome = taxablePay - reliefAtSourceGross;
      const taper = Math.max(0, adjustedNetIncome - it.taperThreshold) * it.taperRate;
      allowance = Math.max(0, it.personalAllowance - taper);
      if (input.blind) allowance += it.blindPersonsAllowance;
      if (input.marriageAllowance === "transfer") {
        const reduced = Math.max(0, allowance - it.marriageAllowanceTransfer);
        if (aboveMarriageLimit(Math.max(0, taxablePay - reduced), bands, reliefAtSourceGross))
          warnings.push("Marriage Allowance can't be transferred by a higher-rate taxpayer.");
        else allowance = reduced;
      }
    }
    taxable = Math.max(0, taxablePay - allowance);
    bandResults = taxOnBands(taxable, bands);
    incomeTax = bandResults.reduce((s, b) => s + b.tax, 0);
    // K codes: tax can't exceed half of taxable pay (the "overriding limit").
    if (allowance < 0 && incomeTax > taxablePay * 0.5) {
      taxDeferred = incomeTax - taxablePay * 0.5;
      incomeTax -= taxDeferred;
      warnings.push("K code tax capped at 50% of pay; the rest is collected later.");
    }

    if (!parsedCode && input.marriageAllowance === "receive") {
      if (aboveMarriageLimit(taxable, bands, reliefAtSourceGross)) warnings.push("Marriage Allowance can only be received by basic-rate taxpayers.");
      else incomeTax = Math.max(0, incomeTax - it.marriageAllowanceTransfer * ukBasicRate);
    }
  }

  // National Insurance (Class 1, category A; annualised)
  const ni = year.nationalInsurance;
  const nationalInsurance = input.overPensionAge
    ? 0
    : (clamp(payAfterSacrifice, ni.primaryThreshold, ni.upperEarningsLimit) - ni.primaryThreshold) * ni.mainRate +
      Math.max(0, payAfterSacrifice - ni.upperEarningsLimit) * ni.upperRate;
  const employerNationalInsurance =
    Math.max(0, payAfterSacrifice - ni.employer.secondaryThreshold) * ni.employer.rate;

  // Student loans: one deduction across undergraduate plans, using the lowest threshold held
  const chosen = input.studentLoans ?? [];
  for (const id of chosen) {
    if (!year.studentLoans[id]) warnings.push(`${planLabel(id)} repayments don't apply in ${year.label}.`);
  }
  const undergrad = UNDERGRAD_PLANS.filter((id) => chosen.includes(id))
    .map((id) => year.studentLoans[id])
    .filter((p) => p !== undefined)
    .sort((a, b) => a.threshold - b.threshold)[0];
  const studentLoan = undergrad ? Math.max(0, payAfterSacrifice - undergrad.threshold) * undergrad.rate : 0;
  const pg = chosen.includes("postgraduate") ? year.studentLoans.postgraduate : undefined;
  const postgraduateLoan = pg ? Math.max(0, payAfterSacrifice - pg.threshold) * pg.rate : 0;

  if (contribution > year.pension.annualAllowance)
    warnings.push(`Pension contributions over the £${year.pension.annualAllowance.toLocaleString("en-GB")} annual allowance may be taxed.`);

  const pensionYou = salarySacrifice + netPayPension + reliefAtSourceNet;
  const takeHome = salary - incomeTax - nationalInsurance - studentLoan - postgraduateLoan - pensionYou;

  return {
    yearId: year.id,
    region,
    gross: salary,
    salarySacrifice,
    allowance,
    taxable,
    taxDeferred,
    bands: bandResults,
    incomeTax,
    nationalInsurance,
    employerNationalInsurance,
    studentLoan,
    postgraduateLoan,
    pensionYou,
    pensionTotal: contribution,
    takeHome,
    warnings,
  };
}

export function planLabel(id: LoanPlanId) {
  return id === "postgraduate" ? "Postgraduate Loan" : `Student Loan Plan ${id.slice(4)}`;
}

/** Share of the next £1 of pay lost to tax, NI and loans (ignores pension). */
export function marginalRate(input: CalcInput, year: TaxYear) {
  const step = 1;
  const a = calculate(input, year);
  const b = calculate({ ...input, salary: input.salary + step }, year);
  const lost = (r: CalcResult) => r.incomeTax + r.nationalInsurance + r.studentLoan + r.postgraduateLoan;
  return (lost(b) - lost(a)) / step;
}

/**
 * Lowest annual gross that reaches an annual take-home figure.
 * Take-home can dip as pay rises (e.g. losing Marriage Allowance), so scan for the first
 * salary that reaches the target, then bisect within that step.
 */
export function requiredSalary(targetTakeHome: number, input: Omit<CalcInput, "salary">, year: TaxYear) {
  if (targetTakeHome <= 0) return 0;
  const reaches = (salary: number) => calculate({ ...input, salary }, year).takeHome >= targetTakeHome;
  let hi = Math.max(targetTakeHome * 2, 20_000);
  while (!reaches(hi)) {
    hi *= 2;
    if (hi > 1e9) return NaN;
  }
  const step = Math.max(25, hi / 20_000);
  let s = 0;
  while (s < hi && !reaches(s)) s += step;
  let lo = Math.max(0, s - step);
  hi = Math.min(s, hi);
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
