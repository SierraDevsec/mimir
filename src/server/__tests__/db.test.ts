import { describe, it, expect } from "vitest";
import { extractCount } from "../db.js";

describe("extractCount", () => {
  it("should return 0 for empty array", () => {
    expect(extractCount([])).toBe(0);
  });

  it("should handle BigInt", () => {
    expect(extractCount([{ count: 10n }])).toBe(10);
  });

  it("should handle Number", () => {
    expect(extractCount([{ count: 5 }])).toBe(5);
  });

  it("should return 0 when count is undefined", () => {
    expect(extractCount([{}])).toBe(0);
  });

  it("should return 0 when count is null-ish", () => {
    expect(extractCount([{ count: undefined }])).toBe(0);
  });
});
