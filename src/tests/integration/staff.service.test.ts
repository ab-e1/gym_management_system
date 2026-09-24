import { describe, test, expect, beforeAll, afterAll } from "bun:test";

import { connection } from "../../config/connection";
import { users, sessions } from "../../db/schema";
import * as staffService from "../../services/users/staff.service.ts";

describe("integration test for the staff services", () => {
  afterAll(async () => {
    await connection.delete(users);
    await connection.delete(sessions);
  });

  let testStaff: any;
  let testMember: any;
  let testMemberDeleted: any;
  let testOwner: any;

  beforeAll(async () => {
    await connection.delete(sessions);
    await connection.delete(users);

    [testMember] = await connection
      .insert(users)
      .values({
        name: "test member1",
        phoneNumber: "+251922009977",
        role: "member",
      })
      .returning();

    [testMemberDeleted] = await connection
      .insert(users)
      .values({
        name: "test member already deleted",
        phoneNumber: "+251900990088",
        role: "member",
        isDeleted: true,
      })
      .returning();

    [testStaff] = await connection
      .insert(users)
      .values({
        name: "test staff1",
        phoneNumber: "+251912321453",
        role: "staff",
      })
      .returning();

    [testOwner] = await connection
      .insert(users)
      .values({
        name: "test owner1",
        phoneNumber: "+251944332288",
        role: "owner",
      })
      .returning();
  });

  describe("createStaff", () => {
    test("creating staff should pass when provided with valid data", async () => {
      const result = await staffService.createStaff({
        name: "test staff 1",
        phoneNumber: "+251911223355",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      if (result.ok) {
        expect(result.data.name).toBe("test staff 1");
      }
    });

    test("creating staff should fail if there is a duplicate active staff", async () => {
      const result = await staffService.createStaff({
        name: "test staff 2",
        phoneNumber: "+251911223355",
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      if (!result.ok) {
        expect(result.error.code).toBe("CONFLICT");
      }
    });

    test("creating staff should fail if phone is in use by an active member", async () => {
      const result = await staffService.createStaff({
        name: "test staff2",
        phoneNumber: testMember.phoneNumber,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      if (!result.ok) {
        expect(result.error.code).toBe("CONFLICT");
      }
    });

    test("creating staff should pass and reactivate if a member was soft deleted", async () => {
      const result = await staffService.createStaff({
        name: "used to be a member",
        phoneNumber: testMemberDeleted.phoneNumber,
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      if (result.ok) {
        expect(result.data.name).toBe("used to be a member");
        expect(result.data.role).toBe("staff");
        expect(result.data.isDeleted).toBe(false);
      }
    });
  });

  describe("getAllStaff", () => {
    test("getAllStaff should return a paginated list of staff members only", async () => {
      const result = await staffService.getAllStaff(1, 10);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      if (result.ok) {
        expect(result.data.length).toBeGreaterThanOrEqual(1);
        expect(result.pagination.totalStaff).toBeGreaterThanOrEqual(1);
        // Ensure no members or owners returned
        const hasNonStaff = result.data.some((u) => u.role !== "staff");
        expect(hasNonStaff).toBe(false);
      }
    });

    test("getAllStaff should filter results by search query", async () => {
      const result = await staffService.getAllStaff(1, 10, "test staff1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.length).toBe(1);
        expect(result.data[0].phoneNumber).toBe("+251912321453");
      }
    });
  });

  describe("getStaffById", () => {
    test("getStaffById should return staff details for valid staff ID", async () => {
      const result = await staffService.getStaffById(testStaff.id);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      if (result.ok) {
        expect(result.data.id).toBe(testStaff.id);
        expect(result.data.role).toBe("staff");
      }
    });

    test("getStaffById should fail with 404 for non-existent ID", async () => {
      const result = await staffService.getStaffById("00000000-0000-0000-0000-000000000000");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    test("getStaffById should fail with 404 if ID belongs to a non-staff user", async () => {
      const result = await staffService.getStaffById(testOwner.id);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateStaff", () => {
    test("updateStaff should update staff details successfully", async () => {
      const result = await staffService.updateStaff(testStaff.id, {
        name: "test staff1 updated",
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      if (result.ok) {
        expect(result.data.name).toBe("test staff1 updated");
      }
    });

    test("updateStaff should fail with 404 for non-existent staff ID", async () => {
      const result = await staffService.updateStaff("00000000-0000-0000-0000-000000000000", {
        name: "ghost staff",
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    test("updateStaff should fail with 409 if updating to a phone number already in use", async () => {
      const result = await staffService.updateStaff(testStaff.id, {
        phoneNumber: testMember.phoneNumber,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      if (!result.ok) {
        expect(result.error.code).toBe("CONFLICT");
      }
    });
  });

  describe("deleteStaffToggle", () => {
    test("deleteStaffToggle should soft delete active staff", async () => {
      const result = await staffService.deleteStaffToggle(testStaff.id);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    test("deleteStaffToggle should recover soft deleted staff on second call", async () => {
      const result = await staffService.deleteStaffToggle(testStaff.id);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    test("deleteStaffToggle should fail with 404 for non-existent staff ID", async () => {
      const result = await staffService.deleteStaffToggle("00000000-0000-0000-0000-000000000000");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });
  });
});

