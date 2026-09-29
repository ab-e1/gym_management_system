import type { ContentfulStatusCode } from "hono/utils/http-status";
import { connection } from "../config/connection.ts";
import { membershipPlans } from "../db/schema.ts";
import { and, count, eq } from "drizzle-orm";

export const createPlan = async (
  gymId: string,
  data: {
    name: string;
    price: number;
    duration: number;
  },
) => {
  const [duplicate] = await connection
    .select()
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.name, data.name),
        eq(membershipPlans.gymId, gymId),
      ),
    );

  if (duplicate && duplicate.isDeleted) {
    const [reactivated] = await connection
      .update(membershipPlans)
      .set({
        ...data,
        isDeleted: false,
      })
      .where(
        and(
          eq(membershipPlans.id, duplicate.id),
          eq(membershipPlans.gymId, gymId),
        ),
      )
      .returning();

    return {
      ok: true as const,
      data: reactivated,
      status: 201 as ContentfulStatusCode,
    };
  }

  if (duplicate) {
    return {
      ok: false as const,
      error: {
        code: "CONFLICT",
        message: "membership already exists",
      },
      status: 409 as ContentfulStatusCode,
    };
  }

  const [newPlan] = await connection
    .insert(membershipPlans)
    .values({
      name: data.name,
      gymId: gymId,
      price: data.price,
      duration: data.duration,
    })
    .returning();
  return {
    ok: true as const,
    data: newPlan,
    status: 201 as ContentfulStatusCode,
  };
};

export const getAllPlans = async (
  gymId: string,
  page: number = 1,
  limit: number = 10,
) => {
  const offset = (page - 1) * limit;
  const condition = and(
    eq(membershipPlans.isDeleted, false),
    eq(membershipPlans.gymId, gymId),
  );

  const [{ total }] = await connection
    .select({ total: count() })
    .from(membershipPlans)
    .where(condition);
  const totalCount = Number(total);

  const plan = await connection
    .select()
    .from(membershipPlans)
    .where(condition)
    .limit(limit)
    .offset(offset);

  return {
    ok: true as const,
    data: plan || [],
    pagination: {
      total: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getPlanById = async (gymId: string, id: string) => {
  const [plan] = await connection
    .select()
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.id, id),
        eq(membershipPlans.isDeleted, false),
        eq(membershipPlans.gymId, gymId),
      ),
    );

  if (!plan) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "no plan found with the given id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  return { ok: true as const, data: plan, status: 200 as ContentfulStatusCode };
};

export const updatePlan = async (
  gymId: string,
  id: string,
  data: { name?: string; price?: number; duration?: number },
) => {
  const [plan] = await connection
    .update(membershipPlans)
    .set(data)
    .where(
      and(
        eq(membershipPlans.id, id),
        eq(membershipPlans.isDeleted, false),
        eq(membershipPlans.gymId, gymId),
      ),
    )
    .returning();

  if (!plan) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "no plan found with the given id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  return { ok: true as const, data: plan, status: 200 as ContentfulStatusCode };
};

export const deletePlan = async (gymId: string, id: string) => {
  const [targetPlan] = await connection
    .select()
    .from(membershipPlans)
    .where(and(eq(membershipPlans.id, id), eq(membershipPlans.gymId, gymId)));

  if (!targetPlan) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "plan not found with the given id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  const newDeleteState = !targetPlan.isDeleted;

  const [updatedPlan] = await connection
    .update(membershipPlans)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(membershipPlans.id, id), eq(membershipPlans.gymId, gymId)))
    .returning();

  return {
    ok: true as const,
    data: {
      ...updatedPlan,
      message: newDeleteState
        ? "Plan soft-deleted successfully"
        : "Plan recovered successfully",
    },
    status: 200 as ContentfulStatusCode,
  };
};
