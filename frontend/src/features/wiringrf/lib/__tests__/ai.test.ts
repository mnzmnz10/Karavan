import { parseProductList } from "../ai";

function countTemplate(text: string, templateId: string) {
  const { items } = parseProductList(text);
  return items
    .filter((item) => item.templateId === templateId)
    .reduce((sum, item) => sum + item.qty, 0);
}

describe("parseProductList quantities", () => {
  it("does not treat model numbers or capacities as quantities", () => {
    const text = [
      "MPPT 250/100",
      "MultiPlus-II 12/3000",
      "200Ah aku",
    ].join("\n");

    expect(countTemplate(text, "mppt_250_100")).toBe(1);
    expect(countTemplate(text, "multiplus_ii_12_3000")).toBe(1);
    expect(countTemplate(text, "lifepo4_200")).toBe(1);
  });

  it("counts explicit adet and Nx quantities", () => {
    expect(countTemplate("2 adet MPPT 250/100", "mppt_250_100")).toBe(2);
    expect(countTemplate("3x 455W solar panel", "solar_panel_455")).toBe(3);
  });
});
