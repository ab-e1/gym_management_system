import { payments, memberships } from "../db/schema.ts";
import { connection } from "../config/connection.ts";
import { eq, and } from "drizzle-orm";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isValidUUID } from "../utils/helpers.ts";

export type DbOrTx =
  | typeof connection
  | Parameters<Parameters<typeof connection.transaction>[0]>[0];

export const recordPayment = async (
  gymId: string,
  membershipId: string,
  staffId: string,
  data: {
    amount: number;
    paymentMethod: "cash" | "telebirr" | "bank";
    referenceCode?: string;
  },
  db: DbOrTx = connection,
) => {
  // 1. Guard against invalid UUID syntax
  if (!isValidUUID(membershipId)) {
    return {
      ok: false as const,
      error: {
        code: "BAD_REQUEST",
        message: "Invalid membership UUID format",
      },
      status: 400 as ContentfulStatusCode,
    };
  }

  // 2. Multi-tenant boundary check: verify membership exists and belongs to this gym context
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.gymId, gymId)));

  if (!membership) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Membership not found in this gym context",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  // 3. Atomically record payment ledger entry
  const [newMembershipPayment] = await db
    .insert(payments)
    .values({
      gymId,
      membershipId,
      recordedBy: staffId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      referenceCode: data.referenceCode,
      paidAt: new Date(),
    })
    .returning();

  return {
    ok: true as const,
    data: newMembershipPayment,
    status: 201 as ContentfulStatusCode,
  };
};
