import type { LoanPlanId, Region, TaxYear } from "../data/schema";
import type { CalcInput, CalcResult, PensionInput } from "../engine/calculate";
import { marginalRate } from "../engine/calculate";
import { fromAnnual, PERIODS, type Period, type WorkPattern } from "../engine/periods";
import { parseTaxCode } from "../engine/taxCode";
import { currentYear } from "../engine/years";

const years: TaxYear[] = JSON.parse(document.getElementById("tax-years")!.textContent!);

export const form = document.querySelector<HTMLFormElement>("form#calc")!;
const out = document.getElementById("results")!;
const announce = document.getElementById("announce");
/** Problems with what the user typed, shown alongside results instead of replacing them. */
let inputWarnings: string[] = [];

// ---------- form state <-> URL ----------

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const yearSelect = form.elements.namedItem("year") as HTMLSelectElement | null;
  if (yearSelect && !params.has("year")) yearSelect.value = currentYear(years).id;
  if (params.size === 0) return;
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    const values = params.getAll(el.name);
    if (el.type === "checkbox") el.checked = values.includes(el.value);
    else if (el.type === "radio") { if (values.length) el.checked = values.includes(el.value); }
    else if (el instanceof HTMLSelectElement) {
      if (values.length && Array.from(el.options).some((o) => o.value === values[0])) el.value = values[0]!;
    } else if (values.length) el.value = values[0]!;
  }
  // Open sections that hold non-default values so nothing is hidden.
  for (const d of form.querySelectorAll("details")) {
    const changed = Array.from(d.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")).some((el) =>
      !isDefault(el),
    );
    if (changed) d.open = true;
  }
}

/** A select's default is its `selected` option, or the first one. */
const defaultIndex = (el: HTMLSelectElement) => Math.max(0, Array.from(el.options).findIndex((o) => o.defaultSelected));

const isDefault = (el: Element) => {
  if (el instanceof HTMLSelectElement)
    return el.name === "year" ? el.value === currentYear(years).id : el.selectedIndex === defaultIndex(el);
  if (el instanceof HTMLInputElement)
    return el.type === "checkbox" || el.type === "radio" ? el.checked === el.defaultChecked : el.value === el.defaultValue;
  return true;
};

/** Keep only non-default values in the URL, so shared links stay short and follow the current tax year. */
function saveToUrl() {
  const params = new URLSearchParams();
  const changed = new Set(Array.from(form.elements).filter((el) => !isDefault(el)).map((el) => (el as HTMLInputElement).name));
  for (const [k, v] of new FormData(form)) if (changed.has(k)) params.append(k, String(v));
  const search = params.size ? `?${params}` : "";
  if (search === location.search) return;
  try {
    history.replaceState(null, "", location.pathname + search);
  } catch {
    // Safari rate-limits replaceState; the URL just lags behind.
  }
}

// ---------- reading inputs ----------

export const num = (name: string, fallback = 0) => {
  const v = parseFloat(String(new FormData(form).get(name) ?? "").replace(/[,£\s]/g, ""));
  return Number.isFinite(v) ? v : fallback;
};
export const str = (name: string) => String(new FormData(form).get(name) ?? "");

export function readOptions(yearName = "year"): { year: TaxYear; input: Omit<CalcInput, "salary">; work: WorkPattern } {
  inputWarnings = [];
  const fd = new FormData(form);
  const year = years.find((y) => y.id === fd.get(yearName)) ?? currentYear(years);
  const pension: PensionInput = {
    amount: num("pensionAmount"),
    type: str("pensionType") === "fixed" ? "fixed" : "percent",
    basis: str("pensionBasis") === "qualifying" ? "qualifying" : "full",
    method: (str("pensionMethod") || "netPay") as PensionInput["method"],
  };
  return {
    year,
    input: {
      region: (str("region") || "ruk") as Region,
      taxCode: validTaxCode(str("taxCode")),
      pension,
      studentLoans: fd.getAll("loans") as LoanPlanId[],
      blind: fd.has("blind"),
      marriageAllowance: (str("marriage") || "none") as CalcInput["marriageAllowance"],
      overPensionAge: fd.has("pensionAge"),
    },
    work: { hoursPerWeek: num("hoursPerWeek", 37.5), daysPerWeek: num("daysPerWeek", 5) },
  };
}

function validTaxCode(code: string) {
  try {
    return parseTaxCode(code) ? code.trim() : undefined;
  } catch (e) {
    inputWarnings.push(`${(e as Error).message}, so it was ignored.`);
    return undefined;
  }
}

export const allYears = years;

// ---------- formatting ----------

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const money = (n: number) => (Number.isFinite(n) ? gbp.format(n) : "—");
export const money0 = (n: number) => (Number.isFinite(n) ? gbp0.format(n) : "—");
export const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const LABEL: Record<Period, string> = { year: "Year", month: "Month", week: "Week", day: "Day", hour: "Hour" };

interface Row {
  label: string;
  value: (r: CalcResult) => number;
  kind?: "deduction" | "total" | "sub" | "info";
  show?: (r: CalcResult) => boolean;
  yearOnly?: boolean;
}

function rows(rs: CalcResult[]): Row[] {
  const any = (f: (r: CalcResult) => number) => rs.some((r) => f(r) > 0.004);
  const list: Row[] = [{ label: "Gross pay", value: (r) => r.gross }];
  if (any((r) => r.salarySacrifice)) list.push({ label: "Salary sacrifice", value: (r) => r.salarySacrifice, kind: "deduction" });
  list.push({ label: "Tax-free allowance", value: (r) => r.allowance, kind: "info", yearOnly: true });
  list.push({ label: "Taxable income", value: (r) => r.taxable, kind: "info" });
  list.push({ label: "Income tax", value: (r) => r.incomeTax, kind: "deduction" });
  const bandNames = [...new Set(rs.flatMap((r) => r.bands.filter((b) => b.tax > 0).map((b) => b.name)))];
  for (const name of bandNames) {
    const band = (r: CalcResult) => r.bands.find((b) => b.name === name);
    const rate = band(rs[0]!)?.rate;
    list.push({ label: `${name}${rate !== undefined && rs.every((r) => band(r)?.rate === rate) ? ` (${pct(rate)})` : ""}`, value: (r) => band(r)?.tax ?? 0, kind: "sub" });
  }
  if (any((r) => r.taxDeferred)) list.push({ label: "K code 50% cap (collected later)", value: (r) => -r.taxDeferred, kind: "sub" });
  list.push({ label: "National Insurance", value: (r) => r.nationalInsurance, kind: "deduction" });
  if (any((r) => r.studentLoan)) list.push({ label: "Student loan", value: (r) => r.studentLoan, kind: "deduction" });
  if (any((r) => r.postgraduateLoan)) list.push({ label: "Postgraduate loan", value: (r) => r.postgraduateLoan, kind: "deduction" });
  if (any((r) => r.pensionYou - r.salarySacrifice)) list.push({ label: "Pension (from net pay)", value: (r) => r.pensionYou - r.salarySacrifice, kind: "deduction" });
  list.push({ label: "Take-home pay", value: (r) => r.takeHome, kind: "total" });
  return list;
}

const tr = (row: Row, cells: string[]) =>
  `<tr class="${row.kind ?? ""}"><th scope="row">${esc(row.label)}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

function extras(r: CalcResult, input: CalcInput, year: TaxYear) {
  const m = marginalRate(input, year);
  const notes = [
    `Marginal rate: <strong>${pct(m)}</strong> of your next £1 goes to tax, NI and loans.`,
    `Your employer also pays ${money(r.employerNationalInsurance)} National Insurance a year.`,
  ];
  if (r.pensionTotal > 0) notes.push(`${money(r.pensionTotal)} a year goes into your pension (your share, including tax relief).`);
  if (r.region === "scotland") notes.push("Scottish income tax rates applied.");
  return `<ul class="notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>${warnings([r])}`;
}

const warnings = (rs: CalcResult[]) => {
  const w = [...new Set([...inputWarnings, ...rs.flatMap((r) => r.warnings)])];
  return w.length ? `<ul class="warnings">${w.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
};

/** One result, broken down by period. */
export function renderBreakdown(r: CalcResult, input: CalcInput, year: TaxYear, work: WorkPattern) {
  const periods = PERIODS.filter((p) => !(p === "hour" && work.hoursPerWeek <= 0) && !(p === "day" && work.daysPerWeek <= 0));
  const head = `<tr><th></th>${periods.map((p) => `<th scope="col">${LABEL[p]}</th>`).join("")}</tr>`;
  const body = rows([r])
    .map((row) => tr(row, periods.map((p) => (row.yearOnly && p !== "year" ? "" : money(fromAnnual(row.value(r), p, work))))))
    .join("");
  out.innerHTML = `
    <p class="headline"><span>Take-home</span> <strong>${money(fromAnnual(r.takeHome, "month", work))}</strong> <span>a month · ${money0(r.takeHome)} a year · ${esc(year.label)}</span></p>
    <div class="table-wrap"><table class="breakdown">${head}${body}</table></div>${extras(r, input, year)}`;
  say(out.querySelector(".headline")?.textContent ?? "");
}

/** Several results side by side for one period, with a difference column when there are two. */
export function renderComparison(cols: { label: string; result: CalcResult }[], period: Period, work: WorkPattern, intro = "") {
  const rs = cols.map((c) => c.result);
  const diff = cols.length === 2;
  const head = `<tr><th></th>${cols.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("")}${diff ? '<th scope="col">Difference</th>' : ""}</tr>`;
  const body = rows(rs)
    .map((row) => {
      if (row.yearOnly && period !== "year") return tr(row, cols.map(() => "").concat(diff ? [""] : []));
      const vals = rs.map((r) => fromAnnual(row.value(r), period, work));
      const cells = vals.map(money);
      if (diff) {
        const d = vals[1]! - vals[0]!;
        cells.push(Math.abs(d) < 0.005 ? "–" : `${d > 0 ? "+" : "−"}${money(Math.abs(d))}`);
      }
      return tr(row, cells);
    })
    .join("");
  out.innerHTML = `${intro}<div class="table-wrap"><table class="compare">${head}${body}</table></div>${warnings(rs)}`;
  say(out.querySelector(".headline")?.textContent ?? "");
}

/** Screen readers hear a one-line summary, not the whole table on every keystroke. */
let sayTimer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string) {
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => announce && (announce.textContent = text.replace(/\s+/g, " ").trim()), 600);
}

export function showError(message: string) {
  out.innerHTML = `<p class="error">${esc(message)}</p>`;
  say(message);
}

/** Wire a page: `update` runs on load and on every change. */
export function start(update: () => void) {
  const run = () => {
    try {
      update();
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
    saveToUrl();
  };
  restoreFromUrl();
  form.addEventListener("input", run);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  run();
}
