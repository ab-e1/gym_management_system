import { describe, test, expect, beforeEach, mock } from "bun:test";
import * as otp from "../../utils/otp.ts";

// Define mock data store and call trackers
let mockUsers: Array<{ id: string; phoneNumber: string }> = [];
let mockGymStaff: Array<{
  userId: string;
  gymId: string;
  status: string;
  isDeleted: boolean;
  role: string;
}> = [];
let mockVerifications: Array<{
  id?: string;
  identifier: string;
  value: string;
  expiresAt: Date;
}> = [];

let sendSmsMock = mock(async (phone: string, message: string) => {
  return {
    ok: true as const,
    data: { messageId: "msg-123", to: phone },
  };
});

// Mock Drizzle connection
const mockConnection = {
  select: (fields: any) => ({
    from: (table: any) => ({
      where: async (condition: any) => {
        // Distinguish between users query and gymStaff query
        if (fields && fields.id && !fields.role) {
          // Users query: returns matching users
          return mockUsers.map((u) => ({ id: u.id }));
        }
        if (fields && fields.role) {
          // GymStaff query
          return mockGymStaff.map((s) => ({
            id: s.userId,
            status: s.status,
            isDeleted: s.isDeleted,
            role: s.role,
          }));
        }
        return [];
      },
    }),
  }),
  delete: (table: any) => ({
    where: async (condition: any) => {
      mockVerifications = [];
      return [];
    },
  }),
  transaction: async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      delete: (table: any) => ({
        where: async (condition: any) => {
          mockVerifications = [];
          return [];
        },
      }),
      insert: (table: any) => ({
        values: async (vals: any) => {
          mockVerifications.push(vals);
          return [vals];
        },
      }),
    };
    return await callback(tx);
  },
};

mock.module("../../config/connection.ts", () => ({
  connection: mockConnection,
}));

mock.module("../../utils/sms.ts", () => ({
  sendSms: (phone: string, msg: string) => sendSmsMock(phone, msg),
}));

// Dynamic import of login.service to ensure mocks are active
const { sendOtp } = await import("../../services/auth/login.service.ts");

describe("Auth Service - sendOtp Unit & Security Suite", () => {
  const validGymId = "b9f93931-13cf-4c48-8df3-7e4521da6a5e";
  const validPhone = "+251911223344";
  const rawLocalPhone = "0911223344";
  const validUserId = "user-uuid-101";

  beforeEach(() => {
    mockUsers = [];
    mockGymStaff = [];
    mockVerifications = [];
    sendSmsMock = mock(async (phone: string, message: string) => {
      return {
        ok: true as const,
        data: { messageId: "msg-123", to: phone },
      };
    });
  });

  describe("1. Input Validation", () => {
    test("should fail with status 400 when gymId is missing", async () => {
      const res = await sendOtp("", validPhone);
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      if (!res.ok) {
        expect(res.error.code).toBe("NOT_VALID");
        expect(res.error.message).toContain("gymId and phone are required");
      }
      expect(sendSmsMock).not.toHaveBeenCalled();
    });

    test("should fail with status 400 when phone is missing", async () => {
      const res = await sendOtp(validGymId, "");
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      if (!res.ok) {
        expect(res.error.code).toBe("NOT_VALID");
      }
      expect(sendSmsMock).not.toHaveBeenCalled();
    });

    test("should fail with status 400 when phone is in an invalid format", async () => {
      const res = await sendOtp(validGymId, "invalid-phone-123");
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      if (!res.ok) {
        expect(res.error.code).toBe("NOT_VALID");
        expect(res.error.message).toContain("not of a supported format");
      }
      expect(sendSmsMock).not.toHaveBeenCalled();
    });
  });

  describe("2. Anti-Enumeration & Uniformity Protection", () => {
    test("should return generic 200 success without sending SMS when user does NOT exist", async () => {
      // mockUsers is empty
      const res = await sendOtp(validGymId, validPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      if (res.ok) {
        expect(res.data.message).toBe(
          "If an active staff account is registered with this phone number, an OTP code has been sent.",
        );
      }

      // Crucial security guarantees:
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(mockVerifications.length).toBe(0);
    });

    test("should return generic 200 success without sending SMS when user exists but has no gymStaff badge", async () => {
      mockUsers = [{ id: validUserId, phoneNumber: validPhone }];
      // mockGymStaff is empty (no badge for this gym)

      const res = await sendOtp(validGymId, validPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(mockVerifications.length).toBe(0);
    });

    test("should return generic 200 success without sending SMS when gymStaff badge is deleted", async () => {
      mockUsers = [{ id: validUserId, phoneNumber: validPhone }];
      mockGymStaff = [
        {
          userId: validUserId,
          gymId: validGymId,
          status: "active",
          isDeleted: true,
          role: "coach",
        },
      ];

      const res = await sendOtp(validGymId, validPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(mockVerifications.length).toBe(0);
    });

    test("should return generic 200 success without sending SMS when gymStaff badge status is not active (suspended)", async () => {
      mockUsers = [{ id: validUserId, phoneNumber: validPhone }];
      mockGymStaff = [
        {
          userId: validUserId,
          gymId: validGymId,
          status: "suspended",
          isDeleted: false,
          role: "coach",
        },
      ];

      const res = await sendOtp(validGymId, validPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(mockVerifications.length).toBe(0);
    });
  });

  describe("3. Happy Path - Active Staff Member", () => {
    beforeEach(() => {
      mockUsers = [{ id: validUserId, phoneNumber: validPhone }];
      mockGymStaff = [
        {
          userId: validUserId,
          gymId: validGymId,
          status: "active",
          isDeleted: false,
          role: "admin",
        },
      ];
    });

    test("should successfully generate OTP, persist HMAC hash, and dispatch SMS", async () => {
      const res = await sendOtp(validGymId, rawLocalPhone);

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      if (res.ok) {
        expect(res.data.message).toBe(
          "If an active staff account is registered with this phone number, an OTP code has been sent.",
        );
      }

      // Verify SMS was dispatched to normalized phone
      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      const [calledRecipient, calledMessage] = sendSmsMock.mock.calls[0];
      expect(calledRecipient).toBe(validPhone);
      expect(calledMessage).toContain("verification code is:");
      expect(calledMessage).toContain("GYM_Scale");
      expect(calledMessage).toContain("15 minutes");

      // Verify verification persistence
      expect(mockVerifications.length).toBe(1);
      const savedRecord = mockVerifications[0];
      expect(savedRecord.identifier).toBe(validPhone);

      // Verify that value is a 64-char HMAC-SHA256 hex digest, NOT plaintext
      expect(savedRecord.value.length).toBe(64);
      expect(savedRecord.value).not.toMatch(/^\d{6}$/);

      // Verify that the code in SMS verifies against the saved HMAC hash
      const codeMatch = calledMessage.match(/\b\d{6}\b/);
      expect(codeMatch).not.toBeNull();
      const extractedOtp = codeMatch![0];
      const isValid = otp.verifyOtp(extractedOtp, savedRecord.value);
      expect(isValid).toBe(true);

      // Verify dynamic expiration date (should be ~15 minutes in the future)
      const now = Date.now();
      const expireTime = savedRecord.expiresAt.getTime();
      expect(expireTime).toBeGreaterThan(now + 14 * 60 * 1000);
      expect(expireTime).toBeLessThanOrEqual(now + 16 * 60 * 1000);
    });

    test("should delete prior pending verification records for the phone before inserting new one", async () => {
      // Seed existing stale record
      mockVerifications = [
        {
          identifier: validPhone,
          value: "old-stale-hash",
          expiresAt: new Date(),
        },
      ];

      const res = await sendOtp(validGymId, validPhone);
      expect(res.ok).toBe(true);

      // Should have overwritten / cleared stale record
      expect(mockVerifications.length).toBe(1);
      expect(mockVerifications[0].value).not.toBe("old-stale-hash");
    });
  });

  describe("4. SMS Gateway Failure Handling", () => {
    beforeEach(() => {
      mockUsers = [{ id: validUserId, phoneNumber: validPhone }];
      mockGymStaff = [
        {
          userId: validUserId,
          gymId: validGymId,
          status: "active",
          isDeleted: false,
          role: "admin",
        },
      ];
    });

    test("should return 502 Bad Gateway when SMS dispatch fails", async () => {
      sendSmsMock = mock(async () => {
        return {
          ok: false as const,
          error: {
            code: "GATEWAY_ERROR",
            message: "AfroMessage upstream connection timeout",
          },
        };
      });

      const res = await sendOtp(validGymId, validPhone);

      expect(res.ok).toBe(false);
      expect(res.status).toBe(502);
      if (!res.ok) {
        expect(res.error.code).toBe("GATEWAY_ERROR");
        expect(res.error.message).toBe("AfroMessage upstream connection timeout");
      }
      // Verify orphaned verification row was burned on SMS failure
      expect(mockVerifications.length).toBe(0);
    });
  });
});
