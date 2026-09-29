import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as planSevices from "../../services/plan.service.ts";
import { connection } from "../../config/connection.ts";
import { gyms, membershipPlans, memberships, users } from "../../db/schema.ts";
import { eq, and } from "drizzle-orm";

describe("plan service integration tests", () => {
  let createdPlanId: string;
  let gymTest: any;
  let gymId: string;

  beforeAll(async () => {
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(users);
    [gymTest] = await connection
      .insert(gyms)
      .values({
        name: "gym one test",
        slug: "gym_one_test_1",
      })
      .returning();

    gymId = gymTest.id;
  });

  //`${gymId}`
  test("plan should be created with valid data", async () => {
    const result = await planSevices.createPlan(`${gymId}`, {
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
    const result = await planSevices.getPlanById(`${gymId}`, createdPlanId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.id).toBe(createdPlanId);
    }
  });
  test("plan should fail with invalid id", async () => {
    const result = await planSevices.getPlanById(
      `${gymId}`,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  test("plan should get updated with a valid id prvided", async () => {
    const result = await planSevices.updatePlan(`${gymId}`, createdPlanId, {
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
      `${gymId}`,
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
    const result = await planSevices.getAllPlans(`${gymId}`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
    }
  });

  //new feature with tdd

  test("plan should fail to create if a duplicate name exists", async () => {
    await planSevices.createPlan(`${gymId}`, {
      name: "test duplicate",
      price: 3000,
      duration: 30,
    });
    const result = await planSevices.createPlan(`${gymId}`, {
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

  test("plan should be soft-deleted instead of hard deleted with valid id", async () => {
    const result = await planSevices.deletePlan(`${gymId}`, createdPlanId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
    }

    // Verify row still physically exists in database with isDeleted = true
    const [rawPlan] = await connection
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.id, createdPlanId),
          eq(membershipPlans.gymId, gymId),
        ),
      );

    expect(rawPlan).toBeDefined();
    expect((rawPlan as any).isDeleted).toBe(true);
  });

  test("soft-deleted plan should return 404 when requested via getPlanById", async () => {
    const result = await planSevices.getPlanById(`${gymId}`, createdPlanId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  test("soft-deleted plan should be excluded from getAllPlans", async () => {
    const result = await planSevices.getAllPlans(`${gymId}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const found = result.data.some((p: any) => p.id === createdPlanId);
      expect(found).toBe(false);
    }
  });

  test("deleting an already soft-deleted plan should recover/reactivate it (toggle)", async () => {
    const recoverResult = await planSevices.deletePlan(
      `${gymId}`,
      createdPlanId,
    );
    expect(recoverResult.ok).toBe(true);

    const [rawPlan] = await connection
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.id, createdPlanId),
          eq(membershipPlans.gymId, gymId),
        ),
      );

    expect((rawPlan as any).isDeleted).toBe(false);

    // Should now be retrievable again
    const getResult = await planSevices.getPlanById(`${gymId}`, createdPlanId);
    expect(getResult.ok).toBe(true);
  });

  test("soft-deleting a plan with an active membership reference should succeed without FK violation", async () => {
    // 1. Create a user
    const [user] = await connection
      .insert(users)
      .values({
        name: "FK Test Member",
        gymId: `${gymId}`,
        phoneNumber: "+251977112233",
        role: "member",
      })
      .returning();

    // 2. Create a plan
    const planRes = await planSevices.createPlan(`${gymId}`, {
      name: "FK Protected Plan",
      price: 1500,
      duration: 30,
    });
    expect(planRes.ok).toBe(true);
    const planId = (planRes as any).data.id;

    // 3. Create a membership referencing this plan
    await connection.insert(memberships).values({
      userId: user.id,
      gymId: `${gymId}`,
      planId: planId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "active",
    });

    // 4. Delete the plan - with soft delete, this succeeds! With hard delete, Postgres throws 23503 FK violation.
    const deleteRes = await planSevices.deletePlan(`${gymId}`, planId);
    expect(deleteRes.ok).toBe(true);
    if (deleteRes.ok) {
      expect(deleteRes.status).toBe(200);
    }

    const [persistedPlan] = await connection
      .select()
      .from(membershipPlans)
      .where(
        and(eq(membershipPlans.id, planId), eq(membershipPlans.gymId, gymId)),
      );

    expect(persistedPlan).toBeDefined();
    expect((persistedPlan as any).isDeleted).toBe(true);
  });

  test("plan should fail when deleting with invalid id", async () => {
    const result = await planSevices.deletePlan(
      `${gymId}`,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.status).toBe(404);
    }
  });

  afterAll(async () => {
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(users);
  });
});
