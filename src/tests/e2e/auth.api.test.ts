import {
  test,
  describe,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  spyOn,
} from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  gymStaff,
  users,
  sessions,
  verifications,
  members,
} from "../../db/schema.ts";
import * as smsModule from "../../utils/sms.ts";
import * as otp from "../../utils/otp.ts";
import { resetOtpRateLimitStore } from "../../utils/otpRatelimit.ts";
import { eq } from "drizzle-orm";
import type { TestResponse } from "../../utils/response.ts";

const getJson = async <T = any>(res: Response): Promise<TestResponse<T>> => {
  return (await res.json()) as TestResponse<T>;
};

describe("Auth API (Phone OTP & Session) - End-to-End Test Suite", () => {
  // Test Gym 1
  let gym1Id: string;
  let gym1Slug = "olympia-fitness-auth-test";

  // Test Gym 2 (Multi-tenant check)
  let gym2Id: string;
  let gym2Slug = "bole-fitness-auth-test";

  // Owner User at Gym 1
  let ownerUserId: string;
  const ownerPhone = "+251911888999";
  const ownerLocalPhone = "0911888999";

  // Active Staff Member at Gym 1
  let activeStaffUserId: string;
  const activeStaffPhone = "+251911223344";
  const activeStaffLocalPhone = "0911223344";

  // Active Coach Member at Gym 1 (Safaricom)
  let activeCoachUserId: string;
  const activeCoachPhone = "+251711223344";

  // Inactive User
  let inactiveUserId: string;
  const inactiveUserPhone = "+251922334455";

  // Banned User
  let bannedUserId: string;
  const bannedUserPhone = "+251933445566";

  // Suspended Staff Badge
  let suspendedStaffUserId: string;
  const suspendedStaffPhone = "+251944556677";

  // Soft-deleted Staff Badge
  let deletedStaffUserId: string;
  const deletedStaffPhone = "+251955667788";

  // User with No Staff Badge
  const userWithoutBadgePhone = "+251966778899";

  let smsSpy: ReturnType<typeof spyOn>;

  const cleanupDatabase = async () => {
    await connection.delete(verifications);
    await connection.delete(sessions);
    await connection.delete(members);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  };

  beforeAll(async () => {
    smsSpy = spyOn(smsModule, "sendSms");
    await cleanupDatabase();

    // 1. Seed Gyms
    const [gym1] = await connection
      .insert(gyms)
      .values({
        name: "Olympia Fitness",
        slug: gym1Slug,
        status: "active",
      })
      .returning();
    gym1Id = gym1.id;

    const [gym2] = await connection
      .insert(gyms)
      .values({
        name: "Bole Branch Fitness",
        slug: gym2Slug,
        status: "active",
      })
      .returning();
    gym2Id = gym2.id;

    // 2. Seed Gym 1 Owner
    const [ownerUser] = await connection
      .insert(users)
      .values({
        name: "Owner Dawit",
        phoneNumber: ownerPhone,
        status: "active",
        phoneNumberVerified: true,
      })
      .returning();
    ownerUserId = ownerUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: ownerUserId,
      role: "owner",
      status: "active",
      isDeleted: false,
    });

    // 3. Seed Active Staff User at Gym 1
    const [staffUser] = await connection
      .insert(users)
      .values({
        name: "Staff Abebe",
        phoneNumber: activeStaffPhone,
        status: "active",
        phoneNumberVerified: false,
      })
      .returning();
    activeStaffUserId = staffUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: activeStaffUserId,
      role: "staff",
      status: "active",
      isDeleted: false,
    });

    // 4. Seed Active Coach at Gym 1 (Safaricom 07... number)
    const [coachUser] = await connection
      .insert(users)
      .values({
        name: "Coach Chala",
        phoneNumber: activeCoachPhone,
        status: "active",
        phoneNumberVerified: false,
      })
      .returning();
    activeCoachUserId = coachUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: activeCoachUserId,
      role: "coach",
      status: "active",
      isDeleted: false,
    });

    // 5. Seed Inactive User at Gym 1
    const [inactiveUser] = await connection
      .insert(users)
      .values({
        name: "Inactive Person",
        phoneNumber: inactiveUserPhone,
        status: "inactive",
      })
      .returning();
    inactiveUserId = inactiveUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: inactiveUserId,
      role: "staff",
      status: "active",
      isDeleted: false,
    });

    // 6. Seed Banned User at Gym 1
    const [bannedUser] = await connection
      .insert(users)
      .values({
        name: "Banned Person",
        phoneNumber: bannedUserPhone,
        status: "banned",
      })
      .returning();
    bannedUserId = bannedUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: bannedUserId,
      role: "staff",
      status: "active",
      isDeleted: false,
    });

    // 7. Seed User with Suspended Staff Badge
    const [suspendedUser] = await connection
      .insert(users)
      .values({
        name: "Suspended Badge Staff",
        phoneNumber: suspendedStaffPhone,
        status: "active",
      })
      .returning();
    suspendedStaffUserId = suspendedUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: suspendedStaffUserId,
      role: "staff",
      status: "suspended",
      isDeleted: false,
    });

    // 8. Seed User with Soft-Deleted Staff Badge
    const [deletedBadgeUser] = await connection
      .insert(users)
      .values({
        name: "Deleted Badge Staff",
        phoneNumber: deletedStaffPhone,
        status: "active",
      })
      .returning();
    deletedStaffUserId = deletedBadgeUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: deletedStaffUserId,
      role: "staff",
      status: "active",
      isDeleted: true,
    });

    // 9. Seed User with No Staff Badge
    await connection
      .insert(users)
      .values({
        name: "Random Member User",
        phoneNumber: userWithoutBadgePhone,
        status: "active",
      });

    // 10. Seed Sample Members at Gym 1 & Gym 2 for RBAC/isolation tests
    await connection.insert(members).values({
      gymId: gym1Id,
      name: "Gym 1 Member",
      phoneNumber: "+251911001100",
      status: "active",
    });

    await connection.insert(members).values({
      gymId: gym2Id,
      name: "Gym 2 Member",
      phoneNumber: "+251922002200",
      status: "active",
    });
  });

  beforeEach(async () => {
    resetOtpRateLimitStore();
    smsSpy.mockClear();
    smsSpy.mockResolvedValue({
      ok: true,
      data: {
        messageId: "mock-sms-id-12345",
        to: activeStaffPhone,
      },
    });
    await connection.delete(verifications);
    await connection.delete(sessions);
  });

  afterAll(async () => {
    smsSpy.mockRestore();
    await cleanupDatabase();
  });

  // =========================================================================
  // SUITE 1: POST /api/v1/auth/otp/send
  // =========================================================================
  describe("POST /api/v1/auth/otp/send", () => {
    test("should reject request with HTTP 400 when gymId is missing", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: activeStaffPhone }),
      });

      expect(res.status).toBe(400);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should reject request with HTTP 400 when gymId is not a valid UUID", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: "invalid-uuid-123",
          phoneNumber: activeStaffPhone,
        }),
      });

      expect(res.status).toBe(400);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should reject request with HTTP 400 when phone number is missing", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymId: gym1Id }),
      });

      expect(res.status).toBe(400);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should reject request with HTTP 400 when phone is an invalid format or operator", async () => {
      const invalidPhones = ["0112233440", "12345", "+14155552671", "invalid"];

      for (const phone of invalidPhones) {
        const res = await app.request("/api/v1/auth/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gymId: gym1Id, phoneNumber: phone }),
        });

        expect(res.status).toBe(400);
        const body = await getJson(res);
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
      }
    });

    test("Happy Path: should accept local 09... number, normalize to +251..., dispatch SMS, and store HMAC in DB", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "196.188.2.1",
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffLocalPhone,
        }),
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);
      expect(body.data.message).toContain("OTP code has been sent");

      // Verify SMS was dispatched
      expect(smsSpy).toHaveBeenCalledTimes(1);

      // Verify DB verification record
      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeStaffPhone));

      expect(record).toBeDefined();
      expect(record.value.length).toBe(64); // 256-bit HMAC hex
      expect(record.attempt).toBe(0);
      expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test("Happy Path: should accept 'phone' alias key and Safaricom 07... number", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phone: "0711223344",
        }),
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);
      expect(smsSpy).toHaveBeenCalledTimes(1);

      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeCoachPhone));

      expect(record).toBeDefined();
    });

    test("Anti-Enumeration: should return generic 200 without sending SMS or storing OTP when user does NOT exist", async () => {
      const nonExistentPhone = "0999887766";
      const normalizedNonExistent = "+251999887766";

      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: nonExistentPhone,
        }),
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);
      expect(body.data.message).toContain("OTP code has been sent");

      // No SMS sent
      expect(smsSpy).toHaveBeenCalledTimes(0);

      // No row in verifications
      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, normalizedNonExistent));
      expect(record).toBeUndefined();
    });

    test("Anti-Enumeration: should return generic 200 without sending SMS when user exists but has no staff badge", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: userWithoutBadgePhone,
        }),
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);
      expect(smsSpy).toHaveBeenCalledTimes(0);

      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, userWithoutBadgePhone));
      expect(record).toBeUndefined();
    });

    test("Anti-Enumeration: should return generic 200 without sending SMS when staff badge is suspended", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: suspendedStaffPhone,
        }),
      });

      expect(res.status).toBe(200);
      expect(smsSpy).toHaveBeenCalledTimes(0);

      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, suspendedStaffPhone));
      expect(record).toBeUndefined();
    });

    test("Anti-Enumeration: should return generic 200 without sending SMS when staff badge is soft-deleted", async () => {
      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: deletedStaffPhone,
        }),
      });

      expect(res.status).toBe(200);
      expect(smsSpy).toHaveBeenCalledTimes(0);

      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, deletedStaffPhone));
      expect(record).toBeUndefined();
    });

    test("Rate Limiting: should trigger 429 OTP_COOLDOWN_ACTIVE on immediate second request for same phone", async () => {
      // 1st request -> 200
      const res1 = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "197.156.1.1",
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
        }),
      });
      expect(res1.status).toBe(200);

      // 2nd request immediately -> 429 Cooldown
      const res2 = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "197.156.1.1",
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
        }),
      });

      expect(res2.status).toBe(429);
      const body2 = await getJson(res2);
      expect(body2.ok).toBe(false);
      expect(body2.error.code).toBe("OTP_COOLDOWN_ACTIVE");
      expect(body2.error.retryAfter).toBeGreaterThan(0);
    });

    test("Rate Limiting: should trigger 429 TOO_MANY_REQUESTS_IP when IP exceeds 60 requests", async () => {
      const testIp = "10.0.0.50";

      // Dispatch 60 requests from distinct phone numbers
      for (let i = 1; i <= 60; i++) {
        const phone = `+25191100${i.toString().padStart(4, "0")}`;
        const res = await app.request("/api/v1/auth/otp/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": testIp,
          },
          body: JSON.stringify({
            gymId: gym1Id,
            phoneNumber: phone,
          }),
        });
        expect(res.status).toBe(200);
      }

      // 61st request from same IP -> 429 IP Flood
      const res61 = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: "+251911999999",
        }),
      });

      expect(res61.status).toBe(429);
      const body = await getJson(res61);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("TOO_MANY_REQUESTS_IP");
    });

    test("Gateway 502 Failure Cleanup: cleans up verification row if SMS dispatch fails", async () => {
      smsSpy.mockImplementationOnce(async () => ({
        ok: false,
        error: {
          code: "GATEWAY_ERROR",
          message: "SMS gateway service unavailable (502)",
        },
      }));

      const res = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
        }),
      });

      expect(res.status).toBe(502);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("GATEWAY_ERROR");

      // Verify orphan OTP record was deleted
      const [record] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeStaffPhone));
      expect(record).toBeUndefined();
    });
  });

  // =========================================================================
  // SUITE 2: POST /api/v1/auth/otp/verify
  // =========================================================================
  describe("POST /api/v1/auth/otp/verify", () => {
    test("should reject request with HTTP 400 when code is missing", async () => {
      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
        }),
      });

      expect(res.status).toBe(400);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should reject request with HTTP 400 when code is not 6 digits", async () => {
      const invalidCodes = ["12345", "1234567", "12a456", "abcdef"];

      for (const code of invalidCodes) {
        const res = await app.request("/api/v1/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gymId: gym1Id,
            phoneNumber: activeStaffPhone,
            code,
          }),
        });

        expect(res.status).toBe(400);
      }
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when user does NOT exist", async () => {
      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: "0999001122",
          code: "123456",
        }),
      });

      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toBe("Invalid or expired verification code");
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when user exists but has no gymStaff badge", async () => {
      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: userWithoutBadgePhone,
          code: "123456",
        }),
      });

      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when gymStaff badge is suspended", async () => {
      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: suspendedStaffPhone,
          code: "123456",
        }),
      });

      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when staff account is inactive or banned", async () => {
      for (const phone of [inactiveUserPhone, bannedUserPhone]) {
        const res = await app.request("/api/v1/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gymId: gym1Id,
            phoneNumber: phone,
            code: "123456",
          }),
        });

        expect(res.status).toBe(401);
        const body = await getJson(res);
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("UNAUTHORIZED");
      }
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when OTP row does not exist in DB", async () => {
      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: "123456",
        }),
      });

      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("Anti-Enumeration: returns generic 401 UNAUTHORIZED when OTP is expired", async () => {
      await connection.insert(verifications).values({
        identifier: activeStaffPhone,
        value: otp.hashOtp("123456"),
        expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        attempt: 0,
      });

      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: "123456",
        }),
      });

      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    test("Attempt Tracking & 5th Attempt Row Burn: burns OTP row and returns 401", async () => {
      const validCode = "777888";
      await connection.insert(verifications).values({
        identifier: activeStaffPhone,
        value: otp.hashOtp(validCode),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempt: 0,
      });

      // Failed attempts 1 through 4
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await app.request("/api/v1/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gymId: gym1Id,
            phoneNumber: activeStaffPhone,
            code: "000000", // Wrong code
          }),
        });

        expect(res.status).toBe(401);

        const [row] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeStaffPhone));
        expect(row).toBeDefined();
        expect(row.attempt).toBe(attempt);
      }

      // 5th failed attempt -> Burns row immediately
      const res5 = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: "000000",
        }),
      });

      expect(res5.status).toBe(401);

      // Verify row is completely deleted
      const [burnedRow] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeStaffPhone));
      expect(burnedRow).toBeUndefined();

      // Subsequent attempt with even the CORRECT code now fails with 401
      const resAfterBurn = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: validCode,
        }),
      });

      expect(resAfterBurn.status).toBe(401);
    });

    test("Happy Path: verifies OTP, burns row, updates phone_verified=true, records client metadata, returns token", async () => {
      const secretCode = "654321";
      await connection.insert(verifications).values({
        identifier: activeStaffPhone,
        value: otp.hashOtp(secretCode),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempt: 0,
      });

      const res = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "196.188.10.20",
          "user-agent": "GymMS-Tablet-App/1.0 (Android)",
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffLocalPhone,
          code: secretCode,
        }),
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);
      expect(body.data.token).toBeDefined();
      expect(body.data.token.length).toBe(64);
      expect(body.data.session.activeGymId).toBe(gym1Id);
      expect(body.data.user.id).toBe(activeStaffUserId);
      expect(body.data.user.name).toBe("Staff Abebe");

      // Verify OTP row was burned
      const [verificationRow] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeStaffPhone));
      expect(verificationRow).toBeUndefined();

      // Verify users.phoneNumberVerified was set to true
      const [userInDb] = await connection
        .select()
        .from(users)
        .where(eq(users.id, activeStaffUserId));
      expect(userInDb.phoneNumberVerified).toBe(true);

      // Verify session was inserted with client metadata
      const [sessionInDb] = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.token, body.data.token));
      expect(sessionInDb).toBeDefined();
      expect(sessionInDb.userId).toBe(activeStaffUserId);
      expect(sessionInDb.activeGymId).toBe(gym1Id);
      expect(sessionInDb.ipAddress).toBe("196.188.10.20");
      expect(sessionInDb.userAgent).toBe("GymMS-Tablet-App/1.0 (Android)");
    });
  });

  // =========================================================================
  // SUITE 3: Full End-to-End Authentication -> Protected API Request
  // =========================================================================
  describe("End-to-End Authentication Handoff to Protected Domain APIs", () => {
    test("Owner can log in via OTP and immediately use Bearer token on protected /api/v1/staff", async () => {
      // 1. Send OTP for Owner
      const sendRes = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: ownerLocalPhone,
        }),
      });
      expect(sendRes.status).toBe(200);

      // Retrieve the generated code from SMS spy
      expect(smsSpy).toHaveBeenCalled();
      const lastCallArgs = smsSpy.mock.calls[0];
      const smsBody = lastCallArgs[1] as string;
      const codeMatch = smsBody.match(/\b\d{6}\b/);
      expect(codeMatch).not.toBeNull();
      const receivedCode = codeMatch![0];

      // 2. Verify OTP and obtain Bearer token
      const verifyRes = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user-agent": "OwnerPortal/1.0",
        },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: ownerPhone,
          code: receivedCode,
        }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyBody = await getJson(verifyRes);
      const ownerBearerToken = verifyBody.data.token;
      expect(ownerBearerToken).toBeDefined();

      // 3. Make an authenticated request to owner-protected endpoint (GET /api/v1/staff)
      const protectedRes = await app.request("/api/v1/staff", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerBearerToken}`,
        },
      });

      expect(protectedRes.status).toBe(200);
      const staffListBody = await getJson(protectedRes);
      expect(staffListBody.ok).toBe(true);
      expect(Array.isArray(staffListBody.data)).toBe(true);

      // 4. Verify unauthenticated request to the same endpoint returns 401
      const unauthRes = await app.request("/api/v1/staff", {
        method: "GET",
      });
      expect(unauthRes.status).toBe(401);

      // 5. Verify request with fake token returns 401
      const fakeTokenRes = await app.request("/api/v1/staff", {
        method: "GET",
        headers: {
          Authorization: `Bearer fake-token-12345`,
        },
      });
      expect(fakeTokenRes.status).toBe(401);
    });

    test("Staff can log in via OTP, access /api/v1/members, but is FORBIDDEN on /api/v1/staff", async () => {
      // 1. Send OTP for Staff
      const sendRes = await app.request("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
        }),
      });
      expect(sendRes.status).toBe(200);

      const lastCallArgs = smsSpy.mock.calls[0];
      const smsBody = lastCallArgs[1] as string;
      const codeMatch = smsBody.match(/\b\d{6}\b/);
      expect(codeMatch).not.toBeNull();
      const receivedCode = codeMatch![0];

      // 2. Verify OTP
      const verifyRes = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: receivedCode,
        }),
      });
      expect(verifyRes.status).toBe(200);
      const staffToken = (await getJson(verifyRes)).data.token;

      // 3. Staff CAN access /api/v1/members (requires "owner" | "staff")
      const membersRes = await app.request("/api/v1/members", {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(membersRes.status).toBe(200);
      const membersBody = await getJson(membersRes);
      expect(membersBody.ok).toBe(true);

      // 4. Staff CANNOT access /api/v1/staff (strictly requires "owner") -> 403 FORBIDDEN
      const staffRes = await app.request("/api/v1/staff", {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(staffRes.status).toBe(403);
      const staffForbiddenBody = await getJson(staffRes);
      expect(staffForbiddenBody.ok).toBe(false);
      expect(staffForbiddenBody.error.code).toBe("FORBIDDEN");
    });

    test("Multi-Tenant Isolation: Staff logged into Gym 1 only receives Gym 1 members", async () => {
      // 1. Create a session for Gym 1 staff
      const secretCode = "333444";
      await connection.insert(verifications).values({
        identifier: activeStaffPhone,
        value: otp.hashOtp(secretCode),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempt: 0,
      });

      const verifyRes = await app.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymId: gym1Id,
          phoneNumber: activeStaffPhone,
          code: secretCode,
        }),
      });

      expect(verifyRes.status).toBe(200);
      const { data } = await getJson(verifyRes);
      const token = data.token;

      // 2. Fetch members list via Gym 1 session
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.ok).toBe(true);

      // All returned members must belong to Gym 1, none from Gym 2
      for (const member of body.data) {
        expect(member.gymId).toBe(gym1Id);
        expect(member.gymId).not.toBe(gym2Id);
      }
    });
  });
});
