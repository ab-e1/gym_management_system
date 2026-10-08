import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import { enrollment } from "../../services/enrollment.service.ts";
import { gyms, membershipPlans, memberships, payments, users } from "../../db/schema";

describe("integration test for the enrollment service", async () => {
  let planId: string;
  let gymId: string;
  let staffId: string;
  const invalidId = "123e4567-e89b-12d3-a456-426614174000";
  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(users);
    await connection.delete(gyms);

    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "tolosa gym",
        slug: "toloda-test-gym",
      })
      .returning();
    gymId = testGym.id;

    const [testStaff] = await connection
      .insert(users)
      .values({
        gymId: gymId,
        name: "tolosa staff",
        phoneNumber: "+251911998877",
        email: "staff@tolosa.com",
        role: "staff",
      })
      .returning();
    staffId = testStaff.id;

    await connection
      .insert(users)
      .values({
        gymId: gymId,
        name: "tolosa's first member",
        phoneNumber: "+251922334455",
        email: "tolosa@email.com",
        role: "member",
      })
      .returning();

    const [testPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId: gymId,
        name: "tolosa's test membership plan",
        duration: 30,
        price: 2500,
      })
      .returning();

    planId = testPlan.id;
  });
  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  test("the integration test should fail if there is a duplicate number registered", async () => {
    const result = await enrollment(
      `${gymId}`,
      `${staffId}`,
      `${planId}`,
      {
        name: "nomasar",
        phoneNumber: "+251922334455",
        email: "other@email.com",
      },
      { amount: 2500, paymentMethod: "cash" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
  });

  test("test should create a member, membership, and payment if there is no duplicate", async () => {
    const result = await enrollment(
      `${gymId}`,
      `${staffId}`,
      `${planId}`,
      { name: "toloasadjb", phoneNumber: "+251943223344" },
      { amount: 2500, paymentMethod: "telebirr", referenceCode: "FT2610A87B92" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newMember.phoneNumber).toBe("+251943223344");
      expect(result.data.newMember.role).toBe("member");
      expect(result.data.newMembership.planId).toBe(planId);
      expect(result.data.newMembership.status).toBe("active");
      expect(result.data.newMembershipPayment.amount).toBe(2500);
      expect(result.data.newMembershipPayment.paymentMethod).toBe("telebirr");
      expect(result.data.newMembershipPayment.referenceCode).toBe("FT2610A87B92");
      expect(result.data.newMembershipPayment.recordedBy).toBe(staffId);
    }
  });

  test("test should fail if the email a user registers is not unique or has been used before", async () => {
    const result = await enrollment(
      `${gymId}`,
      `${staffId}`,
      `${planId}`,
      {
        name: "tolosas email",
        phoneNumber: "+251911776655",
        email: "tolosa@email.com",
      },
      { amount: 2500, paymentMethod: "cash" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
  });

  test("test should fail if there is no membership plan that is not soft deleted with the provided id", async () => {
    const result = await enrollment(
      `${gymId}`,
      `${staffId}`,
      `${invalidId}`,
      {
        name: "tolosas email",
        phoneNumber: "+251912996655",
        email: "tolosagonechild@email.com",
      },
      { amount: 2500, paymentMethod: "cash" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result?.error.code).toBe("NOT_FOUND");
    }
  });
});
