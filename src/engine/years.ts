import type { TaxYear } from "../data/schema";

/** The tax year containing `today`, else the latest one that has started, else the first. */
export function currentYear(years: TaxYear[], today = new Date()): TaxYear {
  // UK calendar date (BST-aware), as YYYY-MM-DD.
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(today);
  return (
    years.find((y) => y.startDate <= d && d <= y.endDate) ??
    [...years].reverse().find((y) => y.startDate <= d) ??
    years[0]!
  );
}
