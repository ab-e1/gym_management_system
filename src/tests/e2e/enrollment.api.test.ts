import { test, describe, expect, beforeAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  membershipPlans,
  memberships,
  payments,
  sessions,
  users,
} from "../../db/schema.ts";

describe("Enrollment API E2E Tests (/api/v1/enrollment)", () => {
  let gymId: string;
  let ownerId: string;
  let staffId: string;
  let memberId: string;
  let ownerToken: string;
  let staffToken: string;
  let memberToken: string;
  let planId: string;

  beforeAll(async () => {
    // 1. Wipe tables in reverse dependency order
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);

    // 2. Seed primary test Gym
    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "Enrollment E2E Gym",
        slug: "enrollment-e2e-gym-slug",
      })
      .returning();
    gymId = testGym.id;

    // 3. Seed Owner User & Session Token
    const [ownerUser] = await connection
      .insert(users)
      .values({
        gymId,
        name: "E2E Owner",
        phoneNumber: "+251911111111",
        role: "owner",
      })
      .returning();
    ownerId = ownerUser.id;

    const [ownerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerId,
        token: "e2e-owner-token-enrollment",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    ownerToken = ownerSession.token;

    // 4. Seed Staff User & Session Token
    const [staffUser] = await connection
      .insert(users)
      .values({
        gymId,
        name: "E2E Staff",
        phoneNumber: "+251922222222",
        role: "staff",
      })
      .returning();
    staffId = staffUser.id;

    const [staffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffId,
        token: "e2e-staff-token-enrollment",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    staffToken = staffSession.token;

    // 5. Seed Member User & Session Token
    const [memberUser] = await connection
      .insert(users)
      .values({
        gymId,
        name: "Existing Member",
        phoneNumber: "+251933333333",
        role: "member",
      })
      .returning();
    memberId = memberUser.id;

    const [memberSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: memberId,
        token: "e2e-member-token-enrollment",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    memberToken = memberSession.token;

    // 6. Seed active Membership Plan
    const [testPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "Monthly Standard Plan",
        duration: 30,
        price: 2500,
      })
      .returning();
    planId = testPlan.id;
  });

  describe("Authentication & Authorization Guardrails", () => {
    test("POST /api/v1/enrollment should return 401 UNAUTHORIZED if Authorization header is missing", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          userData: { name: "Test Member", phoneNumber: "0911555555" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(401);
      const unauthorizedResponseBody = (await response.json()) as any;
      expect(unauthorizedResponseBody.ok).toBe(false);
      expect(unauthorizedResponseBody.error.code).toBe("UN_AUTHORIZED");
    });

    test("POST /api/v1/enrollment should return 403 FORBIDDEN if requested by a member role user", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: { name: "Test Member", phoneNumber: "0911555555" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(403);
      const forbiddenResponseBody = (await response.json()) as any;
      expect(forbiddenResponseBody.ok).toBe(false);
      expect(forbiddenResponseBody.error.code).toBe("UN_AUTHORIZED");
    });
  });

  describe("Validation Errors", () => {
    test("POST /api/v1/enrollment should return 400 if body is empty", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const emptyPayloadError = (await response.json()) as any;
      expect(emptyPayloadError.ok).toBe(false);
      expect(emptyPayloadError.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("POST /api/v1/enrollment should return 400 if planId is not a valid UUID", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId: "not-a-valid-uuid",
          userData: { name: "Valid Name", phoneNumber: "0911555555" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(400);
      const invalidUuidError = (await response.json()) as any;
      expect(invalidUuidError.ok).toBe(false);
      expect(invalidUuidError.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("POST /api/v1/enrollment should return 400 if phoneNumber is invalid", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: { name: "Valid Name", phoneNumber: "123456" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(400);
      const invalidPhoneError = (await response.json()) as any;
      expect(invalidPhoneError.ok).toBe(false);
      expect(invalidPhoneError.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("POST /api/v1/enrollment should return 400 if paymentMethod is unsupported", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: { name: "Valid Name", phoneNumber: "0911555555" },
          paymentData: { paymentMethod: "bitcoin" },
        }),
      });

      expect(response.status).toBe(400);
      const unsupportedPaymentError = (await response.json()) as any;
      expect(unsupportedPaymentError.ok).toBe(false);
      expect(unsupportedPaymentError.error.code).toBe("INPUT_VALIDATION_ERROR");
    });
  });

  describe("Business Logic & Conflict Handlers", () => {
    test("POST /api/v1/enrollment should return 404 NOT_FOUND for non-existent plan UUID", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId: "00000000-0000-0000-0000-000000000000",
          userData: { name: "Abebe Bikila", phoneNumber: "0911555555" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(404);
      const planNotFoundError = (await response.json()) as any;
      expect(planNotFoundError.ok).toBe(false);
      expect(planNotFoundError.error.code).toBe("NOT_FOUND");
    });

    test("POST /api/v1/enrollment should return 409 CONFLICT if phoneNumber belongs to an existing member", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: { name: "Duplicate Phone Member", phoneNumber: "0933333333" },
          paymentData: { paymentMethod: "cash" },
        }),
      });

      expect(response.status).toBe(409);
      const phoneConflictError = (await response.json()) as any;
      expect(phoneConflictError.ok).toBe(false);
      expect(phoneConflictError.error.code).toBe("CONFLICT");
    });
  });

  describe("Successful Atomic Enrollment (201 CREATED)", () => {
    test("POST /api/v1/enrollment should atomically create member, membership, and payment (cash)", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: {
            name: "Dawit Walk-In Member",
            phoneNumber: "0944444444",
            email: "dawit.walkin@example.com",
          },
          paymentData: {
            paymentMethod: "cash",
          },
        }),
      });

      expect(response.status).toBe(201);
      const cashEnrollmentResult = (await response.json()) as any;
      expect(cashEnrollmentResult.ok).toBe(true);
      expect(cashEnrollmentResult.data.newMember).toBeDefined();
      expect(cashEnrollmentResult.data.newMember.name).toBe("Dawit Walk-In Member");
      expect(cashEnrollmentResult.data.newMember.phoneNumber).toBe("+251944444444");
      expect(cashEnrollmentResult.data.newMember.role).toBe("member");

      expect(cashEnrollmentResult.data.newMembership).toBeDefined();
      expect(cashEnrollmentResult.data.newMembership.planId).toBe(planId);
      expect(cashEnrollmentResult.data.newMembership.status).toBe("active");

      expect(cashEnrollmentResult.data.newMembershipPayment).toBeDefined();
      expect(cashEnrollmentResult.data.newMembershipPayment.amount).toBe(2500); // Auto-filled from plan price!
      expect(cashEnrollmentResult.data.newMembershipPayment.paymentMethod).toBe("cash");
      expect(cashEnrollmentResult.data.newMembershipPayment.recordedBy).toBe(staffId);
    });

    test("POST /api/v1/enrollment should succeed with digital payment (telebirr + referenceCode)", async () => {
      const response = await app.request("/api/v1/enrollment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          planId,
          userData: {
            name: "Marta Telebirr Member",
            phoneNumber: "0955555555",
          },
          paymentData: {
            paymentMethod: "telebirr",
            amount: 2500,
            referenceCode: "FT2610A87B92",
          },
        }),
      });

      expect(response.status).toBe(201);
      const digitalEnrollmentResult = (await response.json()) as any;
      expect(digitalEnrollmentResult.ok).toBe(true);
      expect(digitalEnrollmentResult.data.newMember.phoneNumber).toBe("+251955555555");
      expect(digitalEnrollmentResult.data.newMembershipPayment.paymentMethod).toBe("telebirr");
      expect(digitalEnrollmentResult.data.newMembershipPayment.referenceCode).toBe("FT2610A87B92");
      expect(digitalEnrollmentResult.data.newMembershipPayment.recordedBy).toBe(ownerId);
    });
  });
});
