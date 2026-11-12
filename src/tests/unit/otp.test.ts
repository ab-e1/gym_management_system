import { describe, test, expect } from "bun:test";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  timingSafeEqual,
} from "../../utils/otp.ts";

describe("OTP Cryptographic Utilities (Unit)", () => {
  describe("generateOtp", () => {
    test("should return a 6-digit numeric string", () => {
      const otp = generateOtp();
      expect(typeof otp).toBe("string");
      expect(otp.length).toBe(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    });

    test("should generate values between 100000 and 999999", () => {
      for (let i = 0; i < 50; i++) {
        const otpNum = parseInt(generateOtp(), 10);
        expect(otpNum).toBeGreaterThanOrEqual(100_000);
        expect(otpNum).toBeLessThan(1_000_000);
      }
    });

    test("should generate unique, non-deterministic values across iterations", () => {
      const generated = new Set<string>();
      for (let i = 0; i < 50; i++) {
        generated.add(generateOtp());
      }
      // With CSPRNG randomInt(100000, 1000000), 50 random samples will not collapse into 1
      expect(generated.size).toBeGreaterThanOrEqual(45);
    });
  });

  describe("hashOtp", () => {
    test("should return a 64-character hex string (256-bit HMAC digest)", () => {
      const hash = hashOtp("123456");
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    test("should be deterministic for the same input", () => {
      const hash1 = hashOtp("654321");
      const hash2 = hashOtp("654321");
      expect(hash1).toBe(hash2);
    });

    test("should produce completely different hashes for different inputs (Avalanche effect)", () => {
      const hash1 = hashOtp("100001");
      const hash2 = hashOtp("100002");
      expect(hash1).not.toBe(hash2);
    });

    test("should automatically trim surrounding whitespace", () => {
      const hashWithSpace = hashOtp("  789123  ");
      const hashClean = hashOtp("789123");
      expect(hashWithSpace).toBe(hashClean);
    });
  });

  describe("verifyOtp", () => {
    test("should return true when input matches the stored hash", () => {
      const code = "987654";
      const storedHash = hashOtp(code);
      expect(verifyOtp(code, storedHash)).toBe(true);
    });

    test("should return false when input code is incorrect", () => {
      const correctCode = "123456";
      const wrongCode = "654321";
      const storedHash = hashOtp(correctCode);
      expect(verifyOtp(wrongCode, storedHash)).toBe(false);
    });

    test("should return false when input code is empty or wrong length", () => {
      const storedHash = hashOtp("123456");
      expect(verifyOtp("", storedHash)).toBe(false);
      expect(verifyOtp("123", storedHash)).toBe(false);
    });
  });

  describe("timingSafeEqual", () => {
    test("should return true for identical strings", () => {
      expect(timingSafeEqual("abc123xyz", "abc123xyz")).toBe(true);
    });

    test("should return false for different strings of same length", () => {
      expect(timingSafeEqual("abc123xyz", "abc123xyw")).toBe(false);
    });

    test("should return false for strings of different length without throwing", () => {
      expect(timingSafeEqual("short", "longer_string")).toBe(false);
    });
  });
});
