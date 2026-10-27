import { describe, expect, it } from "vitest";
import { loadTaxYears, taxYears } from "../src/data";
import { calculate } from "../src/engine/calculate";

describe("tax year files", () => {
  it("loads at least one year", () => expect(taxYears.length).toBeGreaterThan(0));

  it("have no gaps or overlaps between consecutive years", () => {
    for (let i = 1; i < taxYears.length; i++) {
      const prevEnd = new Date(taxYears[i - 1]!.endDate);
      prevEnd.setUTCDate(prevEnd.getUTCDate() + 1);
      expect(taxYears[i]!.startDate, taxYears[i]!.id).toBe(prevEnd.toISOString().slice(0, 10));
    }
  });

  it("rejects a malformed file", () => {
    const bad = structuredClone(taxYears[0]!) as any;
    bad.incomeTax.bands.ruk[0].upTo = null;
    expect(() => loadTaxYears({ [`./tax-years/${bad.id}.json`]: bad })).toThrow(/upTo/);
    expect(() => loadTaxYears({ "./tax-years/1999-00.json": taxYears[0] })).toThrow(/must match/);
  });
});

// Every "checks" entry in every data file becomes a test.
for (const year of taxYears) {
  describe(`${year.label} checks`, () => {
    for (const c of year.checks) {
      it(c.description, () => {
        const r = calculate({ salary: c.input.salary, region: c.input.region }, year);
        expect(r.incomeTax).toBeCloseTo(c.expected.incomeTax, 2);
        expect(r.nationalInsurance).toBeCloseTo(c.expected.nationalInsurance, 2);
        expect(r.takeHome).toBeCloseTo(c.expected.takeHome, 2);
      });
    }
  });
}
