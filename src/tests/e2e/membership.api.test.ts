import { test, describe, expect, beforeAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { gyms, membershipPlans, memberships, sessions, users } from "../../db/schema.ts";

describe("Membership API E2E Tests (/api/v1/membership)", () => {
  let gymId: string;
  let ownerId: string;
  let staffId: string;
  let memberId: string;
  let ownerToken: string;
  let staffToken: string;
  let memberToken: string;
  let planId: string;
  let createdMembershipId: string;

  beforeAll(async () => {
    // 1. Wipe tables in reverse dependency order
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);

    // 2. Seed primary test Gym
    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "Membership E2E Gym",
        slug: "membership-e2e-gym-slug",
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
        token: "e2e-owner-token-membership",
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
        token: "e2e-staff-token-membership",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    staffToken = staffSession.token;

    // 5. Seed Member User & Session Token
    const [memberUser] = await connection
      .insert(users)
      .values({
        gymId,
        name: "E2E Member",
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
        token: "e2e-member-token-membership",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    memberToken = memberSession.token;

    // 6. Seed Membership Plan
    const [testPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "Gold Monthly Pass",
        price: 3000,
        duration: 30,
      })
      .returning();
    planId = testPlan.id;
  });

  describe("Authentication & Authorization Guardrails", () => {
    test("POST /api/v1/membership should return 401 UNAUTHORIZED if Authorization header is missing", async () => {
      const response = await app.request("/api/v1/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, planId }),
      });

      expect(response.status).toBe(401);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("UN_AUTHORIZED");
    });

    test("POST /api/v1/membership should return 403 FORBIDDEN if requested by a member role user", async () => {
      const response = await app.request("/api/v1/membership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({ userId: memberId, planId }),
      });

      expect(response.status).toBe(403);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("UN_AUTHORIZED");
    });
  });

  describe("Validation Errors", () => {
    test("POST /api/v1/membership should return 400 BAD_REQUEST if body is missing required fields", async () => {
      const response = await app.request("/api/v1/membership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ userId: "invalid-uuid" }),
      });

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("GET /api/v1/membership should return 400 BAD_REQUEST if page query param is negative or zero", async () => {
      const response = await app.request("/api/v1/membership?page=0", {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(response.status).toBe(400);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
    });
  });

  describe("Successful Resource Lifecycle (CRUD)", () => {
    test("POST /api/v1/membership should create active membership successfully (201 CREATED)", async () => {
      const response = await app.request("/api/v1/membership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          userId: memberId,
          planId: planId,
        }),
      });

      expect(response.status).toBe(201);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.userId).toBe(memberId);
      expect(result.data.planId).toBe(planId);
      expect(result.data.status).toBe("active");

      createdMembershipId = result.data.id;
    });

    test("GET /api/v1/membership should return paginated memberships list (200 OK)", async () => {
      const response = await app.request("/api/v1/membership?page=1&limit=10", {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data[0].memberName).toBe("E2E Member");
      expect(result.data[0].planName).toBe("Gold Monthly Pass");
      expect(result.pagination.totalMemberships).toBeGreaterThanOrEqual(1);
    });

    test("GET /api/v1/membership/:id should return details for created membership (200 OK)", async () => {
      const response = await app.request(`/api/v1/membership/${createdMembershipId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.id).toBe(createdMembershipId);
      expect(result.data.memberName).toBe("E2E Member");
    });

    test("GET /api/v1/membership/:id should return 404 NOT_FOUND for non-existent ID", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await app.request(`/api/v1/membership/${nonExistentId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${staffToken}` },
      });

      expect(response.status).toBe(404);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
    });

    test("PATCH /api/v1/membership/:id should update status to cancelled (200 OK)", async () => {
      const response = await app.request(`/api/v1/membership/${createdMembershipId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.status).toBe("cancelled");
    });

    test("DELETE /api/v1/membership/:id should soft-delete membership (200 OK)", async () => {
      const response = await app.request(`/api/v1/membership/${createdMembershipId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.message).toBe("Membership soft-deleted successfully");
    });
  });
});
