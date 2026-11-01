import { describe, test, expect } from "bun:test";
import { searchOmnibarSchema } from "../../../schema/search.schema.ts";

describe("searchOmnibarSchema Unit Tests", () => {
  test("should pass with a valid phone number query and default limit", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "0911223344",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("0911223344");
      expect(result.data.limit).toBe(5);
    }
  });

  test("should pass with a valid name query and custom limit", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "Dawit Bekele",
      limit: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("Dawit Bekele");
      expect(result.data.limit).toBe(10);
    }
  });

  test("should trim surrounding whitespace from query", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "   0911223344   ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("0911223344");
    }
  });

  test("should coerce string limit to integer", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "Dawit",
      limit: "15",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(15);
    }
  });

  test("should fail if query is missing", () => {
    const result = searchOmnibarSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("query parameter is required");
    }
  });

  test("should fail if query is only whitespace", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "     ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("query must be at least 1 character");
    }
  });

  test("should fail if query exceeds 50 characters", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "a".repeat(51),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("query cannot exceed 50 characters");
    }
  });

  test("should fail if limit is less than 1", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "Dawit",
      limit: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("limit must be at least 1");
    }
  });

  test("should fail if limit exceeds 20", () => {
    const result = searchOmnibarSchema.safeParse({
      query: "Dawit",
      limit: 25,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("limit cannot exceed 20");
    }
  });
});
