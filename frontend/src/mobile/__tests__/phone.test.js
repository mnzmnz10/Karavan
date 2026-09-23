jest.mock("../api", () => ({ __esModule: true, services: {}, products: { list: () => Promise.resolve([]) } }));
import { formatPhoneTR } from "../screens/ServiceForm";

test.each([
  ["05551112233", "0555 111 22 33"],
  ["5551112233", "0555 111 22 33"],
  ["+90 555 111 22 33", "0555 111 22 33"],
  ["905551112233", "0555 111 22 33"],
  ["0 (282) 651 00 00", "0282 651 00 00"],
  ["12345", "12345"],
  ["", ""],
])("%s → %s", (i, o) => expect(formatPhoneTR(i)).toBe(o));

const { formatPlateTR } = require("../screens/ServiceForm");
test.each([
  ["59abc123", "59 ABC 123"],
  ["59 ab 1234", "59 AB 1234"],
  ["34a12", "34 A 12"],
  ["DE-AB 123", "DE-AB 123"],
  ["", ""],
])("plaka %s → %s", (i, o) => expect(formatPlateTR(i)).toBe(o));

test("isValidTC", () => {
  jest.doMock("../api", () => ({ __esModule: true, default: { get: () => Promise.resolve({ data: [] }) } }));
  const { isValidTC } = require("../screens/Contracts");
  expect(isValidTC("10000000146")).toBe(true);
  expect(isValidTC("12345678901")).toBe(false);
  expect(isValidTC("01234567890")).toBe(false);
  expect(isValidTC("123")).toBe(false);
});
