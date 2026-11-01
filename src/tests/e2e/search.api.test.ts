import { test, describe, expect, beforeAll, afterAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  gymStaff,
  members,
  membershipPlans,
  memberships,
  payments,
  sessions,
  users,
} from "../../db/schema.ts";

describe("Search API E2E Tests (/api/v1/search & /api/v1/search/omnibar)", () => {
  let gym1Id: string;
  let gym2Id: string;
  let ownerToken: string;
  let staffToken: string;
  let suspendedStaffToken: string;
  let noGymToken: string;
  let gym2StaffToken: string;

  let standardPlanId: string;
  let activeMemberId: string;
  let expiredMemberId: string;
  let bannedMemberId: string;
  let archivedMemberId: string;
  let noSubMemberId: string;

  beforeAll(async () => {
    // Teardown before setup
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    // 1. Seed Primary Gym (Gym 1)
    const [gym1] = await connection
      .insert(gyms)
      .values({
        name: "Omnibar E2E Primary Gym",
        slug: "omnibar-e2e-primary-gym",
      })
      .returning();
    gym1Id = gym1.id;

    // 2. Seed Secondary Gym (Gym 2 - for multi-tenant isolation tests)
    const [gym2] = await connection
      .insert(gyms)
      .values({
        name: "Omnibar E2E Secondary Gym",
        slug: "omnibar-e2e-secondary-gym",
      })
      .returning();
    gym2Id = gym2.id;

    // 3. Seed Owner for Gym 1
    const [ownerUser] = await connection
      .insert(users)
      .values({
        name: "E2E Search Owner",
        phoneNumber: "+251911000111",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: ownerUser.id,
      role: "owner",
      status: "active",
    });

    const [ownerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerUser.id,
        activeGymId: gym1Id,
        token: "search-owner-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = ownerSession.token;

    // 4. Seed Staff for Gym 1
    const [staffUser] = await connection
      .insert(users)
      .values({
        name: "E2E Search Staff",
        phoneNumber: "+251911000222",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: staffUser.id,
      role: "staff",
      status: "active",
    });

    const [staffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffUser.id,
        activeGymId: gym1Id,
        token: "search-staff-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = staffSession.token;

    // 5. Seed Suspended Staff
    const [suspendedUser] = await connection
      .insert(users)
      .values({
        name: "E2E Suspended Staff",
        phoneNumber: "+251911000333",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: suspendedUser.id,
      role: "staff",
      status: "suspended",
    });

    const [suspendedSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: suspendedUser.id,
        activeGymId: gym1Id,
        token: "search-suspended-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    suspendedStaffToken = suspendedSession.token;

    // 6. Seed Session without activeGymId
    const [noGymUser] = await connection
      .insert(users)
      .values({
        name: "E2E No Gym User",
        phoneNumber: "+251911000444",
      })
      .returning();

    const [noGymSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: noGymUser.id,
        activeGymId: null,
        token: "search-no-gym-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    noGymToken = noGymSession.token;

    // 7. Seed Staff for Gym 2
    const [gym2StaffUser] = await connection
      .insert(users)
      .values({
        name: "E2E Gym 2 Staff",
        phoneNumber: "+251911000555",
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId: gym2Id,
      userId: gym2StaffUser.id,
      role: "staff",
      status: "active",
    });

    const [gym2Session] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: gym2StaffUser.id,
        activeGymId: gym2Id,
        token: "search-gym2-staff-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    gym2StaffToken = gym2Session.token;

    // 8. Seed Standard Membership Plan in Gym 1
    const [plan] = await connection
      .insert(membershipPlans)
      .values({
        gymId: gym1Id,
        name: "Monthly Gym & Cardio",
        price: 3000,
        duration: 30,
      })
      .returning();
    standardPlanId = plan.id;

    // 9. Seed Active Member in Gym 1
    const [activeMember] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Dawit Bekele",
        phoneNumber: "+251911112233",
        status: "active",
      })
      .returning();
    activeMemberId = activeMember.id;

    await connection.insert(memberships).values({
      gymId: gym1Id,
      memberId: activeMemberId,
      planId: standardPlanId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: "active",
    });

    // 10. Seed Expired Member in Gym 1
    const [expiredMember] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Almaz Ayana",
        phoneNumber: "+251922334455",
        status: "active",
      })
      .returning();
    expiredMemberId = expiredMember.id;

    await connection.insert(memberships).values({
      gymId: gym1Id,
      memberId: expiredMemberId,
      planId: standardPlanId,
      startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: "expired",
    });

    // 11. Seed Banned Member in Gym 1
    const [bannedMember] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Banned Member",
        phoneNumber: "+251933445566",
        status: "banned",
      })
      .returning();
    bannedMemberId = bannedMember.id;

    // 12. Seed Archived (Soft-deleted) Member in Gym 1
    const [archivedMember] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Archived Member",
        phoneNumber: "+251944556677",
        status: "active",
        isDeleted: true,
      })
      .returning();
    archivedMemberId = archivedMember.id;

    // 13. Seed Lead / No-membership Member in Gym 1
    const [noSubMember] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Sara NoMembership",
        phoneNumber: "+251933221100",
        status: "active",
      })
      .returning();
    noSubMemberId = noSubMember.id;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  describe("Authentication & Role Authorization", () => {
    test("should fail with 401 UNAUTHORIZED when no token is provided", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UN_AUTHORIZED");
    });

    test("should fail with 401 UNAUTHORIZED when an invalid token is provided", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: "Bearer invalid-token-xyz" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    test("should fail with 403 FORBIDDEN when staff badge is suspended", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${suspendedStaffToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    test("should fail with 403 FORBIDDEN when session has no active gym selected", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${noGymToken}` },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    test("should succeed with 200 OK when called by staff or owner", async () => {
      const resStaff = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(resStaff.status).toBe(200);

      const resOwner = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(resOwner.status).toBe(200);
    });
  });

  describe("Input Query Validation", () => {
    test("should fail with 400 BAD_REQUEST when query parameter is missing", async () => {
      const res = await app.request("/api/v1/search/omnibar", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should fail with 400 BAD_REQUEST when query is only whitespace", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=%20%20%20", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INPUT_VALIDATION_ERROR");
    });

    test("should fail with 400 BAD_REQUEST when limit is out of bounds (< 1 or > 20)", async () => {
      const resZero = await app.request("/api/v1/search/omnibar?query=0911&limit=0", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(resZero.status).toBe(400);

      const resHigh = await app.request("/api/v1/search/omnibar?query=0911&limit=50", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(resHigh.status).toBe(400);
    });
  });

  describe("Phone Exact Match Flow (Deterministic Decision Card)", () => {
    test("should return NOT_FOUND state with ENROLL action for unlisted phone number", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911000000", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("NOT_FOUND");
      expect(body.data.searchedPhone).toBe("+251911000000");
      expect(body.data.availableActions).toEqual(["ENROLL"]);
    });

    test("should return ACTIVE state with remaining days and actions for active member", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("ACTIVE");
      expect(body.data.member.name).toBe("Dawit Bekele");
      expect(body.data.activeMembership.planName).toBe("Monthly Gym & Cardio");
      expect(body.data.activeMembership.daysRemaining).toBeGreaterThanOrEqual(14);
      expect(body.data.availableActions).toEqual(["CHECK_IN", "RENEW_EARLY", "UPGRADE"]);
    });

    test("should return EXPIRED state with daysExpired and RENEW action for expired member", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0922334455", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("EXPIRED");
      expect(body.data.member.name).toBe("Almaz Ayana");
      expect(body.data.latestMembership.daysExpired).toBeGreaterThanOrEqual(9);
      expect(body.data.availableActions).toEqual(["RENEW"]);
    });

    test("should return BANNED_OR_SUSPENDED state with NO_ENTRY action for banned member", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0933445566", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("BANNED_OR_SUSPENDED");
      expect(body.data.availableActions).toEqual(["NO_ENTRY", "CONTACT_OWNER"]);
    });

    test("should return ARCHIVED state with ENROLL action for soft-deleted member", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0944556677", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("ARCHIVED");
      expect(body.data.availableActions).toEqual(["ENROLL"]);
    });

    test("should return NO_MEMBERSHIP state for registered lead without subscriptions", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0933221100", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("NO_MEMBERSHIP");
      expect(body.data.availableActions).toEqual(["ASSIGN_MEMBERSHIP"]);
    });
  });

  describe("Name & Partial Disambiguation Search Flow", () => {
    test("should return matching candidate cards when queried by member name", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=Dawit", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      expect(body.data.query).toBe("Dawit");
      expect(body.data.candidates.length).toBeGreaterThanOrEqual(1);

      const dawit = body.data.candidates.find((c: any) => c.name === "Dawit Bekele");
      expect(dawit).toBeDefined();
      expect(dawit.state).toBe("ACTIVE");
      expect(dawit.planName).toBe("Monthly Gym & Cardio");
    });

    test("should return candidates when queried with partial phone digits (e.g. 0911)", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      const dawit = body.data.candidates.find((c: any) => c.phoneNumber === "+251911112233");
      expect(dawit).toBeDefined();
    });

    test("should respect limit query parameter in candidate results", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=a&limit=2", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      expect(body.data.candidates.length).toBeLessThanOrEqual(2);
    });

    test("should return empty candidate list when no matches exist", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=NonExistentMemberXYZ", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      expect(body.data.totalFound).toBe(0);
      expect(body.data.candidates).toEqual([]);
    });

    test("should safely escape % wildcard and return 0 candidates", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=%25", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      expect(body.data.candidates.length).toBe(0);
    });
  });

  describe("Alternative Endpoint Alias (/api/v1/search)", () => {
    test("should return identical response when querying the base route /api/v1/search", async () => {
      const res = await app.request("/api/v1/search?query=0911112233", {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("ACTIVE");
      expect(body.data.member.name).toBe("Dawit Bekele");
    });
  });

  describe("Multi-Tenant Isolation", () => {
    test("should return NOT_FOUND when Gym 2 staff searches a Gym 1 member phone", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=0911112233", {
        headers: { Authorization: `Bearer ${gym2StaffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("PHONE_MATCH");
      expect(body.data.state).toBe("NOT_FOUND");
    });

    test("should return empty candidates when Gym 2 staff searches a Gym 1 member name", async () => {
      const res = await app.request("/api/v1/search/omnibar?query=Dawit", {
        headers: { Authorization: `Bearer ${gym2StaffToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("NAME_MATCH");
      expect(body.data.candidates.length).toBe(0);
    });
  });
});
