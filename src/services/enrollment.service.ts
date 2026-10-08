// so this is enrollment endpoint where the whole registering a member , or enrolling a new maber is done with a a teanscation db
// why we make is teansactional is cuz we want evrything meaning registering a mmeber and ceating a mmebership to be one flow

import { connection } from "../config/connection.ts";
import { eq, and } from "drizzle-orm";
import { membershipPlans, users, memberships } from "../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { normalizePhoneNumber } from "../utils/helpers.ts";
import { recordPayment } from "./payment.service.ts";

export const enrollment = async (
  gymId: string,
  staffId: string,
  planId: string,
  userData: { name: string; phoneNumber: string; email?: string },
  paymentData: {
    paymentMethod: "cash" | "telebirr" | "bank";
    amount?: number;
    referenceCode?: string;
  },
) => {
  return await connection.transaction(async (tx) => {
    let duplicateEmail: any;
    let phone: any;
    let paymentAmount: number;
    phone = normalizePhoneNumber(userData.phoneNumber);
    const [planCheck] = await tx
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.gymId, gymId),
          eq(membershipPlans.id, planId),
          eq(membershipPlans.isDeleted, false),
        ),
      );
    if (!planCheck) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "no active plan id is found with the provided id",
        },
        status: 404 as ContentfulStatusCode,
      };
    }
    const [duplicateNumber] = await tx
      .select()
      .from(users)
      .where(and(eq(users.gymId, gymId), eq(users.phoneNumber, phone)));
    if (duplicateNumber) {
      return {
        ok: false as const,
        error: {
          code: "CONFLICT",
          message: "phone number is already in use/already exist",
        },
        status: 409 as ContentfulStatusCode,
      };
    }
    if (userData.email) {
      [duplicateEmail] = await tx
        .select()
        .from(users)
        .where(and(eq(users.gymId, gymId), eq(users.email, userData.email)));
      if (duplicateEmail) {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "email is already in use by another person",
          },
          status: 409 as ContentfulStatusCode,
        };
      }
    }
    if (paymentData.amount) {
      paymentAmount = paymentData.amount;
    } else {
      paymentAmount = planCheck.price;
    }

    const [newMember] = await tx
      .insert(users)
      .values({
        gymId: gymId,
        name: userData.name,
        phoneNumber: phone,
        email: userData.email,
        role: "member",
      })
      .returning();

    const now = new Date();

    const [newMembership] = await tx
      .insert(memberships)
      .values({
        gymId: gymId,
        planId: planId,
        userId: newMember.id,
        startDate: now,
        endDate: new Date(
          now.getTime() + planCheck.duration * 24 * 60 * 60 * 1000,
        ),
      })
      .returning();

    const newMembershipPayment = await recordPayment(
      gymId,
      newMembership.id,
      staffId,
      {
        paymentMethod: paymentData.paymentMethod,
        amount: paymentAmount,
        referenceCode: paymentData.referenceCode,
      },
      tx,
    );

    return {
      ok: true as const,
      data: { newMember, newMembership, newMembershipPayment },
      status: 201 as ContentfulStatusCode,
    };
  });
};
