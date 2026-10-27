import { z } from "zod";

const money = z.number().nonnegative();
const rate = z.number().min(0).max(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** A tax band. `upTo` is the top of the band in TAXABLE income (after allowances); null = no limit. */
const band = z.object({
  name: z.string(),
  rate,
  upTo: money.nullable(),
});

const bands = z
  .array(band)
  .min(1)
  .superRefine((list, ctx) => {
    for (const name of ["basic", "higher"])
      if (!list.some((b) => b.name.toLowerCase() === name))
        ctx.addIssue({ code: "custom", message: `one band must be named "${name[0]!.toUpperCase() + name.slice(1)}"` });
    list.forEach((b, i) => {
      const last = i === list.length - 1;
      if (last && b.upTo !== null) ctx.addIssue({ code: "custom", message: "last band must have upTo: null" });
      if (!last && b.upTo === null) ctx.addIssue({ code: "custom", message: `band "${b.name}" needs upTo (only the last band may be null)` });
      const prev = list[i - 1];
      if (prev && b.upTo !== null && prev.upTo !== null && b.upTo <= prev.upTo)
        ctx.addIssue({ code: "custom", message: `band "${b.name}" upTo must be greater than "${prev.name}"` });
    });
  });

const loanPlan = z.object({ threshold: money, rate });

const check = z.object({
  description: z.string(),
  input: z.object({
    salary: money,
    region: z.enum(["ruk", "scotland"]).default("ruk"),
  }),
  expected: z.object({
    incomeTax: money,
    nationalInsurance: money,
    takeHome: money,
  }),
});

export const taxYearSchema = z
  .object({
    /** Must match the file name, e.g. "2026-27". */
    id: z.string().regex(/^\d{4}-\d{2}$/, 'expected "YYYY-YY"'),
    label: z.string(),
    startDate: isoDate,
    endDate: isoDate,
    sources: z.array(z.url()).min(1),
    incomeTax: z.object({
      personalAllowance: money,
      /** Allowance is reduced above this adjusted net income... */
      taperThreshold: money,
      /** ...by this much per £1 over (0.5 = £1 for every £2). */
      taperRate: rate,
      blindPersonsAllowance: money,
      marriageAllowanceTransfer: money,
      bands: z.object({
        /** England, Wales and Northern Ireland. */
        ruk: bands,
        scotland: bands,
      }),
    }),
    nationalInsurance: z.object({
      lowerEarningsLimit: money,
      primaryThreshold: money,
      upperEarningsLimit: money,
      mainRate: rate,
      upperRate: rate,
      employer: z.object({ secondaryThreshold: money, rate }),
    }),
    /** Omit a plan for years it doesn't collect repayments. */
    studentLoans: z.object({
      plan1: loanPlan.optional(),
      plan2: loanPlan.optional(),
      plan4: loanPlan.optional(),
      plan5: loanPlan.optional(),
      postgraduate: loanPlan.optional(),
    }),
    pension: z.object({
      /** Auto-enrolment qualifying earnings band. */
      qualifyingEarningsLower: money,
      qualifyingEarningsUpper: money,
      annualAllowance: money,
    }),
    /** Known results, verified by `pnpm test`. */
    checks: z.array(check).min(1, "add at least one check"),
  })
  .superRefine((y, ctx) => {
    if (y.startDate >= y.endDate) ctx.addIssue({ code: "custom", message: "startDate must be before endDate" });
    const ni = y.nationalInsurance;
    if (ni.primaryThreshold >= ni.upperEarningsLimit)
      ctx.addIssue({ code: "custom", message: "NI primaryThreshold must be below upperEarningsLimit" });
    if (y.pension.qualifyingEarningsLower >= y.pension.qualifyingEarningsUpper)
      ctx.addIssue({ code: "custom", message: "pension qualifying earnings lower must be below upper" });
  });

export type TaxYear = z.infer<typeof taxYearSchema>;
export type Band = z.infer<typeof band>;
export type LoanPlanId = keyof TaxYear["studentLoans"];
export type Region = "ruk" | "scotland";
