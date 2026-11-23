import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  spyOn,
} from "bun:test";
import { connection } from "../../config/connection.ts";
import {
  users,
  gymStaff,
  gyms,
  verifications,
  sessions,
} from "../../db/schema.ts";
import { sendOtp, verifyOtp } from "../../services/auth/login.service.ts";
import { insertSession } from "../../services/auth/session.service.ts";
import { auth } from "../../config/auth.ts";
import * as smsModule from "../../utils/sms.ts";
import * as otp from "../../utils/otp.ts";
import { eq } from "drizzle-orm";

describe("Auth & Session Service Real Database Integration Suite", () => {
  // Test fixtures
  let gymId: string;
  let gym2Id: string;
  let activeUserId: string;
  let activeUserPhone = "+251911223344";

  let inactiveUserId: string;
  let inactiveUserPhone = "+251922334455";

  let bannedUserId: string;
  let bannedUserPhone = "+251933445566";

  let userWithoutBadgePhone = "+251944556677";

  let suspendedStaffUserId: string;
  let suspendedStaffPhone = "+251955667788";

  let deletedStaffUserId: string;
  let deletedStaffPhone = "+251966778899";

  let smsSpy: ReturnType<typeof spyOn>;

  const cleanupDatabase = async () => {
    await connection.delete(verifications);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  };

  beforeAll(async () => {
    smsSpy = spyOn(smsModule, "sendSms");
    await cleanupDatabase();

    // 1. Seed test gyms
    const [gym] = await connection
      .insert(gyms)
      .values({
        name: "Olympia Elite Fitness",
        slug: "olympia-elite-fitness",
        status: "active",
      })
      .returning();
    gymId = gym.id;

    const [otherGym] = await connection
      .insert(gyms)
      .values({
        name: "Secondary Branch Gym",
        slug: "secondary-branch-gym",
        status: "active",
      })
      .returning();
    gym2Id = otherGym.id;

    // 2. Seed active staff user
    const [activeUser] = await connection
      .insert(users)
      .values({
        name: "Abebe Bikila",
        phoneNumber: activeUserPhone,
        status: "active",
        phoneNumberVerified: false,
      })
      .returning();
    activeUserId = activeUser.id;

    await connection
      .insert(gymStaff)
      .values({
        gymId,
        userId: activeUserId,
        role: "coach",
        status: "active",
        isDeleted: false,
      });

    // 3. Seed inactive user
    const [inactiveUser] = await connection
      .insert(users)
      .values({
        name: "Inactive User",
        phoneNumber: inactiveUserPhone,
        status: "inactive",
      })
      .returning();
    inactiveUserId = inactiveUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: inactiveUserId,
      role: "staff",
      status: "active",
      isDeleted: false,
    });

    // 4. Seed banned user
    const [bannedUser] = await connection
      .insert(users)
      .values({
        name: "Banned User",
        phoneNumber: bannedUserPhone,
        status: "banned",
      })
      .returning();
    bannedUserId = bannedUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: bannedUserId,
      role: "staff",
      status: "active",
      isDeleted: false,
    });

    // 5. Seed user without gym staff badge
    await connection
      .insert(users)
      .values({
        name: "Orphan User",
        phoneNumber: userWithoutBadgePhone,
        status: "active",
      });

    // 6. Seed user with suspended gym badge
    const [suspUser] = await connection
      .insert(users)
      .values({
        name: "Suspended Coach",
        phoneNumber: suspendedStaffPhone,
        status: "active",
      })
      .returning();
    suspendedStaffUserId = suspUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: suspendedStaffUserId,
      role: "coach",
      status: "suspended",
      isDeleted: false,
    });

    // 7. Seed user with soft-deleted gym badge
    const [delUser] = await connection
      .insert(users)
      .values({
        name: "Deleted Staff",
        phoneNumber: deletedStaffPhone,
        status: "active",
      })
      .returning();
    deletedStaffUserId = delUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: deletedStaffUserId,
      role: "staff",
      status: "active",
      isDeleted: true,
    });
  });

  beforeEach(async () => {
    // Clean verifications and sessions before each test to maintain clean state
    await connection.delete(verifications);
    await connection.delete(sessions);

    // Reset SMS mock calls and implementation
    smsSpy.mockClear();
    smsSpy.mockResolvedValue({
      ok: true,
      data: {
        messageId: "mock-sms-id-12345",
        to: activeUserPhone,
      },
    });
  });

  afterAll(async () => {
    if (smsSpy) {
      smsSpy.mockRestore();
    }
    await cleanupDatabase();
  });

  // =========================================================================
  // SECTION 1: insertSession Service
  // =========================================================================
  describe("insertSession Service", () => {
    test("should generate 64-character hex token (256-bit entropy)", async () => {
      const { token, session } = await insertSession({
        userId: activeUserId,
        gymId,
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.token).toBe(token);
      expect(session.userId).toBe(activeUserId);
      expect(session.activeGymId).toBe(gymId);

      // Verify row exists in PostgreSQL
      const [dbSession] = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.id, session.id));

      expect(dbSession).toBeDefined();
      expect(dbSession.token).toBe(token);
      expect(dbSession.userId).toBe(activeUserId);
      expect(dbSession.activeGymId).toBe(gymId);
    });

    test("should set expiration to approximately 30 days in the future", async () => {
      const beforeNow = Date.now();
      const { session } = await insertSession({
        userId: activeUserId,
        gymId,
      });
      const afterNow = Date.now();

      const expectedTtlMs = 60 * 60 * 24 * 30 * 1000; // 30 days
      const sessionExpiryMs = new Date(session.expiresAt).getTime();

      expect(sessionExpiryMs).toBeGreaterThanOrEqual(
        beforeNow + expectedTtlMs - 2000,
      );
      expect(sessionExpiryMs).toBeLessThanOrEqual(
        afterNow + expectedTtlMs + 2000,
      );
    });

    test("should store optional ipAddress and userAgent client metadata", async () => {
      const clientIp = "197.156.104.22";
      const clientUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

      const { session } = await insertSession({
        userId: activeUserId,
        gymId,
        ipAddress: clientIp,
        userAgent: clientUa,
      });

      expect(session.ipAddress).toBe(clientIp);
      expect(session.userAgent).toBe(clientUa);

      const [dbSession] = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.id, session.id));

      expect(dbSession.ipAddress).toBe(clientIp);
      expect(dbSession.userAgent).toBe(clientUa);
    });

    test("should work seamlessly standalone and inside an active transaction (tx)", async () => {
      // 1. Standalone
      const standaloneResult = await insertSession({
        userId: activeUserId,
        gymId,
      });
      expect(standaloneResult.session.id).toBeDefined();

      // 2. Transaction
      const txResult = await connection.transaction(async (tx) => {
        return await insertSession(
          {
            userId: activeUserId,
            gymId: gym2Id,
          },
          tx,
        );
      });
      expect(txResult.session.id).toBeDefined();
      expect(txResult.session.activeGymId).toBe(gym2Id);

      // Verify both sessions persist in DB
      const allSessions = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.userId, activeUserId));

      const foundIds = allSessions.map((s) => s.id);
      expect(foundIds).toContain(standaloneResult.session.id);
      expect(foundIds).toContain(txResult.session.id);
    });

    test("should rollback session insertion when surrounding transaction fails", async () => {
      let rolledBackToken = "";

      try {
        await connection.transaction(async (tx) => {
          const res = await insertSession({ userId: activeUserId, gymId }, tx);
          rolledBackToken = res.token;
          throw new Error("Simulated transaction rollback");
        });
      } catch (err: any) {
        expect(err.message).toBe("Simulated transaction rollback");
      }

      // Assert session was rolled back in PostgreSQL
      expect(rolledBackToken).not.toBe("");
      const [abortedSession] = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.token, rolledBackToken));

      expect(abortedSession).toBeUndefined();
    });

    test("should throw an error when userId is missing", async () => {
      expect(
        insertSession({
          userId: "",
          gymId,
        }),
      ).rejects.toThrow("userId is a required field for session creation");
    });
  });

  // =========================================================================
  // SECTION 2: sendOtp Service (Real DB & Gateway Flow)
  // =========================================================================
  describe("sendOtp Service", () => {
    test("should fail with status 400 when gymId or phone is missing or invalid", async () => {
      // Missing gymId
      const res1 = await sendOtp("", activeUserPhone);
      expect(res1.ok).toBe(false);
      expect(res1.status).toBe(400);

      // Missing phone
      const res2 = await sendOtp(gymId, "");
      expect(res2.ok).toBe(false);
      expect(res2.status).toBe(400);

      // Invalid phone format
      const res3 = await sendOtp(gymId, "not-a-valid-ethiopian-number");
      expect(res3.ok).toBe(false);
      expect(res3.status).toBe(400);
      if (!res3.ok) {
        expect(res3.error.message).toContain(
          "phone is not of a supported format",
        );
      }

      expect(smsSpy).not.toHaveBeenCalled();
    });

    test("should successfully generate OTP, persist HMAC digest, and dispatch SMS for active staff", async () => {
      // Pass local format: 0911223344 -> normalizes to +251911223344
      const localPhone = "0911223344";
      const res = await sendOtp(gymId, localPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      if (res.ok) {
        expect(res.data.message).toBe(
          "If an active staff account is registered with this phone number, an OTP code has been sent.",
        );
      }

      // Verify SMS dispatch call
      expect(smsSpy).toHaveBeenCalledTimes(1);
      const [calledPhone, calledMsg] = smsSpy.mock.calls[0];
      expect(calledPhone).toBe(activeUserPhone);
      expect(calledMsg).toContain("GYM_Scale");
      expect(calledMsg).toContain("verification code is:");

      // Extract 6-digit OTP code from SMS message
      const codeMatch = calledMsg.match(/\b\d{6}\b/);
      expect(codeMatch).not.toBeNull();
      const plainOtp = codeMatch![0];

      // Check PostgreSQL verifications table
      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeUserPhone));

      expect(dbVerification).toBeDefined();
      expect(dbVerification.identifier).toBe(activeUserPhone);
      expect(dbVerification.attempt).toBe(0);

      // Hash must be 64-char hex (HMAC-SHA256), NOT plaintext
      expect(dbVerification.value.length).toBe(64);
      expect(dbVerification.value).not.toBe(plainOtp);

      // Cryptographic verification against stored hash
      const isOtpValid = otp.verifyOtp(plainOtp, dbVerification.value);
      expect(isOtpValid).toBe(true);

      // Verify dynamic expiration date (15 minutes in future)
      const now = Date.now();
      const expiresAtMs = new Date(dbVerification.expiresAt).getTime();
      expect(expiresAtMs).toBeGreaterThan(now + 14 * 60 * 1000);
      expect(expiresAtMs).toBeLessThanOrEqual(now + 16 * 60 * 1000);
    });

    test("should delete prior pending verification records before persisting a new one", async () => {
      // 1. Seed stale record
      const staleHash = otp.hashOtp("111111");
      await connection.insert(verifications).values({
        identifier: activeUserPhone,
        value: staleHash,
        attempt: 3,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 2. Call sendOtp
      const res = await sendOtp(gymId, activeUserPhone);
      expect(res.ok).toBe(true);

      // 3. Only 1 verification row should exist with fresh hash and attempt reset to 0
      const allRows = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeUserPhone));

      expect(allRows.length).toBe(1);
      expect(allRows[0].value).not.toBe(staleHash);
      expect(allRows[0].attempt).toBe(0);
    });

    test("Anti-enumeration: should return generic 200 without sending SMS or storing OTP when user does NOT exist", async () => {
      const nonExistentPhone = "+251911999999";
      const res = await sendOtp(gymId, nonExistentPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);

      expect(smsSpy).not.toHaveBeenCalled();

      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, nonExistentPhone));
      expect(dbVerification).toBeUndefined();
    });

    test("Anti-enumeration: should return generic 200 without sending SMS when user exists but has no gym staff badge", async () => {
      const res = await sendOtp(gymId, userWithoutBadgePhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(smsSpy).not.toHaveBeenCalled();

      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, userWithoutBadgePhone));
      expect(dbVerification).toBeUndefined();
    });

    test("Anti-enumeration: should return generic 200 without sending SMS when staff badge is suspended", async () => {
      const res = await sendOtp(gymId, suspendedStaffPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(smsSpy).not.toHaveBeenCalled();

      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, suspendedStaffPhone));
      expect(dbVerification).toBeUndefined();
    });

    test("Anti-enumeration: should return generic 200 without sending SMS when staff badge is soft-deleted", async () => {
      const res = await sendOtp(gymId, deletedStaffPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(smsSpy).not.toHaveBeenCalled();

      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, deletedStaffPhone));
      expect(dbVerification).toBeUndefined();
    });

    test("Orphan OTP Cleanup: should delete inserted verification row and return 502 when SMS gateway fails", async () => {
      smsSpy.mockResolvedValueOnce({
        ok: false,
        error: {
          code: "GATEWAY_ERROR",
          message: "AfroMessage upstream gateway connection timeout",
        },
      });

      const res = await sendOtp(gymId, activeUserPhone);

      expect(res.ok).toBe(false);
      expect(res.status).toBe(502);
      if (!res.ok) {
        expect(res.error.code).toBe("GATEWAY_ERROR");
        expect(res.error.message).toBe(
          "AfroMessage upstream gateway connection timeout",
        );
      }

      // Crucial security invariant: No orphan OTP remains in PostgreSQL
      const [dbVerification] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeUserPhone));

      expect(dbVerification).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 3: verifyOtp Service (Full Lifecycle, Concurrency & Rate Limiting)
  // =========================================================================
  describe("verifyOtp Service", () => {
    const validTestCode = "654321";
    const hashedValidCode = otp.hashOtp(validTestCode);

    beforeEach(async () => {
      // Ensure phone is unverified before each verification test
      await connection
        .update(users)
        .set({ phoneNumberVerified: false })
        .where(eq(users.id, activeUserId));

      // Seed fresh valid verification record
      await connection.insert(verifications).values({
        identifier: activeUserPhone,
        value: hashedValidCode,
        attempt: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
    });

    test("should fail with status 400 when code, gymId, or phone is missing or invalid", async () => {
      const r1 = await verifyOtp("", validTestCode, activeUserPhone);
      expect(r1.ok).toBe(false);
      expect(r1.status).toBe(400);

      const r2 = await verifyOtp(gymId, "", activeUserPhone);
      expect(r2.ok).toBe(false);
      expect(r2.status).toBe(400);

      const r3 = await verifyOtp(gymId, validTestCode, "");
      expect(r3.ok).toBe(false);
      expect(r3.status).toBe(400);

      const r4 = await verifyOtp(gymId, validTestCode, "invalid-phone");
      expect(r4.ok).toBe(false);
      expect(r4.status).toBe(400);
      if (!r4.ok) {
        expect(r4.error.message).toContain(
          "phone is not of a supported format",
        );
      }
    });

    test("Happy Path: should verify correct OTP, burn OTP, update phoneNumberVerified = true, and create session", async () => {
      const res = await verifyOtp(gymId, validTestCode, activeUserPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      if (res.ok) {
        expect(res.data.message).toBe("logging you in");
        expect(res.data.user.id).toBe(activeUserId);
        expect(res.data.token).toBeDefined();
        expect(res.data.token.length).toBe(64);
        expect(res.data.session.id).toBeDefined();
        expect(res.data.session.activeGymId).toBe(gymId);
      }

      // 1. Invariant: OTP row in verifications table is BURNED (deleted)
      const [burnedOtp] = await connection
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, activeUserPhone));
      expect(burnedOtp).toBeUndefined();

      // 2. Invariant: users.phoneNumberVerified is set to true
      const [updatedUser] = await connection
        .select()
        .from(users)
        .where(eq(users.id, activeUserId));
      expect(updatedUser.phoneNumberVerified).toBe(true);

      // 3. Invariant: Session is persisted in PostgreSQL
      if (res.ok) {
        const [savedSession] = await connection
          .select()
          .from(sessions)
          .where(eq(sessions.id, res.data.session.id));

        expect(savedSession).toBeDefined();
        expect(savedSession.token).toBe(res.data.token);
        expect(savedSession.userId).toBe(activeUserId);
        expect(savedSession.activeGymId).toBe(gymId);
      }
    });

    test("Client Metadata: should accept optional ipAddress and userAgent and record in session", async () => {
      const clientInfo = {
        ipAddress: "196.188.241.10",
        userAgent: "GymManagementTablet/2.4 (Android 14)",
      };

      const res = await verifyOtp(
        gymId,
        validTestCode,
        activeUserPhone,
        clientInfo,
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        const [savedSession] = await connection
          .select()
          .from(sessions)
          .where(eq(sessions.id, res.data.session.id));

        expect(savedSession.ipAddress).toBe(clientInfo.ipAddress);
        expect(savedSession.userAgent).toBe(clientInfo.userAgent);
      }
    });

    describe("Anti-Enumeration & Uniform 401 Unauthorized Responses", () => {
      test("should return generic 401 UNAUTHORIZED when user does not exist", async () => {
        const res = await verifyOtp(gymId, validTestCode, "+251911999999");

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
          expect(res.error.message).toBe(
            "Invalid or expired verification code",
          );
        }
      });

      test("should return generic 401 UNAUTHORIZED when user exists but has no gymStaff badge", async () => {
        const res = await verifyOtp(
          gymId,
          validTestCode,
          userWithoutBadgePhone,
        );

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
          expect(res.error.message).toBe(
            "Invalid or expired verification code",
          );
        }
      });

      test("should return generic 401 UNAUTHORIZED when gymStaff badge is suspended", async () => {
        const res = await verifyOtp(gymId, validTestCode, suspendedStaffPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
          expect(res.error.message).toBe(
            "Invalid or expired verification code",
          );
        }
      });

      test("should return generic 401 UNAUTHORIZED when gymStaff badge is soft-deleted", async () => {
        const res = await verifyOtp(gymId, validTestCode, deletedStaffPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
        }
      });

      test("should return generic 401 UNAUTHORIZED when user account is inactive", async () => {
        const res = await verifyOtp(gymId, validTestCode, inactiveUserPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
        }
      });

      test("should return generic 401 UNAUTHORIZED when user account is banned", async () => {
        const res = await verifyOtp(gymId, validTestCode, bannedUserPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
        }
      });

      test("should return generic 401 UNAUTHORIZED when verification row does not exist", async () => {
        await connection.delete(verifications);

        const res = await verifyOtp(gymId, validTestCode, activeUserPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
        }
      });

      test("should return generic 401 UNAUTHORIZED when OTP is expired", async () => {
        // Expired 5 minutes ago
        await connection
          .update(verifications)
          .set({ expiresAt: new Date(Date.now() - 5 * 60 * 1000) })
          .where(eq(verifications.identifier, activeUserPhone));

        const res = await verifyOtp(gymId, validTestCode, activeUserPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
          expect(res.error.message).toBe(
            "Invalid or expired verification code",
          );
        }
      });
    });

    describe("Attempt Counter and Brute-Force Rate Limiting (5 Attempts Max)", () => {
      test("should increment attempt counter on wrong code and burn OTP on 5th failure", async () => {
        const wrongCode = "999999";

        // Attempt 1: wrong code -> attempt becomes 1
        const r1 = await verifyOtp(gymId, wrongCode, activeUserPhone);
        expect(r1.ok).toBe(false);
        expect(r1.status).toBe(401);
        let [row1] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(row1).toBeDefined();
        expect(row1.attempt).toBe(1);

        // Attempt 2: wrong code -> attempt becomes 2
        const r2 = await verifyOtp(gymId, wrongCode, activeUserPhone);
        expect(r2.ok).toBe(false);
        expect(r2.status).toBe(401);
        let [row2] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(row2.attempt).toBe(2);

        // Attempt 3: wrong code -> attempt becomes 3
        const r3 = await verifyOtp(gymId, wrongCode, activeUserPhone);
        expect(r3.ok).toBe(false);
        expect(r3.status).toBe(401);
        let [row3] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(row3.attempt).toBe(3);

        // Attempt 4: wrong code -> attempt becomes 4
        const r4 = await verifyOtp(gymId, wrongCode, activeUserPhone);
        expect(r4.ok).toBe(false);
        expect(r4.status).toBe(401);
        let [row4] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(row4.attempt).toBe(4);

        // Attempt 5: wrong code -> BURNS OTP immediately and returns uniform 401 UNAUTHORIZED
        const r5 = await verifyOtp(gymId, wrongCode, activeUserPhone);
        expect(r5.ok).toBe(false);
        expect(r5.status).toBe(401);
        if (!r5.ok) {
          expect(r5.error.code).toBe("UNAUTHORIZED");
          expect(r5.error.message).toBe("Invalid or expired verification code");
        }

        // OTP row must be completely DELETED from PostgreSQL
        const [row5] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(row5).toBeUndefined();

        // Subsequent attempt (6th): row is gone, still uniform 401
        const r6 = await verifyOtp(gymId, validTestCode, activeUserPhone);
        expect(r6.ok).toBe(false);
        expect(r6.status).toBe(401);
      });

      test("should immediately burn row and return 401 if attempt is already >= 5 in DB", async () => {
        // Seed row with attempt = 5
        await connection
          .update(verifications)
          .set({ attempt: 5 })
          .where(eq(verifications.identifier, activeUserPhone));

        // Even with the correct code, attempt >= 5 must burn row and reject with 401
        const res = await verifyOtp(gymId, validTestCode, activeUserPhone);

        expect(res.ok).toBe(false);
        expect(res.status).toBe(401);
        if (!res.ok) {
          expect(res.error.code).toBe("UNAUTHORIZED");
        }

        const [burnedRow] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(burnedRow).toBeUndefined();
      });

      test("Concurrency: should safely serialize concurrent failed attempts with row-level locking", async () => {
        // Send 5 concurrent wrong verification requests simultaneously
        const promises = Array.from({ length: 5 }, () =>
          verifyOtp(gymId, "000000", activeUserPhone),
        );

        const results = await Promise.all(promises);

        // Every single request must return 401 UNAUTHORIZED
        for (const res of results) {
          expect(res.ok).toBe(false);
          expect(res.status).toBe(401);
          if (!res.ok) {
            expect(res.error.code).toBe("UNAUTHORIZED");
          }
        }

        // The verification row must be burned cleanly in PostgreSQL without deadlocks or race conditions
        const [remainingVerification] = await connection
          .select()
          .from(verifications)
          .where(eq(verifications.identifier, activeUserPhone));
        expect(remainingVerification).toBeUndefined();
      });
    });
  });

  // =========================================================================
  // SECTION 4: Better Auth Session & Bearer Token Middleware Integration
  // =========================================================================
  describe("Better Auth Session & Bearer Token Integration", () => {
    test("auth.api.getSession should successfully validate token issued by verifyOtp", async () => {
      // 1. Seed fresh verification
      const loginCode = "123456";
      await connection.insert(verifications).values({
        identifier: activeUserPhone,
        value: otp.hashOtp(loginCode),
        attempt: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // 2. Perform verifyOtp login
      const loginResult = await verifyOtp(gymId, loginCode, activeUserPhone, {
        ipAddress: "10.10.10.1",
        userAgent: "AutomatedIntegrationTest/1.0",
      });

      expect(loginResult.ok).toBe(true);
      if (!loginResult.ok) return;

      const { token } = loginResult.data;
      expect(token).toBeDefined();

      // 3. Call Better Auth getSession with Bearer token header
      const authSessionResponse = await auth.api.getSession({
        headers: new Headers({
          authorization: `Bearer ${token}`,
        }),
      });

      expect(authSessionResponse).not.toBeNull();
      if (!authSessionResponse) return;

      const { session, user } = authSessionResponse;

      // Assert user details
      expect(user).toBeDefined();
      expect(user.id).toBe(activeUserId);
      expect(user.phoneNumber).toBe(activeUserPhone);
      expect(user.phoneNumberVerified).toBe(true);
      expect(user.status).toBe("active");

      // Assert session details
      expect(session).toBeDefined();
      expect(session.userId).toBe(activeUserId);
      expect(session.token).toBe(token);
      expect((session as any).activeGymId).toBe(gymId);

      // Verify expiration is in the future
      const sessionExpiry = new Date(session.expiresAt).getTime();
      expect(sessionExpiry).toBeGreaterThan(Date.now());
    });

    test("auth.api.getSession should accept plain object headers ({ authorization: `Bearer ...` })", async () => {
      const { session } = await insertSession({
        userId: activeUserId,
        gymId,
      });

      const authSessionResponse = await auth.api.getSession({
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });

      expect(authSessionResponse).not.toBeNull();
      if (authSessionResponse) {
        expect(authSessionResponse.session.userId).toBe(activeUserId);
        expect((authSessionResponse.session as any).activeGymId).toBe(gymId);
      }
    });

    test("auth.api.getSession should return null when authorization header is completely missing", async () => {
      const authSessionResponse = await auth.api.getSession({
        headers: {},
      });
      expect(authSessionResponse).toBeNull();
    });

    test("Multi-tenant gym isolation: verifies correct activeGymId per gym login", async () => {
      // Add active staff badge for activeUser in gym2 as well
      await connection.insert(gymStaff).values({
        gymId: gym2Id,
        userId: activeUserId,
        role: "admin",
        status: "active",
        isDeleted: false,
      });

      const loginCode = "889900";
      await connection.insert(verifications).values({
        identifier: activeUserPhone,
        value: otp.hashOtp(loginCode),
        attempt: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Login targeting gym2
      const resGym2 = await verifyOtp(gym2Id, loginCode, activeUserPhone);
      expect(resGym2.ok).toBe(true);
      if (resGym2.ok) {
        expect(resGym2.data.session.activeGymId).toBe(gym2Id);

        // Verify Better Auth session reflects gym2
        const betterAuthRes = await auth.api.getSession({
          headers: { authorization: `Bearer ${resGym2.data.token}` },
        });
        expect(betterAuthRes).not.toBeNull();
        if (betterAuthRes) {
          expect((betterAuthRes.session as any).activeGymId).toBe(gym2Id);
        }
      }
    });

    test("auth.api.getSession should reject invalid or expired tokens", async () => {
      // Fake non-existent token
      const fakeToken =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const invalidRes = await auth.api.getSession({
        headers: new Headers({
          authorization: `Bearer ${fakeToken}`,
        }),
      });

      expect(invalidRes).toBeNull();
    });

    test("auth.api.getSession should return null when session is revoked/deleted from database", async () => {
      const { session } = await insertSession({
        userId: activeUserId,
        gymId,
      });

      // Confirm valid session initially
      const initialRes = await auth.api.getSession({
        headers: new Headers({
          authorization: `Bearer ${session.token}`,
        }),
      });
      expect(initialRes).not.toBeNull();

      // Revoke / delete session
      await connection.delete(sessions).where(eq(sessions.id, session.id));

      // Confirm Better Auth returns null
      const revokedRes = await auth.api.getSession({
        headers: new Headers({
          authorization: `Bearer ${session.token}`,
        }),
      });
      expect(revokedRes).toBeNull();
    });
  });
});
