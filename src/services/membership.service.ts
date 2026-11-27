import { and, count, desc, eq, gte, lt, or } from "drizzle-orm";
import { connection } from "../config/connection.ts";
import { membershipPlans, memberships, members } from "../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { DbOrTx } from "./payment.service.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a new membership starts. If the member still has an active membership,
 * the new one starts when it ends (renewal stacking), so paid days are never
 * lost. Otherwise it starts at `requestedStart`.
 * Used by every path that creates a membership (renewal and enrollment).
 */
export const resolveMembershipStartDate = async (
  db: DbOrTx,
  gymId: string,
  memberId: string,
  requestedStart: Date,
): Promise<Date> => {
  const [currentMembership] = await db
    .select({ endDate: memberships.endDate })
    .from(memberships)
    .where(
      and(
        eq(memberships.memberId, memberId),
        eq(memberships.gymId, gymId),
        eq(memberships.status, "active"),
        gte(memberships.endDate, new Date()),
        eq(memberships.isDeleted, false),
      ),
    )
    .orderBy(desc(memberships.endDate))
    .limit(1)
    .for("update");

  if (currentMembership) {
    return currentMembership.endDate;
  }
  return requestedStart;
};

/**
 * A membership ends at the last millisecond of its final day, so the member
 * keeps access all of that day. "End of day" uses the server's timezone.
 */
export const calculateMembershipEndDate = (
  startDate: Date,
  durationDays: number,
): Date => {
  const endDate = new Date(startDate.getTime() + durationDays * DAY_MS);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
};

export const createMembership = async (
  gymId: string,
  data: {
    userId: string;
    planId: string;
    startDate?: Date;
  },
) => {
  return await connection.transaction(async (tx) => {
    // 1. Validate target member exists in this gym
    const [targetUser] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, data.userId),
          eq(members.gymId, gymId),
          eq(members.isDeleted, false),
        ),
      )
      .for("update");

    if (!targetUser) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Active member not found with the provided userId",
        },
        status: 404 as ContentfulStatusCode,
      };
    }
    if (targetUser.status === "banned") {
      return {
        ok: false as const,
        error: {
          code: "FORBIDDEN",
          message:
            "User is banned. Contact the owner to resolve the issue before issuing a membership.",
        },
        status: 403 as ContentfulStatusCode,
      };
    }

    // 2. Validate target plan exists in this gym
    const [targetPlan] = await tx
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.id, data.planId),
          eq(membershipPlans.gymId, gymId),
          eq(membershipPlans.isDeleted, false),
        ),
      );

    if (!targetPlan) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Active membership plan not found with the provided planId",
        },
        status: 404 as ContentfulStatusCode,
      };
    }

    // 3. Renewal stacking: start after the member's current term, if any
    const startDate = await resolveMembershipStartDate(
      tx,
      gymId,
      data.userId,
      data.startDate ?? new Date(),
    );
    const endDate = calculateMembershipEndDate(startDate, targetPlan.duration);
    if (targetUser.status === "inactive") {
      await tx
        .update(members)
        .set({ status: "active" })
        .where(and(eq(members.id, data.userId), eq(members.gymId, gymId)));
    }

    const [newMembership] = await tx
      .insert(memberships)
      .values({
        gymId,
        memberId: data.userId,
        planId: data.planId,
        startDate,
        endDate,
        status: "active",
      })
      .returning();

    return {
      ok: true as const,
      data: newMembership,
      status: 201 as ContentfulStatusCode,
    };
  });
};

export const getAllMemberships = async (
  gymId: string,
  page: number = 1,
  limit: number = 10,
  statusFilter?: "active" | "expired" | "cancelled",
  userIdFilter?: string,
) => {
  const offset = (page - 1) * limit;
  const now = new Date();

  const conditions = [
    eq(memberships.gymId, gymId),
    eq(memberships.isDeleted, false),
  ];

  if (statusFilter) {
    if (statusFilter === "active") {
      conditions.push(
        eq(memberships.status, "active"),
        gte(memberships.endDate, now),
      );
    } else if (statusFilter === "expired") {
      const expiredCondition = or(
        eq(memberships.status, "expired"),
        and(eq(memberships.status, "active"), lt(memberships.endDate, now)),
      );
      if (expiredCondition) {
        conditions.push(expiredCondition);
      }
    } else {
      conditions.push(eq(memberships.status, statusFilter));
    }
  }

  if (userIdFilter) {
    conditions.push(eq(memberships.memberId, userIdFilter));
  }

  const filterCondition = and(...conditions);

  const [{ total }] = await connection
    .select({ total: count() })
    .from(memberships)
    .innerJoin(
      members,
      and(
        eq(memberships.memberId, members.id),
        eq(members.gymId, gymId),
        eq(members.isDeleted, false),
      ),
    )
    .leftJoin(
      membershipPlans,
      and(
        eq(memberships.planId, membershipPlans.id),
        eq(membershipPlans.gymId, gymId),
      ),
    )
    .where(filterCondition);

  const rawRecords = await connection
    .select({
      id: memberships.id,
      gymId: memberships.gymId,
      userId: memberships.memberId,
      memberName: members.name,
      memberPhone: members.phoneNumber,
      planId: memberships.planId,
      planName: membershipPlans.name,
      planPrice: membershipPlans.price,
      planDuration: membershipPlans.duration,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(
      members,
      and(
        eq(memberships.memberId, members.id),
        eq(members.gymId, gymId),
        eq(members.isDeleted, false),
      ),
    )
    .leftJoin(
      membershipPlans,
      and(
        eq(memberships.planId, membershipPlans.id),
        eq(membershipPlans.gymId, gymId),
      ),
    )
    .where(filterCondition)
    .orderBy(desc(memberships.createdAt))
    .limit(limit)
    .offset(offset);

  const records = rawRecords.map((membershipRecord) => {
    let computedStatus = membershipRecord.status;
    if (
      membershipRecord.status === "active" &&
      membershipRecord.endDate < now
    ) {
      computedStatus = "expired";
    }

    return {
      ...membershipRecord,
      status: computedStatus,
    };
  });

  const totalCount = Number(total);

  return {
    ok: true as const,
    data: records,
    pagination: {
      total: totalCount,
      totalMemberships: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getMembershipById = async (gymId: string, id: string) => {
  const now = new Date();

  const [rawRecord] = await connection
    .select({
      id: memberships.id,
      gymId: memberships.gymId,
      userId: memberships.memberId,
      memberName: members.name,
      memberPhone: members.phoneNumber,
      planId: memberships.planId,
      planName: membershipPlans.name,
      planPrice: membershipPlans.price,
      planDuration: membershipPlans.duration,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(
      members,
      and(
        eq(memberships.memberId, members.id),
        eq(members.gymId, gymId),
        eq(members.isDeleted, false),
      ),
    )
    .leftJoin(
      membershipPlans,
      and(
        eq(memberships.planId, membershipPlans.id),
        eq(membershipPlans.gymId, gymId),
      ),
    )
    .where(
      and(
        eq(memberships.id, id),
        eq(memberships.gymId, gymId),
        eq(memberships.isDeleted, false),
      ),
    );

  if (!rawRecord) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Membership not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  let computedStatus = rawRecord.status;
  if (rawRecord.status === "active" && rawRecord.endDate < now) {
    computedStatus = "expired";
  }

  const record = {
    ...rawRecord,
    status: computedStatus,
  };

  return {
    ok: true as const,
    data: record,
    status: 200 as ContentfulStatusCode,
  };
};

export const updateMembershipStatus = async (
  gymId: string,
  id: string,
  status: "active" | "expired" | "cancelled",
) => {
  const [record] = await connection
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, id),
        eq(memberships.gymId, gymId),
        eq(memberships.isDeleted, false),
      ),
    );

  if (!record) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Membership not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  const [updated] = await connection
    .update(memberships)
    .set({ status })
    .where(and(eq(memberships.id, id), eq(memberships.gymId, gymId)))
    .returning();

  return {
    ok: true as const,
    data: updated,
    status: 200 as ContentfulStatusCode,
  };
};

export const deleteMembershipToggle = async (gymId: string, id: string) => {
  const [record] = await connection
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, id), eq(memberships.gymId, gymId)));

  if (!record) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Membership not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  const newDeleteState = !record.isDeleted;

  await connection
    .update(memberships)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(memberships.id, id), eq(memberships.gymId, gymId)));

  return {
    ok: true as const,
    data: {
      message: newDeleteState
        ? "Membership soft-deleted successfully"
        : "Membership recovered successfully",
    },
    status: 200 as ContentfulStatusCode,
  };
};
