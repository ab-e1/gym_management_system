// so this is enrollment endpoint where the whole registering a member , or enrolling a new maber is done with a a teanscation db
// why we make is teansactional is cuz we want evrything meaning registering a mmeber and ceating a mmebership to be one flow

import { connection } from "../config/connection.ts";
import { eq, and, ne } from "drizzle-orm";
import { membershipPlans, members, memberships } from "../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
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
    let paymentAmount: number;
    // Already normalized by phoneSchema at the request border.
    const phone = userData.phoneNumber;
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
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.phoneNumber, phone)));
    let memberId: string;
    let memberRecord: typeof members.$inferSelect;

    if (duplicateNumber) {
      if (duplicateNumber.status === "banned") {
        return {
          ok: false as const,
          error: {
            code: "FORBIDDEN",
            message:
              "This member was banned by management and cannot be enrolled.",
          },
          status: 403 as ContentfulStatusCode,
        };
      }

      if (duplicateNumber.isDeleted) {
        if (userData.email) {
          const [conflictingUser] = await tx
            .select({ id: members.id })
            .from(members)
            .where(
              and(
                eq(members.gymId, gymId),
                eq(members.email, userData.email),
                ne(members.id, duplicateNumber.id),
              ),
            );
          if (conflictingUser) {
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

        // Resurrect soft-deleted user in-place
        const [resurrected] = await tx
          .update(members)
          .set({
            name: userData.name,
            email: userData.email ?? duplicateNumber.email,
            isDeleted: false,
            status: "active",
          })
          .where(
            and(eq(members.gymId, gymId), eq(members.id, duplicateNumber.id)),
          )
          .returning();

        memberRecord = resurrected;
        memberId = resurrected.id;
      } else {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "phone number is already in use/already exist",
          },
          status: 409 as ContentfulStatusCode,
        };
      }
    } else {
      if (userData.email) {
        [duplicateEmail] = await tx
          .select()
          .from(members)
          .where(
            and(eq(members.gymId, gymId), eq(members.email, userData.email)),
          );
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

      const [newMember] = await tx
        .insert(members)
        .values({
          gymId: gymId,
          name: userData.name,
          phoneNumber: phone,
          email: userData.email,
          status: "active",
        })
        .returning();

      memberRecord = newMember;
      memberId = newMember.id;
    }

    if (paymentData.amount) {
      paymentAmount = paymentData.amount;
    } else {
      paymentAmount = planCheck.price;
    }

    const now = new Date();

    const [newMembership] = await tx
      .insert(memberships)
      .values({
        gymId: gymId,
        planId: planId,
        memberId: memberId,
        startDate: now,
        endDate: (() => {
          const d = new Date(
            now.getTime() + planCheck.duration * 24 * 60 * 60 * 1000,
          );
          d.setHours(23, 59, 59, 999);
          return d;
        })(),
      })
      .returning();

    const paymentResult = await recordPayment(
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

    if (!paymentResult.ok) {
      return paymentResult;
    }

    return {
      ok: true as const,
      data: {
        newMember: memberRecord,
        newMembership,
        newMembershipPayment: paymentResult.data,
      },
      status: 201 as ContentfulStatusCode,
    };
  });
};
