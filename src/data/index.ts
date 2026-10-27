import { taxYearSchema, type TaxYear } from "./schema";

/**
 * Every JSON file in ./tax-years is loaded, validated and sorted here.
 * Add a year by adding a file — nothing else needs changing.
 * A bad file throws, which fails `astro build` and `pnpm test`.
 */
export function loadTaxYears(files: Record<string, unknown>): TaxYear[] {
  const years = Object.entries(files).map(([path, raw]) => {
    const fileId = path.split("/").pop()!.replace(/\.json$/, "");
    const parsed = taxYearSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
      throw new Error(`Invalid tax year file ${fileId}.json:\n${issues}`);
    }
    if (parsed.data.id !== fileId) throw new Error(`${fileId}.json has id "${parsed.data.id}" — they must match`);
    return parsed.data;
  });
  if (years.length === 0) throw new Error("No tax year files found in src/data/tax-years");
  return years.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export const taxYears = loadTaxYears(
  import.meta.glob("./tax-years/*.json", { eager: true, import: "default" }),
);
