import { payType, collectionEntries } from "../CollectionsReport";

test("ödeme türü açıklamadan", () => {
  expect(payType("Nakit")).toBe("Nakit");
  expect(payType("KAPORA HAVALE")).toBe("EFT/Havale");
  expect(payType("kredi kartı")).toBe("Kart");
  expect(payType("Avans")).toBe("Diğer");
  expect(payType("NAKİT ALINDI")).toBe("Nakit");
  expect(payType("MNZ - ENPARA")).toBe("EFT/Havale");
  expect(payType("MNZ ENPARA İBAN")).toBe("EFT/Havale");
});

test("girişler: servis tahsilatları + eski avans + sözleşme (döviz × kur), tarihsizler dışarıda", () => {
  const e = collectionEntries(
    [{ id: "s1", customer_name: "A", collections: [{ id: "x", date: "2026-09-01", description: "EFT", amount: 100, currency: "USD", rate: 40 }] },
     { id: "s2", customer_name: "B", arrival_date: "2026-09-03", advance_amount: 2000 },
     { id: "s3", collections: [{ id: "y", amount: 5 }] }],
    [{ id: "k1", customer_name: "C", data: { collections: [{ id: "z", date: "2026-09-04", description: "Nakit", amount: "1000", currency: "EUR", rate: "50" }] } }],
  );
  expect(e.map((x) => [x.who, x.amount, x.type, x.kind])).toEqual([["A", 4000, "EFT/Havale", "service"], ["B", 2000, "Diğer", "service"], ["C", 50000, "Nakit", "contract"]]);
});
