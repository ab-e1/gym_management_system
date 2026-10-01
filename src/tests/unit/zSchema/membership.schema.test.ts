import { describe, test, expect } from "bun:test";
import {
  createMembershipSchema,
  updateMembershipStatusSchema,
  membershipQuerySchema,
} from "../../../schema/membership.schema.ts";

describe("membership Zod schema unit tests", () => {
  const validUserUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validPlanUUID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

  describe("createMembershipSchema", () => {
    test("should pass with valid UUIDs for userId and planId", () => {
      const result = createMembershipSchema.safeParse({
        userId: validUserUUID,
        planId: validPlanUUID,
      });
      expect(result.success).toBe(true);
    });

    test("should pass with optional valid startDate ISO string", () => {
      const result = createMembershipSchema.safeParse({
        userId: validUserUUID,
        planId: validPlanUUID,
        startDate: "2026-10-01T00:00:00.000Z",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startDate).toBeInstanceOf(Date);
      }
    });

    test("should fail if userId is not a valid UUID", () => {
      const result = createMembershipSchema.safeParse({
        userId: "invalid-user-uuid",
        planId: validPlanUUID,
      });
      expect(result.success).toBe(false);
    });

    test("should fail if planId is not a valid UUID", () => {
      const result = createMembershipSchema.safeParse({
        userId: validUserUUID,
        planId: "123456",
      });
      expect(result.success).toBe(false);
    });


    test("should fail if userId is missing", () => {
      const result = createMembershipSchema.safeParse({
        planId: validPlanUUID,
      });
      expect(result.success).toBe(false);
    });

    test("should fail if planId is missing", () => {
      const result = createMembershipSchema.safeParse({
        userId: validUserUUID,
      });
      expect(result.success).toBe(false);
    });

  });

  describe("updateMembershipStatusSchema", () => {
    test("should pass for valid status: active", () => {
      const result = updateMembershipStatusSchema.safeParse({
        status: "active",
      });
      expect(result.success).toBe(true);
    });

    test("should pass for valid status: expired", () => {
      const result = updateMembershipStatusSchema.safeParse({
        status: "expired",
      });
      expect(result.success).toBe(true);
    });

    test("should pass for valid status: cancelled", () => {
      const result = updateMembershipStatusSchema.safeParse({
        status: "cancelled",
      });
      expect(result.success).toBe(true);
    });

    test("should fail for unrecognized status value", () => {
      const result = updateMembershipStatusSchema.safeParse({
        status: "unknown_status",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("membershipQuerySchema", () => {
    test("should pass and assign default page 1 and limit 10", () => {
      const result = membershipQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
      }
    });

    test("should coerce string numbers for page and limit", () => {
      const result = membershipQuerySchema.safeParse({
        page: "2",
        limit: "25",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(25);
      }
    });

    test("should fail if page is 0 or negative", () => {
      const result = membershipQuerySchema.safeParse({
        page: 0,
      });
      expect(result.success).toBe(false);
    });

    test("should fail if limit exceeds 100", () => {
      const result = membershipQuerySchema.safeParse({
        limit: 150,
      });
      expect(result.success).toBe(false);
    });

    test("should pass with optional valid status and valid userId query", () => {
      const result = membershipQuerySchema.safeParse({
        status: "active",
        userId: validUserUUID,
      });
      expect(result.success).toBe(true);
    });


    test("should fail if userId query is an invalid UUID", () => {
      const result = membershipQuerySchema.safeParse({
        userId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });
  });
});
