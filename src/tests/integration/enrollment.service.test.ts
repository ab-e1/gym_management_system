import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { connection } from "../../config/connection.ts";
import { enrollment } from "../../services/enrollment.service.ts";
import * as paymentModule from "../../services/payment.service.ts";
import {
  gyms,
  gymStaff,
  members,
  membershipPlans,
  memberships,
  payments,
  users,
} from "../../db/schema.ts";

describe("integration test for the enrollment service", async () => {
  let planId: string;
  let gymId: string;
  let staffId: string;
  const invalidId = "123e4567-e89b-12d3-a456-426614174000";

  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(gymStaff);
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
        name: "tolosa staff",
        phoneNumber: "+251911998877",
        email: "staff@tolosa.com",
      })
      .returning();
    staffId = testStaff.id;

    await connection.insert(gymStaff).values({
      gymId,
      userId: staffId,
      role: "staff",
      status: "active",
    });

    await connection
      .insert(members)
      .values({
        gymId: gymId,
        name: "tolosa's first member",
        phoneNumber: "+251922334455",
        email: "tolosa@email.com",
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
    await connection.delete(members);
    await connection.delete(gymStaff);
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
      {
        amount: 2500,
        paymentMethod: "telebirr",
        referenceCode: "FT2610A87B92",
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newMember.phoneNumber).toBe("+251943223344");
      expect(result.data.newMembership.planId).toBe(planId);
      expect(result.data.newMembership.status).toBe("active");
      const endDateObj = new Date(result.data.newMembership.endDate);
      expect(endDateObj.getHours()).toBe(23);
      expect(endDateObj.getMinutes()).toBe(59);
      expect(endDateObj.getSeconds()).toBe(59);
      expect(result.data.newMembershipPayment.amount).toBe(2500);
      expect(result.data.newMembershipPayment.paymentMethod).toBe("telebirr");
      expect(result.data.newMembershipPayment.referenceCode).toBe(
        "FT2610A87B92",
      );
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

  test("test should resurrect soft-deleted member and create membership + payment", async () => {
    const [softDeleted] = await connection
      .insert(members)
      .values({
        gymId,
        name: "Old Archived Member",
        phoneNumber: "+251918273645",
        email: "old.archived@gym.et",
        isDeleted: true,
        status: "inactive",
      })
      .returning();

    const result = await enrollment(
      gymId,
      staffId,
      planId,
      {
        name: "Old Member Returning",
        phoneNumber: "+251918273645",
      },
      { amount: 2500, paymentMethod: "cash" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newMember.id).toBe(softDeleted.id);
      expect(result.data.newMember.isDeleted).toBe(false);
      expect(result.data.newMember.status).toBe("active");
      expect(result.data.newMembership.memberId).toBe(softDeleted.id);
      expect(result.data.newMembership.status).toBe("active");
      expect(result.data.newMembershipPayment.amount).toBe(2500);
    }
  });

  test("should stack a returning member's new term after the days they already paid for", async () => {
    const [archived] = await connection
      .insert(members)
      .values({
        gymId,
        name: "Archived With Days Left",
        phoneNumber: "+251917000111",
        isDeleted: true,
      })
      .returning();

    // Archiving does not cancel memberships: 19 paid days are still left.
    const paidUntil = new Date(Date.now() + 19 * 24 * 60 * 60 * 1000);
    await connection.insert(memberships).values({
      gymId,
      memberId: archived.id,
      planId,
      startDate: new Date(),
      endDate: paidUntil,
      status: "active",
    });

    const result = await enrollment(
      gymId,
      staffId,
      planId,
      { name: "Archived With Days Left", phoneNumber: "+251917000111" },
      { amount: 2500, paymentMethod: "cash" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new Date(result.data.newMembership.startDate).getTime()).toBe(
        paidUntil.getTime(),
      );
    }
  });

  test("should roll back the member and membership if recording the payment fails", async () => {
    // recordPayment can't fail in real use, so force it to.
    const paymentSpy = spyOn(paymentModule, "recordPayment").mockResolvedValueOnce({
      ok: false as const,
      error: { code: "NOT_FOUND", message: "forced failure" },
      status: 404,
    });

    try {
      await expect(
        enrollment(
          gymId,
          staffId,
          planId,
          { name: "Rolled Back Member", phoneNumber: "+251916000222" },
          { amount: 2500, paymentMethod: "cash" },
        ),
      ).rejects.toThrow("Enrollment payment failed");

      // Nothing from the failed enrollment was saved.
      const [member] = await connection
        .select()
        .from(members)
        .where(eq(members.phoneNumber, "+251916000222"));
      expect(member).toBeUndefined();
    } finally {
      paymentSpy.mockRestore();
    }
  });

  test("test should fail with 403 FORBIDDEN if the member attempting enrollment is banned", async () => {
    await connection.insert(members).values({
      gymId,
      name: "Banned Member Trying Enrollment",
      phoneNumber: "+251988776655",
      status: "banned",
    });

    const result = await enrollment(
      gymId,
      staffId,
      planId,
      {
        name: "Banned Member",
        phoneNumber: "+251988776655",
      },
      { amount: 2500, paymentMethod: "cash" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  test("test should fail with 409 CONFLICT if resurrecting soft-deleted member with email used by another user", async () => {
    // Insert a soft deleted member
    await connection.insert(members).values({
      gymId,
      name: "Soft Deleted With Separate Email",
      phoneNumber: "+251977112233",
      email: "original.resurrect@gym.et",
      isDeleted: true,
      status: "inactive",
    });

    // Attempt resurrection with email "tolosa@email.com" (which already belongs to tolosa's first member)
    const result = await enrollment(
      gymId,
      staffId,
      planId,
      {
        name: "Resurrected Member With Colliding Email",
        phoneNumber: "+251977112233",
        email: "tolosa@email.com",
      },
      { amount: 2500, paymentMethod: "cash" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.message).toBe(
        "email is already in use by another person",
      );
    }
  });
});
