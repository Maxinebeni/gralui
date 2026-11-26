import { describe, expect, it } from "vitest";
import { toXlsx } from "./xlsx";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("toXlsx", () => {
  it("makes a zip with the workbook parts", () => {
    const bytes = toXlsx([["Client", "Active policies"], ["Bralirwa PLC", 3]], "Clients");
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const all = text(bytes);
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) expect(all).toContain(part);
    expect(all).toContain('<sheet name="Clients"');
  });

  it("keeps numbers as numbers and text as text, never as formulas", () => {
    const all = text(toXlsx([["A", "B"], ["=SUM(1,2)", 7], ["Tom & Co <Ltd>", null]]));
    expect(all).toContain('<c r="B2"><v>7</v></c>');
    expect(all).toContain('t="inlineStr"><is><t xml:space="preserve">=SUM(1,2)</t>');
    expect(all).not.toContain("<f>");
    expect(all).toContain("Tom &amp; Co &lt;Ltd&gt;");
  });
});
