import { describe, test, expect, beforeAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import * as userService from "../../services/user.service.ts";
import { users } from "../../db/schema.ts";

describe("integration test for the user sevices", () => {
  let staffId: string;
  let memberId: string;

  beforeAll(async () => {
    await connection.delete(users);
  });

  test("creating member should pass when provided with a valid data", async () => {
    const result = await userService.createMember({
      name: "test user",
      phoneNumber: "+251911223344",
      email: "user@email.com",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(201);
    expect(result.data!.name).toBe("test user");
  });

  test("creating member should fail when given a duplicate data", async () => {
    const result = await userService.createMember({
      name: "test user",
      phoneNumber: "+251911223344",
      email: "user@email.com",
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error!.code).toBe("CONFLICT");
  });

  test("getting all member should pass with 200, with pagination", async () => {
    const result = await userService.getAllMembers(1, 20);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.totalMembers).toBeGreaterThanOrEqual(1);
    expect(result.pagination.limit).toBe(20);
  });

  test("getting a member with a valid id should pass with 200", async () => {
    const [newStaff] = await connection
      .insert(users)
      .values({
        name: "member test",
        phoneNumber: "+251911334444",
        email: "member@email.com",
        role: "member",
      })
      .returning();

    staffId = newStaff.id;

    const result = await userService.getMemberById(`${staffId}`);

    expect(result.ok).toBe(true);
    expect(result.data!.name).toBe("member test");
    expect(result.status).toBe(200);
  });

  test("getting a user by id should fail if porvided a wrong user id with a 404", async () => {
    const result = await userService.getMemberById(
      "00000000-0000-0000-0000-000000000000",
    );

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("NOT_FOUND");
    expect(result.status).toBe(404);
  });

  test("getting auser with valid id but if the user is a not a member it should fail with 404 not found", async () => {
    const [newStaff] = await connection
      .insert(users)
      .values({
        name: "staff",
        phoneNumber: "+251911224444",
        email: "staff@email.com",
        role: "staff",
      })
      .returning();

    staffId = newStaff.id;

    const result = await userService.getMemberById(`${staffId}`);

    expect(result.ok).toBe(false);
    expect(result.error!.code).toBe("NOT_FOUND");
    expect(result.status).toBe(404);
  });

  test("getting all members with valid number should pass with 200", async () => {
    const result = await userService.getAllMembers(1, 10, "0911334444");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  test("getting all members with wrong or non existing filter still should pass with 200", async () => {
    const result = await userService.getAllMembers(
      1,
      10,
      "nonn existing filter",
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual([]);
    expect(result.pagination.totalMembers).toBe(0);
  });

  test("updating member should pass with 200, and with avalid phone and email regex only", async () => {
    const [testUser] = await connection
      .insert(users)
      .values({
        name: "test user 1",
        phoneNumber: "+251922334455",
        email: "testUser1@email.com",
        role: "member",
      })
      .returning();
    memberId = testUser.id;
    const result = await userService.updateMember(`${memberId}`, {
      name: "updated test user 1",
      phoneNumber: "+251933224455",
      email: "updateduser@email.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phoneNumber).toBe("+251933224455");
      expect(result.status).toBe(200);
      expect(result.data.name).toBe("updated test user 1");
      expect(result.data.email).toBe("updateduser@email.com");
    }
  });

  test("update member should fail if provided with invalid id", async () => {
    const result = await userService.updateMember(
      "00000000-0000-0000-0000-000000000000",
      {
        name: "updated test user 1",
        phoneNumber: "+251988224455",
        email: "updatinguser@email.com",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  test("updating user should fail if the user is a staff", async () => {
    const result = await userService.updateMember(`${staffId}`, {
      name: "updated user",
      phoneNumber: "+251911112266",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.status).toBe(404);
    }
  });

  test("toggle should pass by changing isDeleted to true and false", async () => {
    const [member] = await connection
      .insert(users)
      .values({
        name: "test abebe",
        phoneNumber: "+251988998877",
        isDeleted: true,
      })
      .returning();
    const deletedMemberId = member.id;
    const result = await userService.deleteMemberToggle(`${deletedMemberId}`);

    expect(result.ok).toBe(true);
  });
  test("if provided with invalid id, delete toggle should fail with 404", async () => {
    const result = await userService.deleteMemberToggle(
      "00000000-0000-0000-0000-000000000000",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result?.status).toBe(404);
    }
  });
});
