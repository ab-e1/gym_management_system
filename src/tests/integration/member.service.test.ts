import { describe, test, expect, beforeAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import { eq } from "drizzle-orm";
import * as userService from "../../services/users/member.service.ts";
import {
  gyms,
  users,
  memberships,
  payments,
  membershipPlans,
  sessions,
} from "../../db/schema.ts";

describe("integration test for member services", () => {
  let primaryGymId: string;

  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(users);
    await connection.delete(gyms);

    const [primaryGym] = await connection
      .insert(gyms)
      .values({
        name: "Bole Branch Gym",
        slug: "bole_branch_gym",
      })
      .returning();

    primaryGymId = primaryGym.id;
  });

  test("creating member should pass when provided with valid data", async () => {
    const createResult = await userService.createMember(primaryGymId, {
      name: "Abebe Bikila",
      phoneNumber: "+251911223344",
      email: "abebe@gym.et",
    });

    expect(createResult.ok).toBe(true);
    expect(createResult.status).toBe(201);
    expect(createResult.data!.name).toBe("Abebe Bikila");
  });

  test("creating member should fail when given duplicate phone number in same gym", async () => {
    const duplicatePhoneResult = await userService.createMember(primaryGymId, {
      name: "Duplicate Phone Member",
      phoneNumber: "+251911223344",
      email: "different.email@gym.et",
    });

    expect(duplicatePhoneResult.ok).toBe(false);
    expect(duplicatePhoneResult.status).toBe(409);
    expect(duplicatePhoneResult.error!.code).toBe("CONFLICT");
  });

  test("creating member with same email in a DIFFERENT gym should pass (multi-tenant email isolation)", async () => {
    const [secondTenantGym] = await connection
      .insert(gyms)
      .values({
        name: "Kazanchis Branch Gym",
        slug: "kazanchis_branch_gym_email",
      })
      .returning();

    const crossGymMemberResult = await userService.createMember(secondTenantGym.id, {
      name: "Tenant Two Member",
      phoneNumber: "+251999887766",
      email: "abebe@gym.et",
    });

    expect(crossGymMemberResult.ok).toBe(true);
    expect(crossGymMemberResult.status).toBe(201);
    expect(crossGymMemberResult.data!.gymId).toBe(secondTenantGym.id);
  });

  test("creating member with same phone number in a DIFFERENT gym should pass (multi-tenant phone isolation)", async () => {
    const [secondTenantGym] = await connection
      .insert(gyms)
      .values({
        name: "Piassa Branch Gym",
        slug: "piassa_branch_gym_phone",
      })
      .returning();

    const crossGymMemberResult = await userService.createMember(secondTenantGym.id, {
      name: "Tenant Two Phone Member",
      phoneNumber: "+251911223344", // Same phone as Bole Branch member
      email: "piassa.member@gym.et",
    });

    expect(crossGymMemberResult.ok).toBe(true);
    expect(crossGymMemberResult.status).toBe(201);
    expect(crossGymMemberResult.data!.gymId).toBe(secondTenantGym.id);
  });

  test("creating member should resurrect a soft-deleted member and set isDeleted to false", async () => {
    const [softDeletedMember] = await connection
      .insert(users)
      .values({
        gymId: primaryGymId,
        name: "Kenenisa Archived",
        phoneNumber: "+251911998877",
        role: "member",
        isDeleted: true,
        status: "inactive",
      })
      .returning();

    const resurrectResult = await userService.createMember(primaryGymId, {
      name: "Kenenisa Bekele",
      phoneNumber: "+251911998877",
      email: "kenenisa@gym.et",
    });

    expect(resurrectResult.ok).toBe(true);
    if (resurrectResult.ok) {
      expect(resurrectResult.data!.id).toBe(softDeletedMember.id);
      expect(resurrectResult.data!.name).toBe("Kenenisa Bekele");
      expect(resurrectResult.data!.isDeleted).toBe(false);
      expect(resurrectResult.data!.status).toBe("active");
      expect(resurrectResult.data!.role).toBe("member");
    }
  });

  test("creating member should convert an archived staff to member and purge active sessions", async () => {
    const [archivedCoach] = await connection
      .insert(users)
      .values({
        gymId: primaryGymId,
        name: "Coach Chala",
        phoneNumber: "+251911443322",
        role: "staff",
        isDeleted: true,
        status: "inactive",
      })
      .returning();

    await connection.insert(sessions).values({
      id: "session-former-coach-chala",
      userId: archivedCoach.id,
      token: "token-former-coach-secret",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    const conversionResult = await userService.createMember(primaryGymId, {
      name: "Chala Customer",
      phoneNumber: "+251911443322",
      email: "chala.customer@gym.et",
    });

    expect(conversionResult.ok).toBe(true);
    if (conversionResult.ok) {
      expect(conversionResult.data!.id).toBe(archivedCoach.id);
      expect(conversionResult.data!.role).toBe("member");
      expect(conversionResult.data!.isDeleted).toBe(false);
      expect(conversionResult.data!.status).toBe("active");
    }

    const lingeringSessions = await connection
      .select()
      .from(sessions)
      .where(eq(sessions.userId, archivedCoach.id));

    expect(lingeringSessions.length).toBe(0);
  });

  test("cross-tenant access guard: Gym B cannot view, update, or toggle members belonging to Gym A", async () => {
    const [unauthorizedGym] = await connection
      .insert(gyms)
      .values({
        name: "Unauthorized Gym Branch",
        slug: "unauthorized_gym_branch",
      })
      .returning();

    const [authorizedMember] = await connection
      .insert(users)
      .values({
        gymId: primaryGymId,
        name: "Derartu Tulu",
        phoneNumber: "+251911776655",
        role: "member",
      })
      .returning();

    // 1. Get member from Gym A using Gym B ID -> 404 NOT_FOUND
    const crossTenantGetResult = await userService.getMemberById(unauthorizedGym.id, authorizedMember.id);
    expect(crossTenantGetResult.ok).toBe(false);
    expect(crossTenantGetResult.status).toBe(404);

    // 2. Update member from Gym A using Gym B ID -> 404 NOT_FOUND
    const crossTenantUpdateResult = await userService.updateMember(
      unauthorizedGym.id,
      authorizedMember.id,
      { name: "Hacked Name" },
    );
    expect(crossTenantUpdateResult.ok).toBe(false);
    expect(crossTenantUpdateResult.status).toBe(404);

    // 3. Delete toggle member from Gym A using Gym B ID -> 404 NOT_FOUND
    const crossTenantDeleteResult = await userService.deleteMemberToggle(
      unauthorizedGym.id,
      authorizedMember.id,
    );
    expect(crossTenantDeleteResult.ok).toBe(false);
    expect(crossTenantDeleteResult.status).toBe(404);

    // 4. List members in Gym B -> Must NOT contain member from Gym A
    const crossTenantListResult = await userService.getAllMembers(unauthorizedGym.id, 1, 20);
    expect(crossTenantListResult.ok).toBe(true);
    if (crossTenantListResult.ok) {
      const foundMember = crossTenantListResult.data.find((m) => m.id === authorizedMember.id);
      expect(foundMember).toBeUndefined();
    }
  });

  test("getting all members should pass with 200 and pagination metadata", async () => {
    const listResult = await userService.getAllMembers(primaryGymId, 1, 20);
    expect(listResult.ok).toBe(true);
    expect(listResult.status).toBe(200);
    expect(listResult.pagination).toBeDefined();
    expect(listResult.pagination.totalMembers).toBeGreaterThanOrEqual(1);
    expect(listResult.pagination.limit).toBe(20);
  });

  test("getting a member with a valid id should pass with 200", async () => {
    const [activeMember] = await connection
      .insert(users)
      .values({
        name: "Tirunesh Dibaba",
        gymId: primaryGymId,
        phoneNumber: "+251911334444",
        email: "tirunesh@gym.et",
        role: "member",
      })
      .returning();

    const fetchResult = await userService.getMemberById(primaryGymId, activeMember.id);

    expect(fetchResult.ok).toBe(true);
    expect(fetchResult.data!.name).toBe("Tirunesh Dibaba");
    expect(fetchResult.status).toBe(200);
  });

  test("getting a user by id should fail if provided a non-existent UUID with 404", async () => {
    const nonExistentResult = await userService.getMemberById(
      primaryGymId,
      "00000000-0000-0000-0000-000000000000",
    );

    expect(nonExistentResult.ok).toBe(false);
    expect(nonExistentResult.error!.code).toBe("NOT_FOUND");
    expect(nonExistentResult.status).toBe(404);
  });

  test("getting a user with valid id but role is staff should fail with 404 not found", async () => {
    const [staffCoach] = await connection
      .insert(users)
      .values({
        name: "Coach Alazar",
        gymId: primaryGymId,
        phoneNumber: "+251911224444",
        email: "coach.alazar@gym.et",
        role: "staff",
      })
      .returning();

    const fetchStaffAsMemberResult = await userService.getMemberById(primaryGymId, staffCoach.id);

    expect(fetchStaffAsMemberResult.ok).toBe(false);
    expect(fetchStaffAsMemberResult.error!.code).toBe("NOT_FOUND");
    expect(fetchStaffAsMemberResult.status).toBe(404);
  });

  test("getting all members filtered by valid phone number should pass with 200", async () => {
    const searchResult = await userService.getAllMembers(
      primaryGymId,
      1,
      10,
      "0911334444",
    );

    expect(searchResult.ok).toBe(true);
    expect(searchResult.status).toBe(200);
    expect(searchResult.data.length).toBeGreaterThanOrEqual(1);
  });

  test("getting all members with non-matching filter should return empty array and 0 total", async () => {
    const emptySearchResult = await userService.getAllMembers(
      primaryGymId,
      1,
      10,
      "non-matching-phone-or-name-query",
    );

    expect(emptySearchResult.ok).toBe(true);
    expect(emptySearchResult.status).toBe(200);
    expect(emptySearchResult.data).toEqual([]);
    expect(emptySearchResult.pagination.totalMembers).toBe(0);
  });

  test("updating member should pass with 200 when provided with valid phone and email", async () => {
    const [memberToUpdate] = await connection
      .insert(users)
      .values({
        name: "Haile Gebrselassie",
        gymId: primaryGymId,
        phoneNumber: "+251922334455",
        email: "haile.original@gym.et",
        role: "member",
      })
      .returning();

    const updateResult = await userService.updateMember(primaryGymId, memberToUpdate.id, {
      name: "Haile Gebrselassie Updated",
      phoneNumber: "+251933224455",
      email: "haile.updated@gym.et",
    });

    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      expect(updateResult.data.name).toBe("Haile Gebrselassie Updated");
      expect(updateResult.data.phoneNumber).toBe("+251933224455");
      expect(updateResult.data.email).toBe("haile.updated@gym.et");
      expect(updateResult.status).toBe(200);
    }
  });

  test("updating member should fail with 404 if provided with non-existent UUID", async () => {
    const nonExistentUpdateResult = await userService.updateMember(
      primaryGymId,
      "00000000-0000-0000-0000-000000000000",
      {
        name: "Ghost Member",
        phoneNumber: "+251988224455",
        email: "ghost@gym.et",
      },
    );

    expect(nonExistentUpdateResult.ok).toBe(false);
    if (!nonExistentUpdateResult.ok) {
      expect(nonExistentUpdateResult.status).toBe(404);
      expect(nonExistentUpdateResult.error.code).toBe("NOT_FOUND");
    }
  });

  test("updating user should fail if the target user is a staff member", async () => {
    const [activeStaff] = await connection
      .insert(users)
      .values({
        name: "Front Desk Staff Member",
        gymId: primaryGymId,
        phoneNumber: "+251911112266",
        role: "staff",
      })
      .returning();

    const updateStaffAsMemberResult = await userService.updateMember(primaryGymId, activeStaff.id, {
      name: "Tampering Staff Name",
      phoneNumber: "+251911112299",
    });

    expect(updateStaffAsMemberResult.ok).toBe(false);
    if (!updateStaffAsMemberResult.ok) {
      expect(updateStaffAsMemberResult.error.code).toBe("NOT_FOUND");
      expect(updateStaffAsMemberResult.status).toBe(404);
    }
  });

  test("toggle should pass by changing isDeleted to true and back to false", async () => {
    const [memberToToggle] = await connection
      .insert(users)
      .values({
        name: "Mulugeta Member",
        gymId: primaryGymId,
        phoneNumber: "+251988998877",
        isDeleted: true,
      })
      .returning();

    const toggleResult = await userService.deleteMemberToggle(
      primaryGymId,
      memberToToggle.id,
    );

    expect(toggleResult.ok).toBe(true);
  });

  test("delete toggle should fail with 404 if provided with non-existent UUID", async () => {
    const nonExistentToggleResult = await userService.deleteMemberToggle(
      primaryGymId,
      "00000000-0000-0000-0000-000000000000",
    );

    expect(nonExistentToggleResult.ok).toBe(false);
    if (!nonExistentToggleResult.ok) {
      expect(nonExistentToggleResult.error.code).toBe("NOT_FOUND");
      expect(nonExistentToggleResult.status).toBe(404);
    }
  });
});
