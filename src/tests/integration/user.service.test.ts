import { describe, test, expect, beforeAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import * as userService from "../../services/user.service.ts";
import { users } from "../../db/schema.ts";

describe("integration test for the user sevices", () => {
  let staffId: string;

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
        phoneNumber: "0911334444",
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
        phoneNumber: "0911224444",
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
});
