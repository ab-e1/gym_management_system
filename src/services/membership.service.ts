import { and, count, desc, eq, gte, lt, or } from "drizzle-orm";
import { connection } from "../config/connection.ts";
import { membershipPlans, memberships, users } from "../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
      .from(users)
      .where(
        and(
          eq(users.id, data.userId),
          eq(users.gymId, gymId),
          eq(users.role, "member"),
          eq(users.isDeleted, false),
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

    const now = new Date();

    // 3. Check for existing active membership for smart renewal stacking
    const [activeMembership] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, data.userId),
          eq(memberships.gymId, gymId),
          eq(memberships.status, "active"),
          gte(memberships.endDate, now),
          eq(memberships.isDeleted, false),
        ),
      )
      .orderBy(desc(memberships.endDate))
      .for("update");

    let startDate: Date;
    if (activeMembership) {
      // Stack renewal onto existing active plan's end date
      startDate = new Date(activeMembership.endDate);
    } else {
      startDate = data.startDate ?? now;
    }

    // Calculate endDate based on plan duration in days
    const endDate = new Date(
      startDate.getTime() + targetPlan.duration * 24 * 60 * 60 * 1000,
    );
    if (targetUser.status === "inactive") {
      await tx
        .update(users)
        .set({ status: "active" })
        .where(and(eq(users.id, data.userId), eq(users.gymId, gymId)));
    }

    const [newMembership] = await tx
      .insert(memberships)
      .values({
        gymId,
        userId: data.userId,
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
    conditions.push(eq(memberships.userId, userIdFilter));
  }

  const filterCondition = and(...conditions);

  const [{ total }] = await connection
    .select({ total: count() })
    .from(memberships)
    .where(filterCondition);

  const rawRecords = await connection
    .select({
      id: memberships.id,
      gymId: memberships.gymId,
      userId: memberships.userId,
      memberName: users.name,
      memberPhone: users.phoneNumber,
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
      users,
      and(
        eq(memberships.userId, users.id),
        eq(users.gymId, gymId),
        eq(users.isDeleted, false),
      ),
    )
    .innerJoin(
      membershipPlans,
      and(
        eq(memberships.planId, membershipPlans.id),
        eq(membershipPlans.gymId, gymId),
        eq(membershipPlans.isDeleted, false),
      ),
    )
    .where(filterCondition)
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
      userId: memberships.userId,
      memberName: users.name,
      memberPhone: users.phoneNumber,
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
      users,
      and(
        eq(memberships.userId, users.id),
        eq(users.gymId, gymId),
        eq(users.isDeleted, false),
      ),
    )
    .innerJoin(
      membershipPlans,
      and(
        eq(memberships.planId, membershipPlans.id),
        eq(membershipPlans.gymId, gymId),
        eq(membershipPlans.isDeleted, false),
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
