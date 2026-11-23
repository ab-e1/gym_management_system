import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  users,
  gymStaff,
  members,
  membershipPlans,
  memberships,
  payments,
} from "../../db/schema.ts";
import { recordPayment } from "../../services/payment.service.ts";

describe("Payment Service Integration Tests (TDD)", () => {
  let gym1Id: string;
  let gym2Id: string;
  let staffUserId: string;
  let gym1MembershipId: string;

  beforeAll(async () => {
    // Teardown cleanly in FK-safe reverse dependency order
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    // 1. Seed Gym 1
    const [gym1] = await connection
      .insert(gyms)
      .values({
        name: "Payment Test Gym 1",
        slug: "payment-test-gym-1",
      })
      .returning();
    gym1Id = gym1.id;

    // 2. Seed Gym 2 (for multi-tenant isolation testing)
    const [gym2] = await connection
      .insert(gyms)
      .values({
        name: "Payment Test Gym 2",
        slug: "payment-test-gym-2",
      })
      .returning();
    gym2Id = gym2.id;

    // 3. Seed Staff user
    const [staffUser] = await connection
      .insert(users)
      .values({
        name: "Cashier Staff",
        phoneNumber: "+251911002233",
      })
      .returning();
    staffUserId = staffUser.id;

    await connection.insert(gymStaff).values({
      gymId: gym1Id,
      userId: staffUserId,
      role: "staff",
      status: "active",
    });

    // 4. Seed Member at Gym 1
    const [member] = await connection
      .insert(members)
      .values({
        gymId: gym1Id,
        name: "Paying Member",
        phoneNumber: "+251922334455",
        status: "active",
      })
      .returning();

    // 5. Seed Membership Plan at Gym 1
    const [plan] = await connection
      .insert(membershipPlans)
      .values({
        gymId: gym1Id,
        name: "Monthly Gym 1 Plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    // 6. Seed Membership at Gym 1
    const [membership] = await connection
      .insert(memberships)
      .values({
        gymId: gym1Id,
        memberId: member.id,
        planId: plan.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active",
      })
      .returning();
    gym1MembershipId = membership.id;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  test("recordPayment should successfully record a valid payment for a membership belonging to the gym", async () => {
    const res = await recordPayment(gym1Id, gym1MembershipId, staffUserId, {
      amount: 2000,
      paymentMethod: "cash",
      referenceCode: "CASH-REC-001",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    if (res.ok) {
      expect(res.data.amount).toBe(2000);
      expect(res.data.membershipId).toBe(gym1MembershipId);
      expect(res.data.gymId).toBe(gym1Id);
      expect(res.data.recordedBy).toBe(staffUserId);
      expect(res.data.paymentMethod).toBe("cash");
      expect(res.data.referenceCode).toBe("CASH-REC-001");
    }
  });

  test("recordPayment should fail with 404 when attempting to record payment for another gym's membership (Cross-Tenant Boundary)", async () => {
    // Attempt to record payment under Gym 2 for Gym 1's membership
    const res = await recordPayment(gym2Id, gym1MembershipId, staffUserId, {
      amount: 2000,
      paymentMethod: "telebirr",
      referenceCode: "CROSS-TENANT-ATTEMPT",
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    if (!res.ok) {
      expect(res.error.code).toBe("NOT_FOUND");
      expect(res.error.message).toContain(
        "Membership not found in this gym context",
      );
    }

    // Verify no payment was created under Gym 2
    const gym2Payments = await connection
      .select()
      .from(payments)
      .where(eq(payments.gymId, gym2Id));
    expect(gym2Payments.length).toBe(0);
  });

  test("recordPayment should fail with 404 for non-existent membership UUID", async () => {
    const res = await recordPayment(
      gym1Id,
      "00000000-0000-0000-0000-000000000000",
      staffUserId,
      {
        amount: 1500,
        paymentMethod: "bank",
      },
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    if (!res.ok) {
      expect(res.error.code).toBe("NOT_FOUND");
    }
  });

  test("recordPayment should fail with 400 for malformed non-UUID membershipId", async () => {
    const res = await recordPayment(gym1Id, "invalid-not-uuid", staffUserId, {
      amount: 1500,
      paymentMethod: "bank",
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    if (!res.ok) {
      expect(res.error.code).toBe("BAD_REQUEST");
    }
  });
});
