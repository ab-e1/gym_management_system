import { describe, test, expect, beforeAll } from "bun:test";
import * as planSevices from "../../services/plan.service.ts";
import { connection } from "../../config/connection.ts";
import { membershipPlans } from "../../db/schema.ts";

describe("plan service integration tests", () => {
  let createdPlanId: string;

  beforeAll(async () => {
    await connection.delete(membershipPlans);
  });

  test("plan should be created with valid data", async () => {
    const result = await planSevices.createPlan({
      name: "basic membership",
      price: 2500,
      duration: 30,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.name).toBe("basic membership");
      expect(result.data.id).toBeDefined();
      createdPlanId = result.data.id;
    }
  });
  test("plan should get a plan with valid data", async () => {
    const result = await planSevices.getPlanById(createdPlanId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.id).toBe(createdPlanId);
    }
  });
  test("plan should fail with invalid id", async () => {
    const result = await planSevices.getPlanById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  test("plan should get updated with a valid id prvided", async () => {
    const result = await planSevices.updatePlan(createdPlanId, {
      name: "gold membership",
      price: 3000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.data?.name).toBe("gold membership");
      expect(result.data?.price).toBe(3000);
    }
  });

  test("plan should fail to when provided with invalid id", async () => {
    const result = await planSevices.updatePlan(
      "00000000-0000-0000-0000-000000000000",
      {
        name: "gotora membership",
        price: 1000,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
  test("plan should get all data", async () => {
    const result = await planSevices.getAllPlans();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
    }
  });

  //new feature with tdd

  test("plan should fail to create if a duplicate name exists", async () => {
    await planSevices.createPlan({
      name: "test duplicate",
      price: 3000,
      duration: 30,
    });
    const result = await planSevices.createPlan({
      name: "test duplicate",
      price: 3000,
      duration: 30,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.status).toBe(409);
    }
  });

  test("plan should be pass whne getting deleted with valid id", async () => {
    const result = await planSevices.deletePlan(createdPlanId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
    }
  });

  test("plan should fail when deleting with invalid id", async () => {
    const result = await planSevices.deletePlan(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.status).toBe(404);
    }
  });
});
