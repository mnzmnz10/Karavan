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
