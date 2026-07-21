import { buildCableTotals, buildFuseList, type CableRow } from "../bom";

describe("BOM cable and fuse summaries", () => {
  it("groups cable lengths and fuse quantities", () => {
    const cables: CableRow[] = [
      { type: "DC +", color: "#f00", size: "16mm2", fuse: "100A", from: "Aku", to: "Lynx", length: 1.5 },
      { type: "DC +", color: "#f00", size: "16mm2", fuse: "100A", from: "Aku", to: "Lynx", length: 2 },
      { type: "DC -", color: "#000", size: "16mm2", from: "Aku", to: "Lynx", length: 1 },
    ];

    expect(buildCableTotals(cables)).toEqual([
      { type: "DC +", color: "#f00", size: "16mm2", qty: 2, totalLength: 3.5 },
      { type: "DC -", color: "#000", size: "16mm2", qty: 1, totalLength: 1 },
    ]);
    expect(buildFuseList(cables)).toEqual([
      { fuse: "100A", cableType: "DC +", cableSize: "16mm2", from: "Aku", to: "Lynx", qty: 2 },
    ]);
  });
});
