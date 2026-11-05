import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import { connection } from "../../config/connection";
import {
  users,
  sessions,
  gyms,
  memberships,
  payments,
  members,
  gymStaff,
} from "../../db/schema";
import * as staffService from "../../services/users/staff.service.ts";
import { eq, and } from "drizzle-orm";

describe("integration test for the staff services", () => {
  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  let existingStaffCoach: any;
  let activeGymMember: any;
  let archivedGymMember: any;
  let gymOwner: any;
  let gymId: string;

  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    const [branchGym] = await connection
      .insert(gyms)
      .values({
        name: "Bole Training Branch",
        slug: "bole-training-branch",
      })
      .returning();

    gymId = branchGym.id;

    // 1. Seed Customer Members into `members` table
    [activeGymMember] = await connection
      .insert(members)
      .values({
        gymId,
        name: "Yared Member",
        phoneNumber: "+251922009977",
        status: "active",
      })
      .returning();

    [archivedGymMember] = await connection
      .insert(members)
      .values({
        gymId,
        name: "Solomon Archived Member",
        phoneNumber: "+251900990088",
        status: "active",
        isDeleted: true,
      })
      .returning();

    // 2. Seed Coach into `users` + `gymStaff` badge
    const [coachUser] = await connection
      .insert(users)
      .values({
        name: "Coach Berhanu",
        phoneNumber: "+251912321453",
      })
      .returning();

    const [coachBadge] = await connection
      .insert(gymStaff)
      .values({
        gymId,
        userId: coachUser.id,
        role: "staff",
        status: "active",
      })
      .returning();
    existingStaffCoach = { ...coachUser, ...coachBadge, id: coachBadge.id };

    // 3. Seed Owner into `users` + `gymStaff` badge
    const [ownerUser] = await connection
      .insert(users)
      .values({
        name: "Owner Fitsum",
        phoneNumber: "+251944332288",
      })
      .returning();

    const [ownerBadge] = await connection
      .insert(gymStaff)
      .values({
        gymId,
        userId: ownerUser.id,
        role: "owner",
        status: "active",
      })
      .returning();
    gymOwner = { ...ownerUser, ...ownerBadge, id: ownerBadge.id };
  });

  describe("createStaff", () => {
    test("creating staff should pass when provided with valid data", async () => {
      const createResult = await staffService.createStaff(`${gymId}`, {
        name: "Coach Dawit",
        phoneNumber: "+251911223355",
      });

      expect(createResult.ok).toBe(true);
      expect(createResult.status).toBe(201);
      if (createResult.ok) {
        expect(createResult.data.name).toBe("Coach Dawit");
      }
    });

    test("creating staff should fail if there is a duplicate active staff", async () => {
      const duplicateStaffResult = await staffService.createStaff(`${gymId}`, {
        name: "Duplicate Coach Dawit",
        phoneNumber: "+251911223355",
      });
      expect(duplicateStaffResult.ok).toBe(false);
      expect(duplicateStaffResult.status).toBe(409);
      if (!duplicateStaffResult.ok) {
        expect(duplicateStaffResult.error.code).toBe("CONFLICT");
      }
    });

    test("creating staff should fail if phone is in use by an active member and return memberId details", async () => {
      const conflictMemberResult = await staffService.createStaff(`${gymId}`, {
        name: "Coach Impersonating Member",
        phoneNumber: activeGymMember.phoneNumber,
      });
      expect(conflictMemberResult.ok).toBe(false);
      expect(conflictMemberResult.status).toBe(409);
      if (!conflictMemberResult.ok) {
        expect(conflictMemberResult.error.code).toBe("CONFLICT");
        expect(conflictMemberResult.error.details).toBeDefined();
        expect(conflictMemberResult.error.details?.memberId).toBe(
          activeGymMember.id,
        );
      }
    });

    test("creating staff should fail even if member was soft-deleted and return memberId details", async () => {
      const conflictArchivedResult = await staffService.createStaff(
        `${gymId}`,
        {
          name: "Coach Impersonating Archived Member",
          phoneNumber: archivedGymMember.phoneNumber,
        },
      );
      expect(conflictArchivedResult.ok).toBe(false);
      expect(conflictArchivedResult.status).toBe(409);
      if (!conflictArchivedResult.ok) {
        expect(conflictArchivedResult.error.code).toBe("CONFLICT");
        expect(conflictArchivedResult.error.details).toBeDefined();
        expect(conflictArchivedResult.error.details?.memberId).toBe(
          archivedGymMember.id,
        );
      }
    });

    test("creating staff should fail with 409 CONFLICT if email already exists globally", async () => {
      // 1. Seed existing staff with email
      await connection.insert(users).values({
        name: "Existing Staff Email",
        phoneNumber: "+251955001122",
        email: "staff.unique@gym.et",
      });

      // 2. Attempt to create another staff with different phone but same email
      const result = await staffService.createStaff(`${gymId}`, {
        name: "Another Staff",
        phoneNumber: "+251955001123",
        email: "staff.unique@gym.et",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.error.code).toBe("CONFLICT");
      }
    });
  });

  describe("getAllStaff", () => {
    test("getAllStaff should return a paginated list of staff members only", async () => {
      const listStaffResult = await staffService.getAllStaff(`${gymId}`, 1, 10);
      expect(listStaffResult.ok).toBe(true);
      expect(listStaffResult.status).toBe(200);
      if (listStaffResult.ok) {
        expect(listStaffResult.data.length).toBeGreaterThanOrEqual(1);
        expect(listStaffResult.pagination.totalStaff).toBeGreaterThanOrEqual(1);
        // Ensure no members or owners returned
        const hasNonStaff = listStaffResult.data.some(
          (u) => u.role !== "staff",
        );
        expect(hasNonStaff).toBe(false);
      }
    });

    test("getAllStaff should filter results by search query", async () => {
      const searchStaffResult = await staffService.getAllStaff(
        `${gymId}`,
        1,
        10,
        "Coach Berhanu",
      );
      expect(searchStaffResult.ok).toBe(true);
      if (searchStaffResult.ok) {
        expect(searchStaffResult.data.length).toBe(1);
        expect(searchStaffResult.data[0].phoneNumber).toBe("+251912321453");
      }
    });
  });

  describe("getStaffById", () => {
    test("getStaffById should return staff details for valid staff ID", async () => {
      const fetchStaffResult = await staffService.getStaffById(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(fetchStaffResult.ok).toBe(true);
      expect(fetchStaffResult.status).toBe(200);
      if (fetchStaffResult.ok) {
        expect(fetchStaffResult.data.id).toBe(existingStaffCoach.id);
        expect(fetchStaffResult.data.role).toBe("staff");
      }
    });

    test("getStaffById should return details for coach and admin roles", async () => {
      const [coachUser] = await connection
        .insert(users)
        .values({
          name: "Coach Haile",
          phoneNumber: "+251977889900",
        })
        .returning();

      const [coachBadge] = await connection
        .insert(gymStaff)
        .values({
          gymId,
          userId: coachUser.id,
          role: "coach",
          status: "active",
        })
        .returning();

      const res = await staffService.getStaffById(gymId, coachBadge.id);
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      if (res.ok) {
        expect(res.data.id).toBe(coachBadge.id);
        expect(res.data.role).toBe("coach");
      }
    });

    test("getStaffById should fail with 404 for non-existent ID", async () => {
      const nonExistentStaffResult = await staffService.getStaffById(
        `${gymId}`,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(nonExistentStaffResult.ok).toBe(false);
      expect(nonExistentStaffResult.status).toBe(404);
      if (!nonExistentStaffResult.ok) {
        expect(nonExistentStaffResult.error.code).toBe("NOT_FOUND");
      }
    });

    test("getStaffById should fail with 404 if ID belongs to a non-staff user", async () => {
      const fetchOwnerAsStaffResult = await staffService.getStaffById(
        `${gymId}`,
        gymOwner.id,
      );
      expect(fetchOwnerAsStaffResult.ok).toBe(false);
      expect(fetchOwnerAsStaffResult.status).toBe(404);
      if (!fetchOwnerAsStaffResult.ok) {
        expect(fetchOwnerAsStaffResult.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateStaff", () => {
    test("updateStaff should update badge name without mutating global user name", async () => {
      const updateStaffResult = await staffService.updateStaff(
        `${gymId}`,
        existingStaffCoach.id,
        {
          name: "Coach Berhanu Updated",
        },
      );
      expect(updateStaffResult.ok).toBe(true);
      expect(updateStaffResult.status).toBe(200);
      if (updateStaffResult.ok) {
        expect(updateStaffResult.data.name).toBe("Coach Berhanu Updated");
      }

      // Verify that the global user identity in `users` remains unchanged!
      const [userAfter] = await connection
        .select()
        .from(users)
        .where(eq(users.id, existingStaffCoach.userId));
      expect(userAfter.name).toBe("Coach Berhanu");
    });

    test("updateStaff should update badge role and status successfully", async () => {
      const updateRoleStatusResult = await staffService.updateStaff(
        `${gymId}`,
        existingStaffCoach.id,
        {
          role: "coach",
          status: "suspended",
        },
      );
      expect(updateRoleStatusResult.ok).toBe(true);
      expect(updateRoleStatusResult.status).toBe(200);
      if (updateRoleStatusResult.ok) {
        expect(updateRoleStatusResult.data.role).toBe("coach");
        expect(updateRoleStatusResult.data.status).toBe("suspended");
      }

      // Restore status to active and role to staff for subsequent tests
      await staffService.updateStaff(`${gymId}`, existingStaffCoach.id, {
        role: "staff",
        status: "active",
      });
    });

    test("updateStaff should fail with 404 for non-existent staff ID", async () => {
      const nonExistentUpdateResult = await staffService.updateStaff(
        `${gymId}`,
        "00000000-0000-0000-0000-000000000000",
        {
          name: "Ghost Staff Coach",
        },
      );
      expect(nonExistentUpdateResult.ok).toBe(false);
      expect(nonExistentUpdateResult.status).toBe(404);
    });

    test("updateStaff should fail with 404 if ID belongs to an owner", async () => {
      const updateOwnerResult = await staffService.updateStaff(
        `${gymId}`,
        gymOwner.id,
        {
          name: "Owner Modified",
        },
      );
      expect(updateOwnerResult.ok).toBe(false);
      expect(updateOwnerResult.status).toBe(404);
    });
  });

  describe("deleteStaffToggle", () => {
    test("deleteStaffToggle should soft delete active staff", async () => {
      const deleteToggleResult = await staffService.deleteStaffToggle(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(deleteToggleResult.ok).toBe(true);
      expect(deleteToggleResult.status).toBe(200);
    });

    test("deleteStaffToggle should recover soft deleted staff on second call", async () => {
      const recoverToggleResult = await staffService.deleteStaffToggle(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(recoverToggleResult.ok).toBe(true);
      expect(recoverToggleResult.status).toBe(200);
    });

    test("deleteStaffToggle should fail with 404 for non-existent staff ID", async () => {
      const nonExistentToggleResult = await staffService.deleteStaffToggle(
        `${gymId}`,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(nonExistentToggleResult.ok).toBe(false);
      expect(nonExistentToggleResult.status).toBe(404);
    });

    test("deleteStaffToggle should purge active sessions when staff is soft deleted", async () => {
      // Seed a session for existingStaffCoach
      await connection.insert(sessions).values({
        userId: existingStaffCoach.userId,
        activeGymId: gymId,
        token: "token-staff-test-xyz",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      });

      // Soft delete existingStaffCoach
      await staffService.deleteStaffToggle(`${gymId}`, existingStaffCoach.id);

      // Verify session was nuked
      const activeSessions = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.userId, existingStaffCoach.userId));

      expect(activeSessions.length).toBe(0);
    });

    test("deleteStaffToggle should only purge sessions for the target gym and preserve other gym sessions", async () => {
      // 1. Recover existingStaffCoach badge so it's active
      await connection
        .update(gymStaff)
        .set({ isDeleted: false, status: "active" })
        .where(eq(gymStaff.id, existingStaffCoach.id));

      // 2. Create Gym 2
      const [gym2] = await connection
        .insert(gyms)
        .values({
          name: "Second Gym for Session Isolation",
          slug: "second-gym-session-iso",
        })
        .returning();

      // 3. Seed two sessions for the same user: one at Gym 1, one at Gym 2
      const gym2SessionId = crypto.randomUUID();
      await connection.insert(sessions).values([
        {
          userId: existingStaffCoach.userId,
          activeGymId: gymId,
          token: "token-gym1-iso",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
        {
          id: gym2SessionId,
          userId: existingStaffCoach.userId,
          activeGymId: gym2.id,
          token: "token-gym2-iso",
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      ]);

      // 4. Soft-delete staff badge at Gym 1
      const res = await staffService.deleteStaffToggle(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(res.ok).toBe(true);

      // 5. Query sessions for Gym 1 vs Gym 2
      const gym1Sessions = await connection
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, existingStaffCoach.userId),
            eq(sessions.activeGymId, gymId),
          ),
        );
      const gym2Sessions = await connection
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, existingStaffCoach.userId),
            eq(sessions.activeGymId, gym2.id),
          ),
        );

      // Gym 1 session should be purged, but Gym 2 session MUST remain intact!
      expect(gym1Sessions.length).toBe(0);
      expect(gym2Sessions.length).toBe(1);
      expect(gym2Sessions[0].id).toBe(gym2SessionId);
    });
  });

  describe("promoteMemberToStaff", () => {
    test("promoteMemberToStaff should successfully promote an active member to staff", async () => {
      const promotionResult = await staffService.promoteMemberToStaff(
        `${gymId}`,
        activeGymMember.id,
      );
      expect(promotionResult.ok).toBe(true);
      expect(promotionResult.status).toBe(200);
      if (promotionResult.ok) {
        expect(promotionResult.data.role).toBe("staff");
        expect(promotionResult.data.status).toBe("active");
        expect(promotionResult.data.isDeleted).toBe(false);
      }
    });

    test("promoteMemberToStaff should fail with 409 CONFLICT if member is already an active staff", async () => {
      const duplicatePromotionResult = await staffService.promoteMemberToStaff(
        `${gymId}`,
        activeGymMember.id,
      );
      expect(duplicatePromotionResult.ok).toBe(false);
      expect(duplicatePromotionResult.status).toBe(409);
    });

    test("promoteMemberToStaff should allow promoting a member to coach role", async () => {
      const [coachMember] = await connection
        .insert(members)
        .values({
          gymId,
          name: "Coach Trainee",
          phoneNumber: "+251977112233",
          status: "active",
        })
        .returning();

      const promotionResult = await staffService.promoteMemberToStaff(
        `${gymId}`,
        coachMember.id,
        "coach",
      );
      expect(promotionResult.ok).toBe(true);
      expect(promotionResult.status).toBe(200);
      if (promotionResult.ok) {
        expect(promotionResult.data.role).toBe("coach");
        expect(promotionResult.data.status).toBe("active");
        expect(promotionResult.data.isDeleted).toBe(false);
      }
    });

    test("promoteMemberToStaff should fail with 404 for non-existent member ID", async () => {
      const nonExistentPromotionResult =
        await staffService.promoteMemberToStaff(
          `${gymId}`,
          "00000000-0000-0000-0000-000000000000",
        );
      expect(nonExistentPromotionResult.ok).toBe(false);
      expect(nonExistentPromotionResult.status).toBe(404);
    });
  });

  describe("rehireStaff", () => {
    test("rehireStaff should restore archived staff, resetting isDeleted to false and status to active", async () => {
      // Ensure existingStaffCoach is soft-deleted
      await connection
        .update(gymStaff)
        .set({ isDeleted: true, status: "suspended" })
        .where(eq(gymStaff.id, existingStaffCoach.id));

      const rehireResult = await staffService.rehireStaff(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(rehireResult.ok).toBe(true);
      expect(rehireResult.status).toBe(200);
      if (rehireResult.ok) {
        expect(rehireResult.data.isDeleted).toBe(false);
        expect(rehireResult.data.status).toBe("active");
        expect(rehireResult.data.role).toBe("staff");
      }
    });

    test("rehireStaff should fail with 404 if staff member is not archived", async () => {
      // existingStaffCoach is now active, so rehire should fail with 404
      const rehireActiveStaffResult = await staffService.rehireStaff(
        `${gymId}`,
        existingStaffCoach.id,
      );
      expect(rehireActiveStaffResult.ok).toBe(false);
      expect(rehireActiveStaffResult.status).toBe(404);
    });
  });
});
