import { test, describe, expect, beforeAll, afterAll } from "bun:test";

import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  gymStaff,
  members,
  memberships,
  payments,
  sessions,
  users,
} from "../../db/schema.ts";

describe("Staff API - End-to-End Test Suite", () => {
  // Gym 1 context
  let gymId: string;
  let ownerToken: string;
  let ownerId: string;
  let staffToken: string;
  let staffId: string;
  let staffUserId: string;
  let coachToken: string;
  let coachBadgeId: string;
  let suspendedOwnerToken: string;
  let noGymToken: string;
  let member1Id: string;

  // Gym 2 context (Multi-tenant isolation)
  let gym2Id: string;
  let gym2OwnerToken: string;

  beforeAll(async () => {
    // 1. Wipe tables cleanly before test lifecycle
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    // 2. Primary Test Gym (Gym 1)
    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "gym staff test",
        slug: "gym_staff_api_test",
      })
      .returning();
    gymId = testGym.id;

    // 3. Secondary Test Gym (Gym 2 - For multi-tenant boundary checks)
    const [testGym2] = await connection
      .insert(gyms)
      .values({
        name: "gym staff test branch 2",
        slug: "gym_staff_api_test_branch_2",
      })
      .returning();
    gym2Id = testGym2.id;

    // 4. Gym 1 Owner (Global user identity + gymStaff badge + session)
    const [testOwnerUser] = await connection
      .insert(users)
      .values({
        name: "api test owner",
        phoneNumber: "+251911991199",
      })
      .returning();
    ownerId = testOwnerUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: ownerId,
      role: "owner",
      status: "active",
    });

    const [testOwnerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerId,
        activeGymId: gymId,
        token: "test-owner-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = testOwnerSession.token;

    // 5. Gym 1 Staff (Global user identity + gymStaff badge + session)
    const [testStaffUser] = await connection
      .insert(users)
      .values({
        name: "api test staff",
        phoneNumber: "+251900990099",
      })
      .returning();
    staffUserId = testStaffUser.id;

    const [testStaffBadge] = await connection
      .insert(gymStaff)
      .values({
        gymId,
        userId: staffUserId,
        role: "staff",
        status: "active",
      })
      .returning();
    staffId = testStaffBadge.id;

    const [testStaffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffUserId,
        activeGymId: gymId,
        token: "test-staff-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = testStaffSession.token;

    // 6. Gym 1 Coach (Global user identity + gymStaff badge + session)
    const [testCoachUser] = await connection
      .insert(users)
      .values({
        name: "api test coach",
        phoneNumber: "+251933445566",
      })
      .returning();

    const [coachBadge] = await connection
      .insert(gymStaff)
      .values({
        gymId,
        userId: testCoachUser.id,
        role: "coach",
        status: "active",
      })
      .returning();
    coachBadgeId = coachBadge.id;

    const [testCoachSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testCoachUser.id,
        activeGymId: gymId,
        token: "test-coach-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    coachToken = testCoachSession.token;

    // 7. Suspended Operator in Gym 1
    const [suspendedUser] = await connection
      .insert(users)
      .values({
        name: "Suspended Owner",
        phoneNumber: "+251988776655",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId,
      userId: suspendedUser.id,
      role: "owner",
      status: "suspended",
    });

    const [suspendedSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: suspendedUser.id,
        activeGymId: gymId,
        token: "suspended-operator-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    suspendedOwnerToken = suspendedSession.token;

    // 8. Session with missing activeGymId
    const [noGymUser] = await connection
      .insert(users)
      .values({
        name: "No Gym User",
        phoneNumber: "+251966554433",
      })
      .returning();

    const [noGymSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: noGymUser.id,
        token: "no-gym-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    noGymToken = noGymSession.token;

    // 9. Gym 1 Customer CRM Member
    const [testMember1] = await connection
      .insert(members)
      .values({
        gymId,
        name: "api test member1",
        phoneNumber: "+251922002200",
        status: "active",
      })
      .returning();
    member1Id = testMember1.id;

    // 10. Gym 2 Owner
    const [gym2OwnerUser] = await connection
      .insert(users)
      .values({
        name: "Gym 2 Owner",
        phoneNumber: "+251944556677",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym2Id,
      userId: gym2OwnerUser.id,
      role: "owner",
      status: "active",
    });

    const [gym2OwnerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: gym2OwnerUser.id,
        activeGymId: gym2Id,
        token: "gym2-owner-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    gym2OwnerToken = gym2OwnerSession.token;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  describe("Authentication & RBAC Security Gates", () => {
    test("POST /api/v1/staff should fail with 401 if unauthorized (missing header)", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test staff 1",
          phoneNumber: "+251900990099",
        }),
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/staff should fail with 403 when called by staff role", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "new staff test",
          phoneNumber: "0911335577",
        }),
      });
      expect(res.status).toBe(403);
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
    });

    test("POST /api/v1/staff should fail with 403 when called by coach role", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${coachToken}`,
        },
        body: JSON.stringify({
          name: "random name",
          phoneNumber: "0922331100",
        }),
      });
      expect(res.status).toBe(403);
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
    });

    test("POST /api/v1/staff should fail with 403 when session has missing activeGymId", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${noGymToken}`,
        },
        body: JSON.stringify({
          name: "No Gym Attempt",
          phoneNumber: "0911442211",
        }),
      });
      expect(res.status).toBe(403);
    });

    test("POST /api/v1/staff should fail with 403 when badge is suspended", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${suspendedOwnerToken}`,
        },
        body: JSON.stringify({
          name: "Suspended Attempt",
          phoneNumber: "0911442211",
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/v1/staff (Create Staff)", () => {
    test("should fail with 400 when body fails Zod validation", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "",
          phoneNumber: "invalid-phone",
        }),
      });
      expect(res.status).toBe(400);
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should fail with 409 and return details when phone belongs to an active CRM member", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "Collision Trying Staff",
          phoneNumber: "0922002200", // member1's phone
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(409);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.details).toBeDefined();
      expect(result.error.details.memberId).toBe(member1Id);
    });

    test("should fail with 409 if phone number already belongs to an active staff", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "Duplicate Staff Try",
          phoneNumber: "+251900990099", // testStaff's phone
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(409);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("CONFLICT");
    });

    test("should pass with 201 when posted by owner with valid data and normalize phone", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "new valid staff",
          phoneNumber: "0911223300",
        }),
      });
      expect(res.status).toBe(201);
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.phoneNumber).toBe("+251911223300");
      expect(result.data.role).toBe("staff");
      expect(result.data.status).toBe("active");
    });
  });

  describe("GET /api/v1/staff (List Staff)", () => {
    test("should pass with 200 and return paginated list for owner", async () => {
      const res = await app.request("/api/v1/staff?page=1&limit=2", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.totalStaff).toBeGreaterThanOrEqual(2);
    });

    test("should filter results by search query", async () => {
      const res = await app.request("/api/v1/staff?search=valid%20staff", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data[0].name).toContain("valid staff");
    });

    test("should fail with 403 when accessed by staff role", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    test("should fail with 403 when accessed by coach role", async () => {
      const res = await app.request("/api/v1/staff", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${coachToken}`,
        },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/staff/:id (Get Staff Details)", () => {
    test("should pass with 200 when accessed by owner for valid staff ID", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.phoneNumber).toBe("+251900990099");
    });

    test("should pass with 200 when accessed by owner for coach role ID", async () => {
      const res = await app.request(`/api/v1/staff/${coachBadgeId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.role).toBe("coach");
    });

    test("should fail with 400 for malformed non-UUID ID", async () => {
      const res = await app.request("/api/v1/staff/invalid-id-not-uuid", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(400);
    });

    test("should fail with 404 when trying to access an owner ID", async () => {
      const res = await app.request(`/api/v1/staff/${ownerId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
    });

    test("should fail with 404 when trying to access a member ID", async () => {
      const res = await app.request(`/api/v1/staff/${member1Id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
    });

    test("should fail with 404 when Gym 2 owner attempts cross-tenant access to Gym 1 staff", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${gym2OwnerToken}`,
        },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/staff/:id (Update Staff)", () => {
    test("should pass with 200 when patched by owner", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "staff updated by owner",
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.name).toBe("staff updated by owner");
    });

    test("should fail with 400 for malformed non-UUID ID", async () => {
      const res = await app.request("/api/v1/staff/invalid-id-not-uuid", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "name attempt",
        }),
      });
      expect(res.status).toBe(400);
    });

    test("should fail with 403 when patched by staff role", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "staff trying self update",
        }),
      });
      expect(res.status).toBe(403);
    });

    test("should fail with 404 for non-existent staff ID", async () => {
      const res = await app.request(
        `/api/v1/staff/00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({
            name: "ghost staff update",
          }),
        },
      );
      expect(res.status).toBe(404);
    });

    test("should fail with 404 when Gym 2 owner attempts cross-tenant patch", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gym2OwnerToken}`,
        },
        body: JSON.stringify({
          name: "tamper attempt",
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/v1/staff/:id (Toggle Soft Delete)", () => {
    test("should soft delete staff when toggled by owner", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.message).toBe(
        "Staff member soft-deleted successfully",
      );
    });

    test("should recover soft-deleted staff on second toggle", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.message).toBe("Staff member recovered successfully");
    });

    test("should fail with 400 for malformed non-UUID ID", async () => {
      const res = await app.request("/api/v1/staff/not-a-valid-uuid", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(400);
    });

    test("should fail with 404 for non-existent staff ID", async () => {
      const res = await app.request(
        `/api/v1/staff/00000000-0000-0000-0000-000000000000`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
          },
        },
      );
      expect(res.status).toBe(404);
    });

    test("should fail with 404 when Gym 2 owner attempts cross-tenant delete", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${gym2OwnerToken}`,
        },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/staff/:id/promote & rehire (E2E)", () => {
    test("POST /api/v1/staff/:id/promote should fail with 403 when called by coach role", async () => {
      const res = await app.request(`/api/v1/staff/${member1Id}/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${coachToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    test("POST /api/v1/staff/:id/promote should fail with 400 for non-UUID member ID", async () => {
      const res = await app.request(`/api/v1/staff/invalid-id/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(400);
    });

    test("POST /api/v1/staff/:id/promote should fail with 404 for non-existent member ID", async () => {
      const res = await app.request(
        `/api/v1/staff/00000000-0000-0000-0000-000000000000/promote`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
          },
        },
      );
      expect(res.status).toBe(404);
    });

    test("POST /api/v1/staff/:id/promote should fail with 404 when Gym 2 owner attempts to promote Gym 1 member", async () => {
      const res = await app.request(`/api/v1/staff/${member1Id}/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gym2OwnerToken}`,
        },
      });
      expect(res.status).toBe(404);
    });

    test("POST /api/v1/staff/:id/promote should succeed with 200 when called by owner", async () => {
      const res = await app.request(`/api/v1/staff/${member1Id}/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.role).toBe("staff");
      expect(result.data.status).toBe("active");
      expect(result.data.isDeleted).toBe(false);
    });

    test("POST /api/v1/staff/:id/promote should fail with 409 CONFLICT if member already has active badge", async () => {
      const res = await app.request(`/api/v1/staff/${member1Id}/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(409);
    });

    test("POST /api/v1/staff/:id/rehire should fail with 403 when called by coach role", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}/rehire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${coachToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    test("soft-deleted staff session should be purged, rejecting requests with 401", async () => {
      const res = await app.request(`/api/v1/staff`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/staff/:id/rehire should fail with 400 for non-UUID staff ID", async () => {
      const res = await app.request(`/api/v1/staff/invalid-uuid/rehire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(400);
    });

    test("POST /api/v1/staff/:id/rehire should fail with 404 when staff member is currently active", async () => {
      // staffId is currently recovered/active
      const res = await app.request(`/api/v1/staff/${staffId}/rehire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(404);
    });

    test("POST /api/v1/staff/:id/rehire should succeed with 200 when called by owner for archived staff", async () => {
      // 1. First soft delete staff
      await app.request(`/api/v1/staff/${staffId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      // 2. Rehire archived staff
      const res = await app.request(`/api/v1/staff/${staffId}/rehire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.isDeleted).toBe(false);
      expect(result.data.status).toBe("active");
    });

    test("POST /api/v1/staff/:id/rehire should fail with 404 when Gym 2 owner attempts cross-tenant rehire", async () => {
      const res = await app.request(`/api/v1/staff/${staffId}/rehire`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gym2OwnerToken}`,
        },
      });
      expect(res.status).toBe(404);
    });
  });
});
