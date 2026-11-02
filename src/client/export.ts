/**
 * Turns the results on screen into a file: an Excel workbook, a PDF or a PNG.
 * No libraries: each format is small enough to write by hand, and this module is
 * only loaded when someone picks "Export as".
 */

export interface Cell {
  /** The amount as shown, with its sign: deductions are negative. */
  value: number;
  text: string;
}

export interface ReportRow {
  label: string;
  kind?: "deduction" | "total" | "sub" | "info";
  cells: Cell[];
}

/** Everything the results panel shows, as plain data. */
export interface Report {
  /** The calculator's name, like "Take-home pay". */
  title: string;
  headline: { title: string; figure: string; unit?: string; sub?: string };
  /** Where the pay goes, for the bar. Empty on comparisons. */
  share: { key: string; label: string; share: number }[];
  caption: string;
  /** One heading per value column. */
  columns: string[];
  rows: ReportRow[];
  notes: string[];
  warnings: string[];
  /** The page address, which brings back the same inputs. */
  url: string;
  /** When it was made, like "2 November 2026". */
  date: string;
}

export type Format = "xlsx" | "pdf" | "png";

const DISCLAIMER = "An estimate for illustration only. Don't make major financial decisions without a qualified specialist.";

/** "Take-home pay" on 2 November 2026 → "take-home-pay-2026-11-02". */
export function fileName(r: Report, now: Date, format: Format) {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "results";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${slug}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${format}`;
}

// ---------- Excel ----------

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const col = (i: number) => String.fromCharCode(65 + i);

/** Cell styles, as indexes into cellXfs in styles.xml. */
const S = { text: 0, bold: 1, money: 2, moneyBold: 3, indent1: 4, indent2: 5, title: 6, percent: 7, head: 8 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00;\\-&quot;£&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment indent="2"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

type XCell = string | number | { v: string | number; s: number } | null;

function sheetXml(r: Report) {
  const out: XCell[][] = [];
  const add = (...cells: XCell[]) => out.push(cells);
  add({ v: r.title, s: S.title });
  add(`${r.headline.title}: ${r.headline.figure}${r.headline.unit ? ` ${r.headline.unit}` : ""}`);
  if (r.headline.sub) add(r.headline.sub);
  if (r.share.length) {
    add();
    add({ v: "Where your pay goes", s: S.bold });
    for (const p of r.share) add({ v: p.label, s: S.indent1 }, { v: p.share, s: S.percent });
  }
  add();
  add({ v: r.caption, s: S.bold });
  add({ v: "Item", s: S.bold }, ...r.columns.map((c) => ({ v: c, s: S.head })));
  for (const row of r.rows) {
    const total = row.kind === "total";
    const label = row.kind === "info" ? S.indent1 : row.kind === "sub" ? S.indent2 : total ? S.bold : S.text;
    add({ v: row.label, s: label }, ...row.cells.map((c) => ({ v: Math.round(c.value * 100) / 100, s: total ? S.moneyBold : S.money })));
  }
  if (r.notes.length) {
    add();
    add({ v: "Notes", s: S.bold });
    for (const n of r.notes) add(n);
  }
  if (r.warnings.length) {
    add();
    add({ v: "Check this", s: S.bold });
    for (const w of r.warnings) add(w);
  }
  add();
  add(DISCLAIMER);
  add(`Calculated on ${r.date} at ${r.url}`);

  const rowsXml = out
    .map((cells, i) => {
      const cs = cells
        .map((c, j) => {
          if (c === null) return "";
          const { v, s } = typeof c === "object" ? c : { v: c, s: S.text };
          const ref = `${col(j)}${i + 1}`;
          return typeof v === "number"
            ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
            : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cs}</row>`;
    })
    .join("");
  const widths = [`<col min="1" max="1" width="36" customWidth="1"/>`, ...r.columns.map((_, i) => `<col min="${i + 2}" max="${i + 2}" width="20" customWidth="1"/>`)];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths.join("")}</cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}

export function toXlsx(r: Report): Uint8Array {
  const enc = new TextEncoder();
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Breakdown" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(r)],
  ];
  return zip(files.map(([name, body]) => [name, enc.encode(body)]));
}

// ---------- zip (stored, no compression) ----------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const DOS_DATE = (1 << 5) | 1; // 1 January 1980: a fixed date keeps the file reproducible
  for (const [name, data] of files) {
    const n = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, n.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- layout shared by the PDF and the image ----------

const C = {
  text: "#14171c",
  muted: "#515866",
  line: "#e3e6eb",
  soft: "#eef4ff",
  deduct: "#b42318",
  keep: "#0b7a66",
  warn: "#9a4b00",
  seg: { keep: "#0b7a66", tax: "#1f4fd6", ni: "#7c3aed", loan: "#b45309", pension: "#5b6b82" } as Record<string, string>,
};

export type Op =
  | { t: "text"; x: number; y: number; s: string; size: number; bold?: boolean; color: string; right?: boolean }
  | { t: "rect"; x: number; y: number; w: number; h: number; color: string };

/** Width of `s` at `size`, in the same units as the page. */
export type Measure = (s: string, size: number, bold?: boolean) => number;

/**
 * Lays the report out top-down. `y` on a text op is its baseline. With `pageHeight`
 * it breaks onto new pages; without, it's one long page (the image).
 */
export function layout(r: Report, measure: Measure, width: number, pageHeight?: number) {
  const M = 40;
  const R = width - M;
  const pages: Op[][] = [[]];
  let y = M;
  const op = (o: Op) => pages.at(-1)!.push(o);
  const room = (h: number) => {
    if (pageHeight && y + h > pageHeight - M) {
      pages.push([]);
      y = M;
    }
  };

  const wrap = (s: string, size: number, max: number, bold?: boolean) => {
    const lines: string[] = [];
    let line = "";
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, bold) <= max) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the line (a long address): break it anywhere.
      line = "";
      for (const ch of word) {
        if (line && measure(line + ch, size, bold) > max) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const para = (s: string, size: number, o: { color?: string; bold?: boolean; x?: number; lh?: number } = {}) => {
    const x = o.x ?? M;
    const lh = o.lh ?? size * 1.4;
    for (const line of wrap(s, size, R - x, o.bold)) {
      room(lh);
      op({ t: "text", x, y: y + size * 1.05, s: line, size, bold: o.bold, color: o.color ?? C.text });
      y += lh;
    }
  };

  // Heading and headline figure
  para("UK Salary Calculator", 9, { color: C.muted });
  para(r.title, 18, { bold: true });
  y += 10;
  para(r.headline.title, 11, { color: C.muted, bold: true });
  room(40);
  op({ t: "text", x: M, y: y + 31, s: r.headline.figure, size: 30, bold: true, color: C.text });
  if (r.headline.unit)
    op({ t: "text", x: M + measure(r.headline.figure, 30, true) + 7, y: y + 31, s: r.headline.unit, size: 13, color: C.muted });
  y += 42;
  if (r.headline.sub) para(r.headline.sub, 11, { color: C.muted });

  // Where the pay goes
  if (r.share.length) {
    y += 12;
    para("Where your pay goes", 10, { color: C.muted, bold: true });
    room(50);
    y += 2;
    const gap = 2;
    const avail = R - M - gap * (r.share.length - 1);
    let x = M;
    for (const p of r.share) {
      const w = Math.max(2, p.share * avail);
      op({ t: "rect", x, y, w, h: 8, color: C.seg[p.key] ?? C.muted });
      x += w + gap;
    }
    y += 20;
    x = M;
    for (const p of r.share) {
      const pc = `${Math.round(p.share * 1000) / 10}%`;
      const w = 12 + measure(p.label, 10) + 4 + measure(pc, 10, true);
      if (x > M && x + w > R) {
        x = M;
        y += 16;
      }
      op({ t: "rect", x, y: y - 8, w: 8, h: 8, color: C.seg[p.key] ?? C.muted });
      op({ t: "text", x: x + 12, y, s: p.label, size: 10, color: C.text });
      op({ t: "text", x: x + 16 + measure(p.label, 10), y, s: pc, size: 10, bold: true, color: C.text });
      x += w + 16;
    }
    y += 6;
  }

  // The table
  y += 20;
  para(r.caption, 12, { bold: true });
  y += 4;
  const n = r.columns.length;
  const colW = n === 1 ? 140 : Math.min(120, (R - M - 170) / n);
  const right = (i: number) => R - 8 - (n - 1 - i) * colW;
  if (n > 1) {
    const heads = r.columns.map((c) => wrap(c, 9, colW - 12, true));
    const lines = Math.max(...heads.map((h) => h.length));
    room(lines * 12 + 8);
    heads.forEach((h, i) =>
      h.forEach((line, j) => op({ t: "text", x: right(i), y: y + 10 + j * 12, s: line, size: 9, bold: true, color: C.muted, right: true })),
    );
    y += lines * 12 + 6;
    op({ t: "rect", x: M, y, w: R - M, h: 0.75, color: C.line });
  }
  for (const row of r.rows) {
    const minor = row.kind === "info" || row.kind === "sub";
    const total = row.kind === "total";
    const h = minor ? 20 : 24;
    const size = minor ? 10 : 11;
    room(h);
    if (total) op({ t: "rect", x: M, y, w: R - M, h, color: C.soft });
    const base = y + h / 2 + size * 0.36;
    const indent = row.kind === "info" ? 16 : row.kind === "sub" ? 28 : 8;
    op({ t: "text", x: M + indent, y: base, s: total ? `= ${row.label}` : row.label, size, bold: total, color: minor ? C.muted : C.text });
    const color = row.kind === "deduction" ? C.deduct : total ? C.keep : minor ? C.muted : C.text;
    row.cells.forEach((c, i) => op({ t: "text", x: right(i), y: base, s: c.text, size, bold: total, color, right: true }));
    if (!total) op({ t: "rect", x: M, y: y + h - 0.5, w: R - M, h: 0.5, color: C.line });
    y += h;
  }

  // Notes and warnings
  const bullets = (items: string[], color: string) => {
    for (const item of items) {
      const first = pages.length;
      const top = y;
      para(item, 10, { color, x: M + 12, lh: 14 });
      // The bullet sits on the item's first line, which may have moved to a new page.
      const at = pages.length === first ? top : M;
      pages.at(-1)!.push({ t: "text", x: M + 2, y: at + 10.5, s: "•", size: 10, color });
    }
  };
  if (r.notes.length) {
    y += 16;
    bullets(r.notes, C.muted);
  }
  if (r.warnings.length) {
    y += 12;
    para("Check this", 11, { bold: true, color: C.warn });
    bullets(r.warnings, C.text);
  }

  // Footer
  y += 18;
  room(40);
  op({ t: "rect", x: M, y, w: R - M, h: 0.5, color: C.line });
  y += 8;
  para(DISCLAIMER, 8.5, { color: C.muted });
  para(`Calculated on ${r.date} at ${r.url}`, 8.5, { color: C.muted });
  return { pages, height: y + M };
}

// ---------- PDF ----------

/** Helvetica advance widths (per 1000 em) for ASCII 32–126, from the standard AFM. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584,
  556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278,
  278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const EXTRA: Record<string, number> = { "£": 556, "−": 333, "•": 350, "·": 278, "–": 556, "—": 1000, "’": 222, "‘": 222, "×": 584, "é": 556 };

/** Close enough for layout: digits, £ and punctuation are the same width in bold, letters a little wider. */
export const helvetica: Measure = (s, size, bold) => {
  let w = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    const base = code >= 32 && code <= 126 ? HELVETICA[code - 32]! : (EXTRA[ch] ?? 556);
    w += bold && /[A-Za-z]/.test(ch) ? base * 1.07 : base;
  }
  return (w * size) / 1000;
};

/** Characters outside ASCII that WinAnsiEncoding has at a different code from Unicode. */
const WIN_ANSI: Record<string, number> = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "−": 0x2d };

/** A PDF string literal in WinAnsiEncoding, kept to ASCII bytes with octal escapes. */
function pdfString(s: string) {
  let out = "";
  for (const ch of s) {
    let code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (code > 0xff) code = 0x3f; // "?" for anything the standard fonts can't draw
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(code);
  }
  return `(${out})`;
}

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

export function toPdf(r: Report): Uint8Array {
  const W = 595.28;
  const H = 841.89; // A4
  const { pages } = layout(r, helvetica, W, H);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // the new length is the object's number
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // the page tree, filled in once the pages exist
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const ops of pages) {
    const stream = ops
      .map((o) =>
        o.t === "rect"
          ? `${rgb(o.color)} rg ${n2(o.x)} ${n2(H - o.y - o.h)} ${n2(o.w)} ${n2(o.h)} re f`
          : `BT /F${o.bold ? 2 : 1} ${o.size} Tf ${rgb(o.color)} rg ${n2(o.right ? o.x - helvetica(o.s, o.size, o.bold) : o.x)} ${n2(H - o.y)} Td ${pdfString(o.s)} Tj ET`,
      )
      .join("\n");
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${pdfString(r.title)} /Producer (UK Salary Calculator) >>`);

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

// ---------- image ----------

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export async function toPng(r: Report): Promise<Blob> {
  const W = 600;
  const scale = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = (size: number, bold?: boolean) => `${bold ? 650 : 400} ${size}px ${FONT}`;
  const measure: Measure = (s, size, bold) => {
    ctx.font = font(size, bold);
    return ctx.measureText(s).width;
  };
  const { pages, height } = layout(r, measure, W);
  canvas.width = W * scale;
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  for (const o of pages[0]!) {
    ctx.fillStyle = o.color;
    if (o.t === "rect") ctx.fillRect(o.x, o.y, o.w, o.h);
    else {
      ctx.font = font(o.size, o.bold);
      ctx.textAlign = o.right ? "right" : "left";
      ctx.fillText(o.s, o.x, o.y);
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
}

/** Make the file and hand it to the browser as a download. */
export async function download(r: Report, format: Format) {
  const blob =
    format === "png"
      ? await toPng(r)
      : format === "pdf"
        ? new Blob([toPdf(r) as BlobPart], { type: "application/pdf" })
        : new Blob([toXlsx(r) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const name = fileName(r, new Date(), format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
