import { describe, test, expect } from "bun:test";
import { sendOtpSchema, verifyOtpSchema } from "../../../schema/auth.schema.ts";

describe("Auth Zod Schemas Unit Tests", () => {
  const validGymId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  describe("sendOtpSchema", () => {
    test("should pass with valid gymId and 09... local phone number, normalizing to +2519...", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "0911223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gymId).toBe(validGymId);
        expect(result.data.phoneNumber).toBe("+251911223344");
      }
    });

    test("should pass with valid gymId and 07... Safaricom phone number, normalizing to +2517...", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "0711223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phoneNumber).toBe("+251711223344");
      }
    });

    test("should pass with valid E.164 +2519... phone number", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "+251911223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phoneNumber).toBe("+251911223344");
      }
    });

    test("should accept 'phone' alias key and normalize to 'phoneNumber'", () => {
      const input = {
        gymId: validGymId,
        phone: "0911223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phoneNumber).toBe("+251911223344");
      }
    });

    test("should fail if gymId is not a valid UUID", () => {
      const input = {
        gymId: "invalid-uuid-123",
        phoneNumber: "0911223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("should fail if gymId is missing", () => {
      const input = {
        phoneNumber: "0911223344",
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("should fail if phoneNumber is invalid or unsupported operator", () => {
      const invalidPhones = [
        "0112233440", // Addis landline (not mobile)
        "123456", // Too short
        "091122334455", // Too long
        "+14155552671", // US number
        "not-a-number",
        "",
      ];

      for (const phone of invalidPhones) {
        const result = sendOtpSchema.safeParse({
          gymId: validGymId,
          phoneNumber: phone,
        });
        expect(result.success).toBe(false);
      }
    });

    test("should fail if phoneNumber is missing", () => {
      const input = {
        gymId: validGymId,
      };
      const result = sendOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("verifyOtpSchema", () => {
    test("should pass with valid gymId, valid phone, and valid 6-digit numeric code", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "0911223344",
        code: "123456",
      };
      const result = verifyOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gymId).toBe(validGymId);
        expect(result.data.phoneNumber).toBe("+251911223344");
        expect(result.data.code).toBe("123456");
      }
    });

    test("should trim surrounding whitespace from code", () => {
      const input = {
        gymId: validGymId,
        phone: "0911223344",
        code: "  654321  ",
      };
      const result = verifyOtpSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe("654321");
      }
    });

    test("should fail if code contains non-digit characters", () => {
      const invalidCodes = ["12345a", "abcdef", "12 345", "12-345"];
      for (const code of invalidCodes) {
        const result = verifyOtpSchema.safeParse({
          gymId: validGymId,
          phoneNumber: "0911223344",
          code,
        });
        expect(result.success).toBe(false);
      }
    });

    test("should fail if code is not exactly 6 digits", () => {
      const invalidLengthCodes = ["1", "12", "123", "1234", "12345", "1234567", "12345678"];
      for (const code of invalidLengthCodes) {
        const result = verifyOtpSchema.safeParse({
          gymId: validGymId,
          phoneNumber: "0911223344",
          code,
        });
        expect(result.success).toBe(false);
      }
    });

    test("should fail if code is missing", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "0911223344",
      };
      const result = verifyOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("should fail if gymId is invalid UUID", () => {
      const input = {
        gymId: "not-a-uuid",
        phoneNumber: "0911223344",
        code: "123456",
      };
      const result = verifyOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("should fail if phone is invalid", () => {
      const input = {
        gymId: validGymId,
        phoneNumber: "invalid-phone",
        code: "123456",
      };
      const result = verifyOtpSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
