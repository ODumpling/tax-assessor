import { describe, expect, it } from "vitest";
import { fileName, helvetica, layout, toPdf, toXlsx, type Report } from "../src/client/export";

const report: Report = {
  title: "Take-home pay",
  headline: { title: "Your take-home pay", figure: "£2,393.30", unit: "a month", sub: "£28,719.60 a year · 2026/27 tax year" },
  share: [
    { key: "keep", label: "Take-home", share: 0.821 },
    { key: "tax", label: "Income tax", share: 0.128 },
    { key: "ni", label: "National Insurance", share: 0.051 },
  ],
  caption: "Breakdown per month, 2026/27 tax year",
  columns: ["Amount per month"],
  rows: [
    { label: "Gross pay", cells: [{ value: 2916.666667, text: "£2,916.67" }] },
    { label: "Income tax", kind: "deduction", cells: [{ value: -373.83, text: "−£373.83" }] },
    { label: "Basic rate (20%)", kind: "sub", cells: [{ value: 373.83, text: "£373.83" }] },
    { label: "Take-home pay", kind: "total", cells: [{ value: 2393.3, text: "£2,393.30" }] },
  ],
  notes: ["28% of your next £1 of pay would go on tax, National Insurance and loans."],
  warnings: [],
  url: "https://example.test/?salary=35000",
  date: "2 November 2026",
};

/** The files in a stored (uncompressed) zip, checking each CRC on the way. */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLen + size;
  }
  return files;
}

describe("toXlsx", () => {
  const files = unzip(toXlsx(report));

  it("has the parts Excel needs", () => {
    expect([...files.keys()].sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort(),
    );
  });

  it("stores amounts as numbers rounded to the penny, deductions negative", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("<v>2916.67</v>");
    expect(sheet).toContain("<v>-373.83</v>");
    expect(sheet).toContain("<v>0.821</v>");
    expect(sheet).toContain("Your take-home pay: £2,393.30 a month");
    expect(sheet).toContain("https://example.test/?salary=35000");
  });

  it("escapes text", () => {
    const sheet = unzip(toXlsx({ ...report, title: "A & <B>" })).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("A &amp; &lt;B&gt;");
  });
});

describe("toPdf", () => {
  const pdf = String.fromCharCode(...toPdf(report));

  it("has a cross-reference table that points at each object", () => {
    const start = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(4);
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("writes £ and the minus sign in WinAnsi", () => {
    expect(pdf).toContain("(\\2432,393.30) Tj");
    expect(pdf).toContain("(-\\243373.83) Tj");
  });

  it("only contains single-byte characters", () => {
    expect([...pdf].every((c) => c.charCodeAt(0) < 256)).toBe(true);
  });
});

describe("layout", () => {
  it("breaks long tables onto new pages", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ label: `Row ${i}`, cells: [{ value: i, text: `£${i}` }] }));
    const { pages } = layout({ ...report, rows }, helvetica, 595, 842);
    expect(pages.length).toBe(3);
    for (const page of pages) for (const o of page) expect(o.y).toBeLessThan(842 - 40);
  });

  it("is one long page without a page height", () => {
    expect(layout(report, helvetica, 600).pages.length).toBe(1);
  });
});

it("names files after the calculator and the date", () => {
  expect(fileName(report, new Date(2026, 10, 2), "pdf")).toBe("take-home-pay-2026-11-02.pdf");
});
