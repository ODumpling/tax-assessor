import { describe, expect, it } from "vitest";
import { parseAmount } from "../src/client/parse";

describe("parseAmount", () => {
  it.each([
    ["35000", 35000],
    ["35,000", 35000],
    ["£35,000.50", 35000.5],
    ["£ 1 500", 1500],
    ["35k", 35000],
    ["2.5K", 2500],
    [".5", 0.5],
    ["12.", 12],
    ["5%", 5],
    ["5.5 %", 5.5],
  ])("reads %s", (raw, want) => expect(parseAmount(raw)).toBe(want));

  it.each(["", "  ", "£"])("treats %j as missing", (raw) => expect(parseAmount(raw)).toBeUndefined());

  it.each(["abc", "35,5", "1,00,000", "-5", "3.5.1", "k"])("rejects %s", (raw) => expect(parseAmount(raw)).toBeNull());
});
