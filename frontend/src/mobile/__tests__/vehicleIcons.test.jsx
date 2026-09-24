import { vehicleKind } from "../vehicleIcons";

test("tür/marka → ikon tipi (PSA hacimleri ortak, diğerleri ayrı)", () => {
  const k = (vehicle_brand, is_trailer) => vehicleKind({ vehicle_brand, is_trailer });
  expect(k("15M³ PSA")).toBe("psa");
  expect(k("17M³ PSA")).toBe("psa");
  expect(k("13M³ PSA")).toBe("psa");
  expect(k("MERCEDES")).toBe("mercedes");
  expect(k("IVECO")).toBe("iveco");
  expect(k("VOLKSWAGEN")).toBe("volkswagen");
  expect(k("MAN")).toBe("man");
  expect(k("FORD")).toBe("ford");
  expect(k("RENAULT")).toBe("renault");
  expect(k("Renault")).toBe("renault");
  expect(k("SEMİ ENTEGRE")).toBe("semi");
  expect(k("OTOBÜS")).toBe("bus");
  expect(k("ÇEKME KARAVAN", true)).toBe("trailer");
  expect(k("", true)).toBe("trailer");
  expect(k("")).toBe(null);
  expect(k("Mantar")).toBe(null); // MAN öneki yanlış eşleşmesin
});
