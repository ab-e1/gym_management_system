import { describe, test, expect } from "bun:test";
import { enrollmentSchema } from "../../../schema/enrollment.schema.ts";

describe("enrollmentSchema unit tests", () => {
  const validPayload = {
    planId: "123e4567-e89b-12d3-a456-426614174000",
    userData: {
      name: "Abebe Kebede",
      phoneNumber: "0911223344",
      email: "abebe@gmail.com",
    },
    paymentData: {
      paymentMethod: "telebirr",
      amount: 2500,
      referenceCode: "FT2610A87B92",
    },
  };

  test("should pass with a fully valid enrollment payload", () => {
    const result = enrollmentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.planId).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(result.data.userData.phoneNumber).toBe("+251911223344");
      expect(result.data.paymentData.paymentMethod).toBe("telebirr");
      expect(result.data.paymentData.amount).toBe(2500);
      expect(result.data.paymentData.referenceCode).toBe("FT2610A87B92");
    }
  });

  test("should pass with optional fields omitted (email, amount, referenceCode)", () => {
    const payload = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      userData: {
        name: "Almaz Kebede",
        phoneNumber: "+251911223344",
      },
      paymentData: {
        paymentMethod: "cash",
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userData.email).toBeUndefined();
      expect(result.data.paymentData.amount).toBeUndefined();
      expect(result.data.paymentData.referenceCode).toBeUndefined();
    }
  });

  test("should fail if planId is not a valid UUID", () => {
    const payload = {
      ...validPayload,
      planId: "invalid-not-a-uuid",
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if planId is missing", () => {
    const { planId, ...payload } = validPayload;
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if userData.name is empty", () => {
    const payload = {
      ...validPayload,
      userData: {
        ...validPayload.userData,
        name: "",
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if userData.phoneNumber is not a valid Ethiopian phone", () => {
    const payload = {
      ...validPayload,
      userData: {
        ...validPayload.userData,
        phoneNumber: "12345",
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if userData.email is invalid", () => {
    const payload = {
      ...validPayload,
      userData: {
        ...validPayload.userData,
        email: "not-an-email",
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if paymentData.paymentMethod is not cash, telebirr, or bank", () => {
    const payload = {
      ...validPayload,
      paymentData: {
        ...validPayload.paymentData,
        paymentMethod: "crypto",
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test("should fail if paymentData.amount is negative or zero", () => {
    const payload = {
      ...validPayload,
      paymentData: {
        ...validPayload.paymentData,
        amount: -100,
      },
    };
    const result = enrollmentSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
