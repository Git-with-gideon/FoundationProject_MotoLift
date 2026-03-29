const crypto = require("crypto");

describe("Input Validation", () => {
  const PLATE_REGEX = /^[Rr][A-Za-z] ?\d{3}[A-Za-z]$/;
  const LICENSE_REGEX = /^(RW-DL-\d{4,10}|[A-Z]{2}\d{3}[A-Z])$/;

  test("accepts valid Rwanda plates", () => {
    expect(PLATE_REGEX.test("RA 234B")).toBe(true);
    expect(PLATE_REGEX.test("RC456D")).toBe(true);
  });

  test("rejects invalid plates", () => {
    expect(PLATE_REGEX.test("KA 234B")).toBe(false);
    expect(PLATE_REGEX.test("RA 23B")).toBe(false);
  });

  test("accepts valid license formats", () => {
    expect(LICENSE_REGEX.test("RD344F")).toBe(true);
    expect(LICENSE_REGEX.test("RW-DL-1234")).toBe(true);
  });

  test("escrow ownership caps at 100%", () => {
    const calc = (paid, total) => Math.min(100, (paid / total) * 100);
    expect(calc(2222, 1200000)).toBeCloseTo(0.185, 2);
    expect(calc(1200000, 1200000)).toBe(100);
    expect(calc(1500000, 1200000)).toBe(100);
  });
});
