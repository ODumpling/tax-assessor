import { describe, expect, it } from "vitest";
import { taxYears } from "../src/data";
import { calculate, marginalRate, requiredSalary } from "../src/engine/calculate";
import { parseTaxCode } from "../src/engine/taxCode";
import { currentYear } from "../src/engine/years";
import { proRata, toAnnual, fromAnnual } from "../src/engine/periods";

const y = taxYears.find((t) => t.id === "2026-27")!;
const base = { region: "ruk" as const };

describe("income tax", () => {
  it("no tax below the personal allowance", () => {
    expect(calculate({ ...base, salary: 12570 }, y).incomeTax).toBe(0);
  });
  it("allowance fully tapered at £125,140", () => {
    expect(calculate({ ...base, salary: 125140 }, y).allowance).toBe(0);
  });
  it("60% marginal rate in the taper zone", () => {
    expect(marginalRate({ ...base, salary: 110000 }, y)).toBeCloseTo(0.62, 2); // 60% tax + 2% NI
  });
  it("marginal rate is for the next £1", () => {
    expect(marginalRate({ ...base, salary: 50250 }, y)).toBeCloseTo(0.28, 2);
  });
  it("additional rate above £125,140", () => {
    const r = calculate({ ...base, salary: 200000 }, y);
    expect(r.bands.find((b) => b.name === "Additional")!.taxable).toBeCloseTo(200000 - 125140, 2);
  });
  it("blind person's allowance", () => {
    expect(calculate({ ...base, salary: 30000, blind: true }, y).allowance).toBe(12570 + 3250);
  });
  it("marriage allowance transfer and receive", () => {
    expect(calculate({ ...base, salary: 10000, marriageAllowance: "transfer" }, y).allowance).toBe(11310);
    const plain = calculate({ ...base, salary: 30000 }, y).incomeTax;
    expect(calculate({ ...base, salary: 30000, marriageAllowance: "receive" }, y).incomeTax).toBeCloseTo(plain - 252, 2);
    const hr = calculate({ ...base, salary: 60000, marriageAllowance: "receive" }, y);
    expect(hr.warnings.length).toBe(1);
    const t = calculate({ ...base, salary: 60000, marriageAllowance: "transfer" }, y);
    expect(t.allowance).toBe(12570);
    expect(t.warnings.length).toBe(1);
  });
  it("relief at source extends the Marriage Allowance limit", () => {
    const ras = { amount: 10000, type: "fixed" as const, basis: "full" as const, method: "reliefAtSource" as const };
    const r = calculate({ ...base, salary: 60000, pension: ras, marriageAllowance: "receive" }, y);
    expect(r.incomeTax).toBeCloseTo(11432 - 252, 2);
  });
  it("Scottish intermediate taxpayers can receive Marriage Allowance", () => {
    const plain = calculate({ region: "scotland", salary: 40000 }, y).incomeTax;
    expect(calculate({ region: "scotland", salary: 40000, marriageAllowance: "receive" }, y).incomeTax).toBeCloseTo(plain - 252, 2);
  });
});

describe("tax codes", () => {
  it("parses common codes", () => {
    expect(parseTaxCode("1257L")).toEqual({ kind: "allowance", allowance: 12570, region: undefined });
    expect(parseTaxCode("s1257l w1")).toEqual({ kind: "allowance", allowance: 12570, region: "scotland" });
    expect(parseTaxCode("K475")).toEqual({ kind: "allowance", allowance: -4750, region: undefined });
    expect(parseTaxCode("BR")).toEqual({ kind: "flat", bandsAboveBasic: 0, region: undefined });
    expect(parseTaxCode("")).toBeNull();
    expect(() => parseTaxCode("hello")).toThrow();
  });
  it("BR and D0 tax everything at one rate", () => {
    expect(calculate({ ...base, salary: 20000, taxCode: "BR" }, y).incomeTax).toBeCloseTo(4000, 2);
    expect(calculate({ ...base, salary: 20000, taxCode: "D0" }, y).incomeTax).toBeCloseTo(8000, 2);
    expect(calculate({ ...base, salary: 20000, taxCode: "SD0" }, y).incomeTax).toBeCloseTo(4200, 2);
    expect(calculate({ ...base, salary: 20000, taxCode: "NT" }, y).incomeTax).toBe(0);
  });
  it("K code adds to taxable pay", () => {
    expect(calculate({ ...base, salary: 20000, taxCode: "K100" }, y).taxable).toBe(21000);
  });
  it("K code tax capped at 50% of pay", () => {
    const r = calculate({ ...base, salary: 10000, taxCode: "K5000" }, y);
    expect(r.incomeTax).toBe(5000);
    expect(r.bands.reduce((t, b) => t + b.tax, 0) - r.taxDeferred).toBeCloseTo(5000, 2);
  });
  it("unprefixed D0 stays 40% even in Scotland", () => {
    expect(calculate({ region: "scotland", salary: 20000, taxCode: "D0" }, y).incomeTax).toBeCloseTo(8000, 2);
  });
  it("accepts every gov.uk letter, prefix and suffix", () => {
    expect(parseTaxCode("k")).toEqual({ kind: "noNumberK", region: undefined });
    expect(parseTaxCode("L")).toEqual({ kind: "standard", region: undefined });
    expect(parseTaxCode("T")).toEqual({ kind: "standard", region: undefined });
    expect(parseTaxCode("M")).toEqual({ kind: "standard", marriage: "receive", region: undefined });
    expect(parseTaxCode("N")).toEqual({ kind: "standard", marriage: "transfer", region: undefined });
    expect(parseTaxCode("S")).toEqual({ kind: "standard", region: "scotland" });
    expect(parseTaxCode("C")).toEqual({ kind: "standard", region: "ruk" });
    expect(parseTaxCode("1383M")).toEqual({ kind: "allowance", allowance: 13830, region: undefined });
    expect(parseTaxCode("C1131N")).toEqual({ kind: "allowance", allowance: 11310, region: "ruk" });
    expect(parseTaxCode("1257T")).toEqual({ kind: "allowance", allowance: 12570, region: undefined });
    expect(parseTaxCode("1257L NONCUM")).toEqual({ kind: "allowance", allowance: 12570, region: undefined });
    expect(parseTaxCode("1257L M1")).toEqual({ kind: "allowance", allowance: 12570, region: undefined });
    expect(parseTaxCode("1257LX")).toEqual({ kind: "allowance", allowance: 12570, region: undefined });
    expect(parseTaxCode("OT")).toEqual({ kind: "allowance", allowance: 0, region: undefined });
    expect(parseTaxCode("C0T")).toEqual({ kind: "allowance", allowance: 0, region: "ruk" });
    expect(parseTaxCode("CBR")).toEqual({ kind: "flat", bandsAboveBasic: 0, region: "ruk" });
    expect(parseTaxCode("CD1")).toEqual({ kind: "flat", bandsAboveBasic: 2, region: "ruk" });
    expect(parseTaxCode("SD3")).toEqual({ kind: "flat", bandsAboveBasic: 4, region: "scotland" });
    expect(() => parseTaxCode("D2")).toThrow();
    expect(() => parseTaxCode("SD4")).toThrow();
  });
  it("Scottish D codes reach the advanced and top rates", () => {
    expect(calculate({ ...base, salary: 20000, taxCode: "SD2" }, y).incomeTax).toBeCloseTo(9000, 2);
    expect(calculate({ ...base, salary: 20000, taxCode: "SD3" }, y).incomeTax).toBeCloseTo(9600, 2);
  });
  it("letter-only codes use the usual allowance", () => {
    const plain = calculate({ ...base, salary: 30000 }, y);
    expect(calculate({ ...base, salary: 30000, taxCode: "L" }, y).incomeTax).toBeCloseTo(plain.incomeTax, 2);
    expect(calculate({ ...base, salary: 30000, taxCode: "M" }, y).incomeTax).toBeCloseTo(plain.incomeTax - 252, 2);
    expect(calculate({ ...base, salary: 30000, taxCode: "N" }, y).allowance).toBe(plain.allowance - 1260);
    expect(calculate({ ...base, salary: 30000, taxCode: "S" }, y).region).toBe("scotland");
  });
  it("K without a number uses no allowance and says so", () => {
    const r = calculate({ ...base, salary: 30000, taxCode: "K" }, y);
    expect(r.allowance).toBe(0);
    expect(r.taxable).toBe(30000);
    expect(r.warnings.some((w) => w.includes("K475"))).toBe(true);
  });
  it("S prefix switches to Scottish bands", () => {
    expect(calculate({ ...base, salary: 35000, taxCode: "S1257L" }, y).region).toBe("scotland");
  });
});

describe("national insurance", () => {
  it("none over State Pension age", () => {
    expect(calculate({ ...base, salary: 40000, overPensionAge: true }, y).nationalInsurance).toBe(0);
  });
  it("employer NI above the secondary threshold", () => {
    expect(calculate({ ...base, salary: 30000 }, y).employerNationalInsurance).toBeCloseTo(25000 * 0.15, 2);
  });
});

describe("pensions", () => {
  const pension = (method: any, extra = {}) => ({ amount: 5, type: "percent" as const, basis: "full" as const, method, ...extra });
  it("salary sacrifice reduces tax, NI and student loan", () => {
    const r = calculate({ ...base, salary: 40000, studentLoans: ["plan2"], pension: pension("salarySacrifice") }, y);
    expect(r.salarySacrifice).toBe(2000);
    expect(r.nationalInsurance).toBeCloseTo((38000 - 12570) * 0.08, 2);
    expect(r.studentLoan).toBeCloseTo((38000 - 29385) * 0.09, 2);
    expect(r.incomeTax).toBeCloseTo((38000 - 12570) * 0.2, 2);
  });
  it("net pay reduces tax only", () => {
    const r = calculate({ ...base, salary: 40000, studentLoans: ["plan2"], pension: pension("netPay") }, y);
    expect(r.incomeTax).toBeCloseTo((38000 - 12570) * 0.2, 2);
    expect(r.nationalInsurance).toBeCloseTo((40000 - 12570) * 0.08, 2);
    expect(r.studentLoan).toBeCloseTo((40000 - 29385) * 0.09, 2);
  });
  it("relief at source: you pay 80%", () => {
    const r = calculate({ ...base, salary: 40000, pension: pension("reliefAtSource") }, y);
    expect(r.pensionYou).toBeCloseTo(1600, 2);
    expect(r.pensionTotal).toBeCloseTo(2000, 2);
    expect(r.incomeTax).toBeCloseTo((40000 - 12570) * 0.2, 2);
  });
  it("relief at source restores tapered allowance", () => {
    const r = calculate({ ...base, salary: 110000, pension: { amount: 10000, type: "fixed", basis: "full", method: "reliefAtSource" } }, y);
    expect(r.allowance).toBe(12570);
  });
  it("qualifying earnings basis", () => {
    const r = calculate({ ...base, salary: 30000, pension: pension("netPay", { basis: "qualifying" }) }, y);
    expect(r.pensionTotal).toBeCloseTo((30000 - 6240) * 0.05, 2);
  });
});

describe("student loans", () => {
  it("multiple undergraduate plans use the lowest threshold once", () => {
    const r = calculate({ ...base, salary: 40000, studentLoans: ["plan1", "plan2"] }, y);
    expect(r.studentLoan).toBeCloseTo((40000 - 26900) * 0.09, 2);
  });
  it("postgraduate loan is separate", () => {
    const r = calculate({ ...base, salary: 40000, studentLoans: ["plan2", "postgraduate"] }, y);
    expect(r.postgraduateLoan).toBeCloseTo((40000 - 21000) * 0.06, 2);
  });
  it("warns about a plan not active that year", () => {
    const old = taxYears.find((t) => t.id === "2025-26")!;
    const r = calculate({ ...base, salary: 40000, studentLoans: ["plan5"] }, old);
    expect(r.studentLoan).toBe(0);
    expect(r.warnings[0]).toMatch(/Plan 5/);
  });
});

describe("helpers", () => {
  it("required salary inverts take-home", () => {
    const gross = requiredSalary(30000, base, y);
    expect(calculate({ ...base, salary: gross }, y).takeHome).toBeCloseTo(30000, 1);
  });
  it("required salary finds the lowest salary when take-home dips", () => {
    const opts = { ...base, marriageAllowance: "receive" as const };
    const gross = requiredSalary(39800, opts, y);
    expect(gross).toBeLessThan(50100);
    expect(calculate({ ...opts, salary: gross }, y).takeHome).toBeGreaterThanOrEqual(39800);
  });
  it("periods and pro-rata", () => {
    const w = { hoursPerWeek: 37.5, daysPerWeek: 5 };
    expect(toAnnual(15, "hour", w)).toBe(15 * 37.5 * 52);
    expect(fromAnnual(52000, "week", w)).toBe(1000);
    expect(proRata(30000, 37.5, 22.5)).toBe(18000);
  });
  it("picks the tax year for a date", () => {
    expect(currentYear(taxYears, new Date("2026-04-05T12:00:00Z")).id).toBe("2025-26");
    expect(currentYear(taxYears, new Date("2026-04-06T12:00:00Z")).id).toBe("2026-27");
    expect(currentYear(taxYears, new Date("2026-04-06T00:30:00+01:00")).id).toBe("2026-27"); // BST
    expect(currentYear(taxYears, new Date("2030-01-01")).id).toBe(taxYears.at(-1)!.id);
  });
});
