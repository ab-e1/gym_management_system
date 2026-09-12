import type { ContentfulStatusCode } from "hono/utils/http-status";
import { connection } from "../config/connection.ts";
import { membershipPlans } from "../db/schema.ts";
import { eq } from "drizzle-orm";

export const createPlan = async (data: {
  name: string;
  price: number;
  duration: number;
}) => {
  const [duplicate] = await connection
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.name, data.name));

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
    .values(data)
    .returning();
  return {
    ok: true as const,
    data: newPlan,
    status: 201 as ContentfulStatusCode,
  };
};

export const getAllPlans = async () => {
  return {
    ok: true as const,
    data: (await connection.select().from(membershipPlans)) || null,
    status: 200 as ContentfulStatusCode,
  };
};

export const getPlanById = async (id: string) => {
  const [plan] = await connection
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.id, id));

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
  id: string,
  data: { name?: string; price?: number; duration?: number },
) => {
  const [plan] = await connection
    .update(membershipPlans)
    .set(data)
    .where(eq(membershipPlans.id, id))
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

export const deletePlan = async (id: string) => {
  const [deleted] = await connection
    .delete(membershipPlans)
    .where(eq(membershipPlans.id, id))
    .returning();

  if (!deleted) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "plan not found with the given id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  return {
    ok: true as const,
    data: deleted,
    message: "successfully deletd membership plan",
    status: 200 as ContentfulStatusCode,
  };
};
