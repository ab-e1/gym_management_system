import { describe, test, expect } from "bun:test";
import {
  escapeSqlLikePattern,
  formatOtpMessage,
  isValidUUID,
  maskPhone,
  normalizePhoneNumber,
} from "../../utils/helpers.ts";

describe("escapeSqlLikePattern Unit Tests", () => {
  test("should escape % wildcard character", () => {
    expect(escapeSqlLikePattern("100%")).toBe("100\\%");
    expect(escapeSqlLikePattern("%test%")).toBe("\\%test\\%");
  });

  test("should escape _ wildcard character", () => {
    expect(escapeSqlLikePattern("user_name")).toBe("user\\_name");
    expect(escapeSqlLikePattern("_test_")).toBe("\\_test\\_");
  });

  test("should escape backslash \\ character", () => {
    expect(escapeSqlLikePattern("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  test("should escape mixed wildcard characters", () => {
    expect(escapeSqlLikePattern("%_\\%_\\")).toBe("\\%\\_\\\\\\%\\_\\\\");
  });

  test("should leave regular strings unchanged", () => {
    expect(escapeSqlLikePattern("Dawit Bekele")).toBe("Dawit Bekele");
    expect(escapeSqlLikePattern("0911223344")).toBe("0911223344");
    expect(escapeSqlLikePattern("")).toBe("");
  });
});

describe("normalizePhoneNumber Unit Tests", () => {
  test("should format local 09... numbers to E.164 +2519...", () => {
    expect(normalizePhoneNumber("0911223344")).toBe("+251911223344");
  });

  test("should format local 07... numbers to E.164 +2517... (Safaricom Ethiopia)", () => {
    expect(normalizePhoneNumber("0711223344")).toBe("+251711223344");
    expect(normalizePhoneNumber("251711223344")).toBe("+251711223344");
    expect(normalizePhoneNumber("+251711223344")).toBe("+251711223344");
    expect(normalizePhoneNumber("711 22 33 44")).toBe("+251711223344");
  });

  test("should format 2519... numbers to +2519...", () => {
    expect(normalizePhoneNumber("251911223344")).toBe("+251911223344");
  });

  test("should preserve numbers already in +251... format and strip internal spaces/hyphens", () => {
    expect(normalizePhoneNumber("+251911223344")).toBe("+251911223344");
    expect(normalizePhoneNumber("+251 911-22-33-44")).toBe("+251911223344");
    expect(normalizePhoneNumber("911 22 33 44")).toBe("+251911223344");
  });

  test("should return undefined if phone is empty, whitespace-only, or undefined", () => {
    expect(normalizePhoneNumber(undefined)).toBeUndefined();
    expect(normalizePhoneNumber("")).toBeUndefined();
    expect(normalizePhoneNumber("   ")).toBeUndefined();
    expect(normalizePhoneNumber(" - ")).toBeUndefined();
  });

  test("should return undefined for invalid or unsupported phone formats", () => {
    expect(normalizePhoneNumber("invalid-phone-123")).toBeUndefined();
    expect(normalizePhoneNumber("12345")).toBeUndefined();
    expect(normalizePhoneNumber("+14155551234")).toBeUndefined();
    expect(normalizePhoneNumber("0811223344")).toBeUndefined();
    expect(normalizePhoneNumber("091122334")).toBeUndefined(); // Too short (8 subscriber digits)
    expect(normalizePhoneNumber("091122334455")).toBeUndefined(); // Too long (10 subscriber digits)
  });
});

describe("isValidUUID Unit Tests", () => {
  test("should validate standard v4 UUIDs", () => {
    expect(isValidUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  test("should return false for invalid strings", () => {
    expect(isValidUUID("invalid-id")).toBe(false);
    expect(isValidUUID("123")).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
  });
});

describe("maskPhone Unit Tests", () => {
  test("should mask standard Ethiopian E.164 phone numbers", () => {
    expect(maskPhone("+251911234567")).toBe("+2519****4567");
    expect(maskPhone("+251712345678")).toBe("+2517****5678");
  });

  test("should mask 9-digit and 10-digit local phone numbers without leaking subscriber digits", () => {
    expect(maskPhone("0911234567")).toBe("091****67");
    expect(maskPhone("911234567")).toBe("911****67");
  });

  test("should mask 11-digit and 12-digit numbers safely without under-masking", () => {
    expect(maskPhone("251911234567")).toBe("251****567");
    expect(maskPhone("25191123456")).toBe("251****456");
    expect(maskPhone("+14155551234")).toBe("+14****234");
  });

  test("should clean spaces and hyphens before masking so separators do not break slice boundaries", () => {
    expect(maskPhone("+251 911-22-33-44")).toBe("+2519****3344");
    expect(maskPhone("0911 22 33 44")).toBe("091****44");
    expect(maskPhone("+251-911-234567")).toBe("+2519****4567");
  });

  test("should trim whitespace and safely mask shorter or empty values", () => {
    expect(maskPhone("  +251911234567  ")).toBe("+2519****4567");
    expect(maskPhone("12345678")).toBe("12****78");
    expect(maskPhone("1234567")).toBe("12****67");
    expect(maskPhone("123456")).toBe("****");
    expect(maskPhone("")).toBe("****");
  });
});

describe("formatOtpMessage Unit Tests", () => {
  test("should generate standard security OTP body with default 5-minute TTL", () => {
    const msg = formatOtpMessage("482910");
    expect(msg).toContain("482910");
    expect(msg).toContain("GymMS");
    expect(msg).toContain("5 minutes");
  });

  test("should use singular 'minute' when expiration is 1 minute", () => {
    const msg = formatOtpMessage("482910", "GymMS", 1);
    expect(msg).toContain("Valid for 1 minute.");
    expect(msg).not.toContain("1 minutes");
  });

  test("should allow custom gym / app name and custom expiration minutes", () => {
    const msg = formatOtpMessage("123456", "Bole Fitness Hub", 10);
    expect(msg).toContain("Bole Fitness Hub");
    expect(msg).toContain("123456");
    expect(msg).toContain("10 minutes");
  });
});
