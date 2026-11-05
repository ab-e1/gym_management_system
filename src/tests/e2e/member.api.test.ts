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

describe("Member API - End-to-End Test Suite", () => {
  // Gym 1 context
  let gymId: string;
  let ownerToken: string;
  let ownerId: string;
  let staffToken: string;
  let staffId: string;
  let unauthorizedToken: string; // Coach badge
  let suspendedStaffToken: string;
  let noGymToken: string;
  let activeMemberId: string;

  // Gym 2 context (Multi-tenant isolation)
  let gym2Id: string;
  let gym2StaffToken: string;
  let gym2MemberId: string;

  beforeAll(async () => {
    // Clean database before test run
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    // 1. Primary Test Gym (Gym 1)
    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "Gym Member E2E Test Center",
        slug: "gym_member_e2e_test_center",
      })
      .returning();
    gymId = testGym.id;

    // 2. Secondary Test Gym (Gym 2 - For multi-tenant boundary validation)
    const [testGym2] = await connection
      .insert(gyms)
      .values({
        name: "Gym Member Second Branch",
        slug: "gym_member_second_branch",
      })
      .returning();
    gym2Id = testGym2.id;

    // 3. Gym 1 Owner (Global user identity + gymStaff badge + session)
    const [gymOwner] = await connection
      .insert(users)
      .values({
        name: "Owner Fitsum",
        phoneNumber: "+251911991199",
      })
      .returning();
    ownerId = gymOwner.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: ownerId,
      role: "owner",
      status: "active",
    });

    const [ownerSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerId,
        activeGymId: gymId,
        token: "e2e-owner-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = ownerSessionRecord.token;

    // 4. Gym 1 Staff (Global user identity + gymStaff badge + session)
    const [gymStaffUser] = await connection
      .insert(users)
      .values({
        name: "Staff Aster",
        phoneNumber: "+251900990099",
      })
      .returning();
    staffId = gymStaffUser.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: staffId,
      role: "staff",
      status: "active",
    });

    const [staffSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffId,
        activeGymId: gymId,
        token: "e2e-staff-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = staffSessionRecord.token;

    // 5. Gym 1 Coach (Role coach - restricted from member management routes)
    const [coachUser] = await connection
      .insert(users)
      .values({
        name: "Coach Dawit",
        phoneNumber: "+251933445566",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId,
      userId: coachUser.id,
      role: "coach",
      status: "active",
    });

    const [coachSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: coachUser.id,
        activeGymId: gymId,
        token: "e2e-unauthorized-coach-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    unauthorizedToken = coachSessionRecord.token;

    // 6. Gym 1 Suspended Staff (Badge status is suspended)
    const [suspendedUser] = await connection
      .insert(users)
      .values({
        name: "Suspended Staff",
        phoneNumber: "+251955667788",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId,
      userId: suspendedUser.id,
      role: "staff",
      status: "suspended",
    });

    const [suspendedSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: suspendedUser.id,
        activeGymId: gymId,
        token: "e2e-suspended-staff-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    suspendedStaffToken = suspendedSessionRecord.token;

    // 7. Global User with No Active Gym in session
    const [noGymUser] = await connection
      .insert(users)
      .values({
        name: "User Without Gym",
        phoneNumber: "+251966778899",
      })
      .returning();

    const [noGymSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: noGymUser.id,
        activeGymId: null,
        token: "e2e-no-gym-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    noGymToken = noGymSessionRecord.token;

    // 8. Gym 2 Staff (For cross-tenant testing)
    const [gym2StaffUser] = await connection
      .insert(users)
      .values({
        name: "Gym2 Staff Daniel",
        phoneNumber: "+251977889900",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym2Id,
      userId: gym2StaffUser.id,
      role: "staff",
      status: "active",
    });

    const [gym2StaffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: gym2StaffUser.id,
        activeGymId: gym2Id,
        token: "e2e-gym2-staff-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    gym2StaffToken = gym2StaffSession.token;

    // 9. Existing Member in Gym 1 (Customer CRM table)
    const [existingMember] = await connection
      .insert(members)
      .values({
        name: "Member Almaz",
        gymId,
        phoneNumber: "+251922002200",
      })
      .returning();
    activeMemberId = existingMember.id;

    // 10. Existing Member in Gym 2 (Customer CRM table)
    const [existingGym2Member] = await connection
      .insert(members)
      .values({
        name: "Member Sara Gym2",
        gymId: gym2Id,
        phoneNumber: "+251988112233",
      })
      .returning();
    gym2MemberId = existingGym2Member.id;
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

  describe("Authentication & Role Authorization", () => {
    test("POST /api/v1/members should fail with 401 if unauthorized (missing token)", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "test member 1",
          phoneNumber: "+251900990099",
        }),
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
    });

    test("POST /api/v1/members should fail with 403 when posted by unauthorized coach role", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${unauthorizedToken}`,
        },
        body: JSON.stringify({
          name: "test member 1",
          phoneNumber: "+251900990099",
        }),
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    test("GET /api/v1/members should fail with a 403 when accessed by unauthorized coach role", async () => {
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${unauthorizedToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    test("GET /api/v1/members/:id should fail with 403 when accessed by unauthorized coach role", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${unauthorizedToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    test("PATCH /api/v1/members/:id should fail with 403 when patching with unauthorized coach role", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${unauthorizedToken}`,
        },
        body: JSON.stringify({
          name: "member1 updated",
        }),
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    test("DELETE /api/v1/members/:id should fail with 403 when deleted by unauthorized coach role", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${unauthorizedToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    test("GET /api/v1/members should fail with 403 when session has no active gym selected", async () => {
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${noGymToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
      expect(result.error.message).toContain("no active gym");
    });

    test("GET /api/v1/members should fail with 403 when staff badge is suspended", async () => {
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${suspendedStaffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(403);
      expect(result.error.message).toContain("suspended");
    });
  });

  describe("Input Validation & Bad Requests", () => {
    test("POST /api/v1/members should fail with 400 when body fails Zod validation", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
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

    test("GET /api/v1/members?limit=200 should fail with 400 when limit exceeds maximum allowed", async () => {
      const res = await app.request("/api/v1/members?limit=200", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("GET /api/v1/members/:id should fail with 400 BAD_REQUEST for malformed non-UUID id", async () => {
      const res = await app.request(`/api/v1/members/invalid-uuid-syntax-test`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("PATCH /api/v1/members/:id should fail with 400 BAD_REQUEST for malformed non-UUID id", async () => {
      const res = await app.request(`/api/v1/members/invalid-uuid-syntax-test`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "update attempt",
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("DELETE /api/v1/members/:id should fail with 400 BAD_REQUEST for malformed non-UUID id", async () => {
      const res = await app.request(`/api/v1/members/invalid-uuid-syntax-test`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("Member Creation (POST /api/v1/members)", () => {
    test("POST /api/v1/members should fail with 409 if phone number already exists in this gym", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "duplicate member",
          phoneNumber: "0922002200", // Matches existingMember (+251922002200)
        }),
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(409);
      expect(result.error.code).toBe("CONFLICT");
    });

    test("POST /api/v1/members should pass with 201 when posted by staff and provided with valid data", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "test member 2",
          phoneNumber: "0911223300",
        }),
      });
      expect(res.status).toBe(201);
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.phoneNumber).toBe("+251911223300");
    });

    test("POST /api/v1/members should pass with 201 when posted by owner and provided with valid data", async () => {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "test member 3",
          phoneNumber: "0911443300",
        }),
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(result.data.phoneNumber).toBe("+251911443300");
      expect(res.status).toBe(201);
    });
  });

  describe("Member Retrieval (GET /api/v1/members & GET /:id)", () => {
    test("GET /api/v1/members should pass with 200 and return pagination metadata when accessed by staff", async () => {
      const res = await app.request("/api/v1/members?page=1&limit=2", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.totalMembers).toBeGreaterThanOrEqual(1);
    });

    test("GET /api/v1/members should pass with 200 when accessed by owner", async () => {
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(res.status).toBe(200);
    });

    test("GET /api/v1/members?search=test member 2 should return filtered search results", async () => {
      const res = await app.request("/api/v1/members?search=test%20member%202", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data[0].name).toContain("test member 2");
    });

    test("GET /api/v1/members/:id should pass with 200 when accessed by staff", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(result.data.phoneNumber).toBe("+251922002200");
    });

    test("GET /api/v1/members/:id should pass with 200 when accessed by owner", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(result.data.phoneNumber).toBe("+251922002200");
    });

    test("GET /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
      const res = await app.request(
        `/api/v1/members/00000000-0000-0000-0000-000000000000`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${staffToken}`,
          },
        },
      );
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
    });

    test("GET /api/v1/members/:id should fail with 404 when querying an operator userId (CRM table isolation)", async () => {
      const res = await app.request(`/api/v1/members/${ownerId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(false);
      expect(res.status).toBe(404);
      expect(result.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Member Updates (PATCH /api/v1/members/:id)", () => {
    test("PATCH /api/v1/members/:id should pass with 200 when patched by staff", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "member1 updated",
        }),
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(result.data.name).toBe("member1 updated");
    });

    test("PATCH /api/v1/members/:id should pass with 200 when patched by owner", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "member updated again",
        }),
      });
      const result = (await res.json()) as any;
      expect(result.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(result.data.name).toBe("member updated again");
    });

    test("PATCH /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
      const res = await app.request(
        `/api/v1/members/00000000-0000-0000-0000-000000000000`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({
            name: "ghost member",
          }),
        },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Member Soft-Delete & Reactivation Toggle (DELETE /api/v1/members/:id)", () => {
    test("DELETE /api/v1/members/:id should pass with 200 when soft-deleted by staff", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data).toContain("soft-deleted");
    });

    test("DELETE /api/v1/members/:id should pass with 200 and recover member when toggled again", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data).toContain("recovered");
    });

    test("DELETE /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
      const res = await app.request(
        `/api/v1/members/00000000-0000-0000-0000-000000000000`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${staffToken}`,
          },
        },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Multi-Tenant Isolation (Cross-Gym Boundary Enforcement)", () => {
    test("GET /api/v1/members from Gym 2 should only return Gym 2 members, never Gym 1 members", async () => {
      const res = await app.request("/api/v1/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${gym2StaffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(200);
      expect(result.ok).toBe(true);

      const returnedMemberIds = result.data.map((m: any) => m.id);
      expect(returnedMemberIds).toContain(gym2MemberId);
      expect(returnedMemberIds).not.toContain(activeMemberId);
    });

    test("GET /api/v1/members/:id from Gym 2 should return 404 for Gym 1 member", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${gym2StaffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
    });

    test("PATCH /api/v1/members/:id from Gym 2 should return 404 when attempting to edit Gym 1 member", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gym2StaffToken}`,
        },
        body: JSON.stringify({
          name: "Cross-Tenant Hijack Attempt",
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
    });

    test("DELETE /api/v1/members/:id from Gym 2 should return 404 when attempting to delete Gym 1 member", async () => {
      const res = await app.request(`/api/v1/members/${activeMemberId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${gym2StaffToken}`,
        },
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(404);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
    });

    test("POST /api/v1/members from Gym 2 should succeed when registering the same phone number as Gym 1 member", async () => {
      // In a multi-tenant system, UNIQUE(gym_id, phone_number) allows same customer phone in different gyms
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gym2StaffToken}`,
        },
        body: JSON.stringify({
          name: "Member Almaz in Gym 2",
          phoneNumber: "+251922002200", // Same phone as activeMember in Gym 1
        }),
      });
      const result = (await res.json()) as any;
      expect(res.status).toBe(201);
      expect(result.ok).toBe(true);
      expect(result.data.gymId).toBe(gym2Id);
      expect(result.data.phoneNumber).toBe("+251922002200");
    });
  });
});
