import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import { connection } from "../../config/connection";
import { users, sessions, gyms, memberships, payments } from "../../db/schema";
import * as staffService from "../../services/users/staff.service.ts";
import { eq } from "drizzle-orm";

describe("integration test for the staff services", () => {
  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(sessions);
    await connection.delete(users);
  });

  let existingStaffCoach: typeof users.$inferSelect;
  let activeGymMember: typeof users.$inferSelect;
  let archivedGymMember: typeof users.$inferSelect;
  let gymOwner: typeof users.$inferSelect;
  let gymId: string;

  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(sessions);
    await connection.delete(users);

    const [branchGym] = await connection
      .insert(gyms)
      .values({
        name: "Bole Training Branch",
        slug: "bole-training-branch",
      })
      .returning();

    gymId = branchGym.id;

    [activeGymMember] = await connection
      .insert(users)
      .values({
        name: "Yared Member",
        gymId: `${gymId}`,
        phoneNumber: "+251922009977",
        role: "member",
      })
      .returning();

    [archivedGymMember] = await connection
      .insert(users)
      .values({
        name: "Solomon Archived Member",
        gymId: `${gymId}`,
        phoneNumber: "+251900990088",
        role: "member",
        isDeleted: true,
      })
      .returning();

    [existingStaffCoach] = await connection
      .insert(users)
      .values({
        name: "Coach Berhanu",
        gymId: `${gymId}`,
        phoneNumber: "+251912321453",
        role: "staff",
      })
      .returning();

    [gymOwner] = await connection
      .insert(users)
      .values({
        name: "Owner Fitsum",
        gymId: `${gymId}`,
        phoneNumber: "+251944332288",
        role: "owner",
      })
      .returning();
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
        expect(conflictMemberResult.error.details?.memberId).toBe(activeGymMember.id);
      }
    });

    test("creating staff should fail even if member was soft-deleted and return memberId details", async () => {
      const conflictArchivedResult = await staffService.createStaff(`${gymId}`, {
        name: "Coach Impersonating Archived Member",
        phoneNumber: archivedGymMember.phoneNumber,
      });
      expect(conflictArchivedResult.ok).toBe(false);
      expect(conflictArchivedResult.status).toBe(409);
      if (!conflictArchivedResult.ok) {
        expect(conflictArchivedResult.error.code).toBe("CONFLICT");
        expect(conflictArchivedResult.error.details).toBeDefined();
        expect(conflictArchivedResult.error.details?.memberId).toBe(archivedGymMember.id);
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
        const hasNonStaff = listStaffResult.data.some((u) => u.role !== "staff");
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
      const fetchStaffResult = await staffService.getStaffById(`${gymId}`, existingStaffCoach.id);
      expect(fetchStaffResult.ok).toBe(true);
      expect(fetchStaffResult.status).toBe(200);
      if (fetchStaffResult.ok) {
        expect(fetchStaffResult.data.id).toBe(existingStaffCoach.id);
        expect(fetchStaffResult.data.role).toBe("staff");
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
      const fetchOwnerAsStaffResult = await staffService.getStaffById(`${gymId}`, gymOwner.id);
      expect(fetchOwnerAsStaffResult.ok).toBe(false);
      expect(fetchOwnerAsStaffResult.status).toBe(404);
      if (!fetchOwnerAsStaffResult.ok) {
        expect(fetchOwnerAsStaffResult.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateStaff", () => {
    test("updateStaff should update staff details successfully", async () => {
      const updateStaffResult = await staffService.updateStaff(`${gymId}`, existingStaffCoach.id, {
        name: "Coach Berhanu Updated",
      });
      expect(updateStaffResult.ok).toBe(true);
      expect(updateStaffResult.status).toBe(200);
      if (updateStaffResult.ok) {
        expect(updateStaffResult.data.name).toBe("Coach Berhanu Updated");
      }
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

    test("updateStaff should fail with 409 if updating to a phone number already in use", async () => {
      const updatePhoneConflictResult = await staffService.updateStaff(`${gymId}`, existingStaffCoach.id, {
        phoneNumber: activeGymMember.phoneNumber,
      });
      expect(updatePhoneConflictResult.ok).toBe(false);
      expect(updatePhoneConflictResult.status).toBe(409);
      if (!updatePhoneConflictResult.ok) {
        expect(updatePhoneConflictResult.error.code).toBe("CONFLICT");
      }
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
        id: "session-staff-test-id",
        userId: existingStaffCoach.id,
        token: "token-staff-test-xyz",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      });

      // Soft delete existingStaffCoach
      await staffService.deleteStaffToggle(`${gymId}`, existingStaffCoach.id);

      // Verify session was nuked
      const activeSessions = await connection
        .select()
        .from(sessions)
        .where(eq(sessions.userId, existingStaffCoach.id));

      expect(activeSessions.length).toBe(0);
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

    test("promoteMemberToStaff should fail with 404 for non-existent member ID", async () => {
      const nonExistentPromotionResult = await staffService.promoteMemberToStaff(
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
        .update(users)
        .set({ isDeleted: true, status: "inactive" })
        .where(eq(users.id, existingStaffCoach.id));

      const rehireResult = await staffService.rehireStaff(`${gymId}`, existingStaffCoach.id);
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
      const rehireActiveStaffResult = await staffService.rehireStaff(`${gymId}`, existingStaffCoach.id);
      expect(rehireActiveStaffResult.ok).toBe(false);
      expect(rehireActiveStaffResult.status).toBe(404);
    });
  });
});
