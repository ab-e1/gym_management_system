import { describe, test, expect } from "bun:test";
import { planSchema } from "../../schema/plan.schema";

describe("plan Zod schema validation", () => {
  test("should pass with valid plan data", () => {
    const input = {
      name: "tori lanez",
      price: 2000,
      duration: 30,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("should fail with price is negative", () => {
    const input = {
      name: "tori",
      price: -2,
      duration: 20,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("should fail if name is empty", () => {
    const input = {
      name: "",
      price: 10,
      duration: 30,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("should fail if duration is negative", () => {
    const input = {
      name: "tototo",
      price: 1000,
      duration: -30,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
  test("should fail if name is only a space", () => {
    const input = {
      name: " ",
      price: 1000,
      duration: 30,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("should fail if price is 0", () => {
    const input = {
      name: "tori",
      price: 0,
      duration: 30,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("should fail if duration is zero", () => {
    const input = {
      name: "tori",
      price: 10,
      duration: 0,
    };
    const result = planSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
