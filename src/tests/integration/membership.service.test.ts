import { describe, test, expect, beforeAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import * as membershipService from "../../services/membership.service.ts";
import { gyms, membershipPlans, memberships, payments, sessions, users } from "../../db/schema.ts";

describe("membership service integration tests (TDD)", () => {
  let gymId: string;
  let memberId: string;
  let planId: string;
  let staffId: string;

  beforeAll(async () => {
    // 1. Wipe tables in reverse dependency order
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);

    // 2. Seed primary test Gym
    const [gym] = await connection
      .insert(gyms)
      .values({
        name: "Membership Test Gym",
        slug: "membership-test-gym",
      })
      .returning();
    gymId = gym.id;

    // 3. Seed test member user
    const [member] = await connection
      .insert(users)
      .values({
        gymId,
        name: "Abebe Bikila",
        phoneNumber: "+251911000001",
        role: "member",
      })
      .returning();
    memberId = member.id;

    // 4. Seed test staff user (to test role restriction validation)
    const [staff] = await connection
      .insert(users)
      .values({
        gymId,
        name: "Staff User",
        phoneNumber: "+251911000002",
        role: "staff",
      })
      .returning();
    staffId = staff.id;

    // 5. Seed test 30-day membership plan
    const [plan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "Monthly Pass",
        price: 2500,
        duration: 30,
      })
      .returning();
    planId = plan.id;
  });

  describe("createMembership", () => {
    test("should create active membership and compute correct endDate (startDate + 30 days)", async () => {
      const now = new Date();
      const result = await membershipService.createMembership(gymId, {
        userId: memberId,
        planId: planId,
        startDate: now,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe(201);
        expect(result.data.gymId).toBe(gymId);
        expect(result.data.userId).toBe(memberId);
        expect(result.data.planId).toBe(planId);
        expect(result.data.status).toBe("active");

        const expectedEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        expect(new Date(result.data.endDate).getDate()).toBe(expectedEndDate.getDate());
      }
    });

    test("should fail with 404 NOT_FOUND if userId does not exist", async () => {
      const result = await membershipService.createMembership(gymId, {
        userId: "00000000-0000-0000-0000-000000000000",
        planId: planId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    test("should fail with 404 NOT_FOUND if planId does not exist", async () => {
      const result = await membershipService.createMembership(gymId, {
        userId: memberId,
        planId: "00000000-0000-0000-0000-000000000000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    test("should fail with 404 NOT_FOUND if target user is a staff role (not member)", async () => {
      const result = await membershipService.createMembership(gymId, {
        userId: staffId,
        planId: planId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    test("should stack renewal start date on top of active membership end date", async () => {
      // 1. Create initial active membership
      const now = new Date();
      const initialMembershipResult = await membershipService.createMembership(gymId, {
        userId: memberId,
        planId: planId,
        startDate: now,
      });
      expect(initialMembershipResult.ok).toBe(true);

      if (initialMembershipResult.ok) {
        const initialEndDate = new Date(initialMembershipResult.data.endDate);

        // 2. Renew membership while first one is still active
        const renewalMembershipResult = await membershipService.createMembership(gymId, {
          userId: memberId,
          planId: planId,
        });

        expect(renewalMembershipResult.ok).toBe(true);
        if (renewalMembershipResult.ok) {
          // New startDate should match first membership's endDate!
          expect(new Date(renewalMembershipResult.data.startDate).getTime()).toBe(initialEndDate.getTime());
        }
      }
    });

    test("should handle concurrent membership creation requests without race conditions", async () => {
      // 1. Seed fresh member
      const [concurrentMember] = await connection
        .insert(users)
        .values({
          gymId,
          name: "Concurrent Member",
          phoneNumber: "+251911777777",
          role: "member",
        })
        .returning();

      // 2. Fire 2 parallel createMembership requests simultaneously
      const [result1, result2] = await Promise.all([
        membershipService.createMembership(gymId, {
          userId: concurrentMember.id,
          planId: planId,
        }),
        membershipService.createMembership(gymId, {
          userId: concurrentMember.id,
          planId: planId,
        }),
      ]);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        const end1 = new Date(result1.data.endDate).getTime();
        const start2 = new Date(result2.data.startDate).getTime();
        const end2 = new Date(result2.data.endDate).getTime();
        const start1 = new Date(result1.data.startDate).getTime();

        const datesStackedCorrectly = start2 >= end1 || start1 >= end2;
        expect(datesStackedCorrectly).toBe(true);
      }
    });
  });

  describe("getAllMemberships", () => {
    test("should return paginated memberships joined with member and plan details", async () => {
      const result = await membershipService.getAllMemberships(gymId, 1, 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe(200);
        expect(result.data.length).toBeGreaterThanOrEqual(1);
        expect(result.data[0].memberName).toBe("Abebe Bikila");
        expect(result.data[0].planName).toBe("Monthly Pass");
        expect(result.pagination.totalMemberships).toBeGreaterThanOrEqual(1);
      }
    });

    test("should filter memberships by userId", async () => {
      const result = await membershipService.getAllMemberships(gymId, 1, 10, undefined, memberId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe(200);
        expect(result.data.every((membership) => membership.userId === memberId)).toBe(true);
      }
    });

    test("should dynamically compute status as expired when endDate is in the past", async () => {
      // 1. Create a membership that started 60 days ago (ended 30 days ago)
      const pastStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const pastEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [pastMembership] = await connection
        .insert(memberships)
        .values({
          gymId,
          userId: memberId,
          planId: planId,
          startDate: pastStart,
          endDate: pastEnd,
          status: "active", // DB column still says active
        })
        .returning();

      // 2. Fetch single membership by ID
      const singleMembershipResult = await membershipService.getMembershipById(gymId, pastMembership.id);
      expect(singleMembershipResult.ok).toBe(true);
      if (singleMembershipResult.ok) {
        // Must dynamically return expired!
        expect(singleMembershipResult.data.status).toBe("expired");
      }

      // 3. Fetch all memberships with statusFilter = "expired"
      const expiredMembershipsResult = await membershipService.getAllMemberships(gymId, 1, 10, "expired");
      expect(expiredMembershipsResult.ok).toBe(true);
      if (expiredMembershipsResult.ok) {
        const foundExpiredMembership = expiredMembershipsResult.data.find((membership) => membership.id === pastMembership.id);
        expect(foundExpiredMembership).toBeDefined();
        expect(foundExpiredMembership?.status).toBe("expired");
      }

      // 4. Fetch all memberships with statusFilter = "active"
      const activeMembershipsResult = await membershipService.getAllMemberships(gymId, 1, 10, "active");
      expect(activeMembershipsResult.ok).toBe(true);
      if (activeMembershipsResult.ok) {
        const foundActiveMembership = activeMembershipsResult.data.find((membership) => membership.id === pastMembership.id);
        expect(foundActiveMembership).toBeUndefined(); // Must be excluded from active filter!
      }
    });

    test("should exclude memberships of soft-deleted users (inner join gate)", async () => {
      // 1. Seed soft-deleted member user
      const [deletedMember] = await connection
        .insert(users)
        .values({
          gymId,
          name: "Deleted Member",
          phoneNumber: "+251911999999",
          role: "member",
          isDeleted: true,
        })
        .returning();

      // 2. Create membership for deleted member
      const [membershipForDeleted] = await connection
        .insert(memberships)
        .values({
          gymId,
          userId: deletedMember.id,
          planId: planId,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "active",
        })
        .returning();

      // 3. getMembershipById should return 404 because user is soft-deleted!
      const singleResult = await membershipService.getMembershipById(gymId, membershipForDeleted.id);
      expect(singleResult.ok).toBe(false);
      if (!singleResult.ok) {
        expect(singleResult.status).toBe(404);
      }

      // 4. getAllMemberships should exclude membership of soft-deleted user!
      const listResult = await membershipService.getAllMemberships(gymId, 1, 50);
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        const found = listResult.data.find((m) => m.id === membershipForDeleted.id);
        expect(found).toBeUndefined();
      }
    });
  });

  describe("getMembershipById", () => {
    test("should return single membership detail for valid ID", async () => {
      const allRes = await membershipService.getAllMemberships(gymId, 1, 1);
      expect(allRes.ok).toBe(true);

      if (allRes.ok && allRes.data.length > 0) {
        const targetId = allRes.data[0].id;
        const result = await membershipService.getMembershipById(gymId, targetId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.id).toBe(targetId);
          expect(result.data.memberName).toBe("Abebe Bikila");
        }
      }
    });

    test("should fail with 404 NOT_FOUND for non-existent ID", async () => {
      const result = await membershipService.getMembershipById(gymId, "00000000-0000-0000-0000-000000000000");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
      }
    });
  });

  describe("updateMembershipStatus & deleteMembershipToggle", () => {
    test("should update status to cancelled", async () => {
      const allRes = await membershipService.getAllMemberships(gymId, 1, 1);
      if (allRes.ok && allRes.data.length > 0) {
        const targetId = allRes.data[0].id;
        const result = await membershipService.updateMembershipStatus(gymId, targetId, "cancelled");

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.status).toBe("cancelled");
        }
      }
    });

    test("should soft delete membership when toggled", async () => {
      const allRes = await membershipService.getAllMemberships(gymId, 1, 1);
      if (allRes.ok && allRes.data.length > 0) {
        const targetId = allRes.data[0].id;
        const result = await membershipService.deleteMembershipToggle(gymId, targetId);

        expect(result.ok).toBe(true);
      }
    });
  });
});
