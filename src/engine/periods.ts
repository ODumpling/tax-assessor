export type Period = "year" | "month" | "week" | "day" | "hour";

export interface WorkPattern {
  hoursPerWeek: number;
  daysPerWeek: number;
}

export const PERIODS: Period[] = ["year", "month", "week", "day", "hour"];

/** How many of `period` there are in a year. */
export function periodsPerYear(period: Period, w: WorkPattern) {
  switch (period) {
    case "year":
      return 1;
    case "month":
      return 12;
    case "week":
      return 52;
    case "day":
      return 52 * w.daysPerWeek;
    case "hour":
      return 52 * w.hoursPerWeek;
  }
}

export const toAnnual = (amount: number, period: Period, w: WorkPattern) => amount * periodsPerYear(period, w);
export const fromAnnual = (amount: number, period: Period, w: WorkPattern) => {
  const n = periodsPerYear(period, w);
  return n > 0 ? amount / n : 0;
};

/** Salary scaled from full-time hours to actual hours. */
export const proRata = (fullTimeSalary: number, fullTimeHours: number, actualHours: number) =>
  fullTimeHours > 0 ? (fullTimeSalary * actualHours) / fullTimeHours : 0;
