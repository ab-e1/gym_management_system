import { createMemberSchema } from "../../../schema/user.schema.ts";
import { describe, test, expect } from "bun:test";

describe("user schema unit test", () => {
  test("creating a user with a valid date should pass", () => {
    const input = {
      name: "test user",
      phoneNumber: "0922667788",
    };
    const result = createMemberSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("creating a user should fail, if phone is not provided", () => {
    const input = {
      name: "test user",
      email: "test@user.com",
    };
    const result = createMemberSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("creating a user should fail, if name is not provided", () => {
    const input = {
      phoneNumber: "0911223344",
      email: "test@user.com",
    };
    const result = createMemberSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("creating a user should fail, if phone is not in a valid regex(ethiopian phone number)", () => {
    const input = {
      name: "test user",
      phoneNumber: "0112233440",
      email: "test@user.com",
    };
    const result = createMemberSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("creating a user should fail, if phone is not in a valid regex(ethiopian phone number)", () => {
    const input = {
      name: "test user",
      phoneNumber: "+2519122",
      email: "test@user.com",
    };
    const result = createMemberSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
