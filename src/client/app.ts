import type { LoanPlanId, Region, TaxYear } from "../data/schema";
import type { CalcInput, CalcResult, PensionInput } from "../engine/calculate";
import { marginalRate } from "../engine/calculate";
import { fromAnnual, type Period, type WorkPattern } from "../engine/periods";
import { parseTaxCode } from "../engine/taxCode";
import { currentYear } from "../engine/years";
import { parseAmount } from "./parse";

const years: TaxYear[] = JSON.parse(document.getElementById("tax-years")!.textContent!);

export const form = document.querySelector<HTMLFormElement>("form#calc")!;
const $ = (id: string) => document.getElementById(id)!;
const headlineEl = $("headline");
const shareEl = $("share");
const detailEl = $("detail");
const peekEl = $("peek");
const announce = $("announce");

/** Problems with what the user typed, shown alongside results instead of replacing them. */
let inputWarnings: string[] = [];
/** Per-field messages, shown under the field. */
const fieldErrors = new Map<string, string>();

/** A required amount is missing or unreadable: show a prompt instead of results. */
export class InputError extends Error {}

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
    if (Array.from(d.querySelectorAll("input, select")).some((el) => !isDefault(el))) d.open = true;
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

/** Settings that mean the same on every calculator, carried along when you switch between them. */
const SHARED = ["year", "region", "pensionAmount", "pensionType", "pensionBasis", "pensionMethod", "loans", "taxCode", "marriage", "hoursPerWeek", "daysPerWeek", "blind", "pensionAge"];

/** Keep only non-default values in the URL, so shared links stay short and follow the current tax year. */
function saveToUrl() {
  const params = new URLSearchParams();
  const changed = new Set(Array.from(form.elements).filter((el) => !isDefault(el)).map((el) => (el as HTMLInputElement).name));
  for (const [k, v] of new FormData(form)) if (changed.has(k)) params.append(k, String(v));
  const shared = new URLSearchParams([...params].filter(([k]) => SHARED.includes(k)));
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".nav-list a")) {
    a.search = shared.size ? `?${shared}` : "";
  }
  const search = params.size ? `?${params}` : "";
  if (search === location.search) return;
  try {
    history.replaceState(null, "", location.pathname + search);
  } catch {
    // Safari rate-limits replaceState; the URL just lags behind.
  }
}

// ---------- reading inputs ----------

const raw = (name: string) => String(new FormData(form).get(name) ?? "");

/** An optional amount: blank means `fallback`; unreadable flags the field and also uses `fallback`. */
export const num = (name: string, fallback = 0) => {
  const v = parseAmount(raw(name));
  if (v === null) fieldErrors.set(name, `Enter a number, like ${name === "pensionAmount" ? "5 or 2,400" : "1500 or 1,500.50"}`);
  return v ?? fallback;
};

/** A required amount: blank or unreadable stops the calculation with a prompt. */
export const need = (name: string) => {
  const v = parseAmount(raw(name));
  if (typeof v === "number") return v;
  const label = form.querySelector(`label[for="${name}"]`)?.textContent?.trim() ?? "This amount";
  fieldErrors.set(name, v === null ? "Enter a number, like 35000 or 35,000" : "Enter an amount");
  throw new InputError(v === null ? `${label} needs to be a number, like 35,000.` : `${label} is needed to see your results.`);
};

export const str = (name: string) => raw(name);

/** The chosen "show amounts per" period, limited to `allowed`. */
export function period(allowed: Period[] = ["year", "month", "week", "day", "hour"]): Period {
  const p = str("show") as Period;
  return allowed.includes(p) ? p : "month";
}

export function readOptions(yearName = "year"): { year: TaxYear; input: Omit<CalcInput, "salary">; work: WorkPattern } {
  inputWarnings = [];
  fieldErrors.clear();
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
    fieldErrors.set("taxCode", `${(e as Error).message}. It's been ignored.`);
    inputWarnings.push(`${(e as Error).message}, so the standard allowance was used.`);
    return undefined;
  }
}

export const allYears = years;

// ---------- formatting ----------

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const money = (n: number) => (Number.isFinite(n) ? gbp.format(n).replace("-", "−") : "—");
export const money0 = (n: number) => (Number.isFinite(n) ? gbp0.format(n).replace("-", "−") : "—");
export const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** "+£12.00" / "−£12.00" / "No change"; `plain` spells the sign out for speech. */
export const signed = (n: number, plain = false) =>
  Math.abs(n) < 0.005 ? "No change" : plain ? `${n > 0 ? "plus" : "minus"} ${money(Math.abs(n))}` : `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
export const perWord = (p: Period) => `a ${p}`;
/** "2026/27" reads badly aloud; "2026 to 27" doesn't. */
export const spokenYear = (label: string) => label.replace("/", " to ");

const LABEL: Record<Period, string> = { year: "year", month: "month", week: "week", day: "day", hour: "hour" };

// ---------- result rows ----------

interface Row {
  label: string;
  value: (r: CalcResult) => number;
  kind?: "deduction" | "total" | "sub" | "info";
}

function rows(rs: CalcResult[]): Row[] {
  const any = (f: (r: CalcResult) => number) => rs.some((r) => f(r) > 0.004);
  const list: Row[] = [{ label: "Gross pay", value: (r) => r.gross }];
  if (any((r) => r.salarySacrifice)) list.push({ label: "Salary sacrifice", value: (r) => r.salarySacrifice, kind: "deduction" });
  list.push({ label: "Income tax", value: (r) => r.incomeTax, kind: "deduction" });
  list.push({ label: "Tax-free allowance", value: (r) => r.allowance, kind: "info" });
  list.push({ label: "Taxable income", value: (r) => r.taxable, kind: "info" });
  const bandNames = [...new Set(rs.flatMap((r) => r.bands.filter((b) => b.tax > 0).map((b) => b.name)))];
  for (const name of bandNames) {
    const band = (r: CalcResult) => r.bands.find((b) => b.name === name);
    const rate = band(rs[0]!)?.rate;
    const same = rate !== undefined && rs.every((r) => band(r)?.rate === rate);
    list.push({ label: `${name} rate${same ? ` (${pct(rate)})` : ""}`, value: (r) => band(r)?.tax ?? 0, kind: "sub" });
  }
  if (any((r) => r.taxDeferred)) list.push({ label: "K code 50% cap (collected later)", value: (r) => -r.taxDeferred, kind: "sub" });
  list.push({ label: "National Insurance", value: (r) => r.nationalInsurance, kind: "deduction" });
  if (any((r) => r.studentLoan)) list.push({ label: "Student loan", value: (r) => r.studentLoan, kind: "deduction" });
  if (any((r) => r.postgraduateLoan)) list.push({ label: "Postgraduate loan", value: (r) => r.postgraduateLoan, kind: "deduction" });
  if (any((r) => r.pensionYou - r.salarySacrifice)) list.push({ label: "Pension (from net pay)", value: (r) => r.pensionYou - r.salarySacrifice, kind: "deduction" });
  list.push({ label: "Take-home pay", value: (r) => r.takeHome, kind: "total" });
  return list;
}

/** A money cell: deductions get a minus sign that screen readers say, totals get an equals sign. */
function amount(v: number, kind: Row["kind"]) {
  if (kind === "deduction") return `<span><span class="sign" aria-hidden="true">−</span><span class="sr-only">minus </span>${money(v)}</span>`;
  return `<span>${money(v)}</span>`;
}

/** Pay split into what you keep and where the rest goes, for the bar. */
function shares(r: CalcResult) {
  const parts = [
    { key: "keep", label: "Take-home", value: r.takeHome },
    { key: "tax", label: "Income tax", value: r.incomeTax },
    { key: "ni", label: "National Insurance", value: r.nationalInsurance },
    { key: "loan", label: "Student loans", value: r.studentLoan + r.postgraduateLoan },
    { key: "pension", label: "Pension", value: r.pensionYou },
  ].filter((p) => p.value > 0.004);
  const total = parts.reduce((s, p) => s + p.value, 0);
  return total > 0 ? parts.map((p) => ({ ...p, share: p.value / total })) : [];
}

function shareHtml(r: CalcResult) {
  const parts = shares(r);
  if (!parts.length) return "";
  const bar = parts.map((p) => `<span class="seg-${p.key}" style="flex-grow:${p.share.toFixed(4)}"></span>`).join("");
  const legend = parts
    .map((p) => `<li><span class="swatch seg-${p.key}" aria-hidden="true"></span>${esc(p.label)} <strong>${pct(p.share)}</strong></li>`)
    .join("");
  return `<h3 class="share-title">Where your pay goes</h3><div class="bar" aria-hidden="true">${bar}</div><ul class="legend">${legend}</ul>`;
}

function warningsHtml(rs: CalcResult[]) {
  const w = warningList(rs);
  if (!w.length) return "";
  return `<div class="warnings" role="note"><h3><svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16"><path d="M8 1.5L15 14H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.5"/></svg>Check this</h3><ul>${w.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}
const warningList = (rs: CalcResult[]) => [...new Set([...inputWarnings, ...rs.flatMap((r) => r.warnings)])];

export interface Headline {
  title: string;
  figure: string;
  unit?: string;
  sub?: string;
  /** What screen readers hear after a change. */
  spoken: string;
  /** Label and value for the small bar that follows you on phones. */
  peek: [string, string];
}

function renderHeadline(h: Headline) {
  headlineEl.innerHTML = `<h2 id="results-title" class="eyebrow">${esc(h.title)}</h2>
    <p class="figure"><strong>${esc(h.figure)}</strong>${h.unit ? ` <span>${esc(h.unit)}</span>` : ""}</p>
    ${h.sub ? `<p class="sub">${esc(h.sub)}</p>` : ""}`;
  peekEl.querySelector(".peek-label")!.textContent = h.peek[0];
  peekEl.querySelector(".peek-value")!.textContent = h.peek[1];
  peekEl.dataset.ready = "";
}

/** Disable periods that need hours or days when those are zero, and fall back to month. */
function syncPeriods(work: WorkPattern) {
  for (const el of form.querySelectorAll<HTMLInputElement>('input[name="show"]')) {
    el.disabled = (el.value === "hour" && work.hoursPerWeek <= 0) || (el.value === "day" && work.daysPerWeek <= 0);
    // Hours or days of 0 make these periods meaningless; drop them rather than show a dead option.
    el.closest("label")!.hidden = el.disabled;
    if (el.disabled && el.checked) form.querySelector<HTMLInputElement>('input[name="show"][value="month"]')!.checked = true;
  }
}

/** One result for the chosen period, with a share bar and notes. */
export function renderBreakdown(r: CalcResult, input: CalcInput, year: TaxYear, work: WorkPattern, headline?: Headline) {
  syncPeriods(work);
  const p = period();
  const per = (v: number) => fromAnnual(v, p, work);
  const other: Period = p === "year" ? "month" : "year";
  renderHeadline(
    headline ?? {
      title: "Your take-home pay",
      figure: money(per(r.takeHome)),
      unit: perWord(p),
      sub: `${money(fromAnnual(r.takeHome, other, work))} ${perWord(other)} · ${year.label} tax year`,
      spoken: `Take-home pay ${money(per(r.takeHome))} ${perWord(p)}, ${money(fromAnnual(r.takeHome, other, work))} ${perWord(other)}, tax year ${spokenYear(year.label)}.`,
      peek: ["Take-home", `${money(per(r.takeHome))} / ${LABEL[p]}`],
    },
  );
  shareEl.innerHTML = shareHtml(r);
  const body = rows([r])
    .map((row) => `<tr class="${row.kind ?? ""}"><th scope="row">${esc(row.label)}</th><td>${amount(per(row.value(r)), row.kind)}</td></tr>`)
    .join("");
  detailEl.innerHTML = `
    <div class="card table-card">
      <table class="breakdown">
        <caption>Breakdown per ${LABEL[p]}, ${esc(year.label)} tax year</caption>
        <thead><tr><th scope="col">Item</th><th scope="col">Amount per ${LABEL[p]}</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${notes(r, input, year)}${warningsHtml([r])}`;
  sayResult(headline?.spoken ?? `Take-home pay ${money(per(r.takeHome))} ${perWord(p)}.`, [r]);
}

function notes(r: CalcResult, input: CalcInput, year: TaxYear) {
  const m = marginalRate(input, year);
  const list = [
    `<strong>${pct(m)}</strong> of your next £1 of pay would go on tax, National Insurance and loans.`,
    `Your employer also pays ${money(r.employerNationalInsurance)} National Insurance a year.`,
  ];
  if (r.pensionTotal > 0) list.push(`${money(r.pensionTotal)} a year goes into your pension (your share, including tax relief).`);
  if (r.region === "scotland") list.push("Scottish income tax rates applied.");
  return `<ul class="notes">${list.map((n) => `<li>${n}</li>`).join("")}</ul>`;
}

/** Several results side by side for one period, with a difference column when there are two. */
export function renderComparison(cols: { label: string; result: CalcResult }[], p: Period, work: WorkPattern, headline: Headline, diffLabel = "Difference") {
  syncPeriods(work);
  renderHeadline(headline);
  shareEl.innerHTML = "";
  const rs = cols.map((c) => c.result);
  const diff = cols.length === 2;
  const heads = cols.map((c) => c.label).concat(diff ? [diffLabel] : []);
  const head = `<tr role="row"><th scope="col" role="columnheader">Item</th>${heads.map((h) => `<th scope="col" role="columnheader">${esc(h)}</th>`).join("")}</tr>`;
  const body = rows(rs)
    .map((row) => {
      const vals = rs.map((r) => fromAnnual(row.value(r), p, work));
      const cells = vals.map((v) => amount(v, row.kind));
      if (diff) {
        const d = vals[1]! - vals[0]!;
        cells.push(Math.abs(d) < 0.005 ? "<span>No change</span>" : `<span><span aria-hidden="true">${d > 0 ? "+" : "−"}</span><span class="sr-only">${d > 0 ? "plus" : "minus"} </span>${money(Math.abs(d))}</span>`);
      }
      const td = cells.map((c, i) => `<td role="cell" data-label="${esc(heads[i]!)}">${c}</td>`).join("");
      return `<tr role="row" class="${row.kind ?? ""}"><th scope="row" role="rowheader">${esc(row.label)}</th>${td}</tr>`;
    })
    .join("");
  detailEl.innerHTML = `
    <div class="card table-card">
      <table class="compare" role="table">
        <caption>Comparison per ${LABEL[p]}</caption>
        <thead role="rowgroup">${head}</thead>
        <tbody role="rowgroup">${body}</tbody>
      </table>
    </div>${warningsHtml(rs)}`;
  sayResult(headline.spoken, rs);
}

function showPrompt(message: string) {
  headlineEl.innerHTML = `<h2 id="results-title" class="eyebrow">Your result</h2><p class="prompt">${esc(message)}</p>`;
  shareEl.innerHTML = "";
  detailEl.innerHTML = "";
  delete peekEl.dataset.ready;
  say(message);
}

// ---------- field errors and section hints ----------

function showFieldErrors() {
  for (const el of form.querySelectorAll<HTMLElement>(".field-error")) {
    const name = el.id.replace(/-error$/, "");
    const msg = fieldErrors.get(name);
    const input = document.getElementById(name);
    el.hidden = !msg;
    el.textContent = msg ?? "";
    if (msg) {
      input?.setAttribute("aria-invalid", "true");
      const d = el.closest("details");
      if (d) d.open = true;
    } else input?.removeAttribute("aria-invalid");
  }
}

const selectedText = (name: string) => (form.elements.namedItem(name) as HTMLSelectElement | null)?.selectedOptions[0]?.text ?? "";
const checkedLabels = (name: string) =>
  Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)).map((el) => el.closest("label")!.textContent!.trim());
/** Whether a field inside `scope` differs from its default. */
const changed = (scope: Element, name: string) => {
  const el = scope.querySelector(`[name="${name}"]`);
  return el !== null && !isDefault(el);
};
const ticked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;

/** Short "what's set in here" text for each collapsible section, so closed sections aren't a mystery. */
const HINTS: Record<string, (d: HTMLDetailsElement) => string> = {
  pension: () => {
    const a = parseAmount(raw("pensionAmount"));
    if (!a) return "None";
    const amt = str("pensionType") === "fixed" ? `${money0(a)} a year` : `${a}%`;
    return `${amt}, ${selectedText("pensionMethod").replace(/ \(.*\)$/, "").toLowerCase()}`;
  },
  loans: () => checkedLabels("loans").join(", ") || "None",
  extra: () => {
    const parts = [];
    const h = parseAmount(raw("overtimeHours"));
    const b = parseAmount(raw("bonus"));
    if (h) parts.push(`${h} hours overtime`);
    if (b) parts.push(`${money0(b)} bonus`);
    return parts.join(", ") || "None";
  },
  more: (d) => {
    const parts = [];
    if (str("taxCode").trim()) parts.push(`${str("taxCode").trim().toUpperCase()}${fieldErrors.has("taxCode") ? " (ignored)" : ""}`);
    if (changed(d, "marriage")) parts.push("Marriage Allowance");
    if (changed(d, "hoursPerWeek")) parts.push(`${raw("hoursPerWeek")} hours a week`);
    if (changed(d, "daysPerWeek")) parts.push(`${raw("daysPerWeek")} days a week`);
    if (ticked("blind")) parts.push("Blind Person's Allowance");
    if (ticked("pensionAge")) parts.push("Over pension age");
    return parts.join(", ") || "Standard";
  },
};

function updateHints() {
  for (const d of form.querySelectorAll<HTMLDetailsElement>("details[data-hint]")) {
    const hint = HINTS[d.dataset.hint!];
    if (hint) d.querySelector(".section-hint")!.textContent = hint(d);
  }
}

// ---------- announcements ----------

/** Screen readers hear a one-line summary after typing pauses, not the whole table on every keystroke. */
let sayTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaid = "";
let quiet = true;
export function say(text: string) {
  clearTimeout(sayTimer);
  const t = text.replace(/\s+/g, " ").trim();
  // The first render is what the page already shows; don't read it out unprompted.
  if (quiet) {
    lastSaid = t;
    return;
  }
  sayTimer = setTimeout(() => {
    if (t === lastSaid) return;
    lastSaid = t;
    announce.textContent = t;
  }, 700);
}

function sayResult(text: string, rs: CalcResult[]) {
  // Unreadable optional fields are treated as blank; say so, or the result sounds right when it isn't.
  const fields = [...fieldErrors].filter(([name]) => name !== "taxCode").map(([name, msg]) => {
    const label = form.querySelector(`label[for="${name}"]`)?.textContent?.trim() ?? name;
    return `${label}: ${msg}.`;
  });
  const w = [...fields, ...warningList(rs)];
  say(w.length ? `${text} Check this: ${w.join(" ")}` : text);
}

// ---------- the bar that follows you on phones ----------

function watchPeek() {
  const card = document.querySelector(".result-card")!;
  const inputs = document.querySelector(".inputs")!;
  let cardVisible = true;
  let inputsVisible = true;
  const update = () => (peekEl.hidden = cardVisible || !inputsVisible);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === card) cardVisible = e.isIntersecting;
      else inputsVisible = e.isIntersecting;
    }
    update();
  });
  io.observe(card);
  io.observe(inputs);
  // The bar is fixed, so a field already on screen can sit behind it without the browser scrolling (WCAG 2.4.11).
  inputs.addEventListener("focusin", (e) => {
    if (peekEl.hidden || !peekEl.dataset.ready) return;
    const field = (e.target as Element).closest(".field, .check, .seg label, summary") ?? (e.target as Element);
    if (field.getBoundingClientRect().bottom > peekEl.getBoundingClientRect().top - 8) field.scrollIntoView({ block: "nearest" });
  });
}

/** Wire a page: `update` runs on load and on every change. */
export function start(update: () => void) {
  const run = () => {
    try {
      update();
    } catch (e) {
      if (e instanceof InputError) showPrompt(e.message);
      else showPrompt(e instanceof Error ? e.message : String(e));
    }
    showFieldErrors();
    updateHints();
    saveToUrl();
  };
  restoreFromUrl();
  form.addEventListener("input", run);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  run();
  quiet = false;
  watchPeek();
}
