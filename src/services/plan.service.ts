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
      ok: false,
      error: {
        code: "CONFLICT",
        message: "membership already exists",
      },
      status: 409,
    };
  }

  const [newPlan] = await connection
    .insert(membershipPlans)
    .values(data)
    .returning();
  return { ok: true, data: newPlan, status: 201 };
};

export const getAllPlans = async () => {
  return {
    ok: true,
    data: await connection.select().from(membershipPlans),
    status: 200,
  };
};

export const getPlanById = async (id: string) => {
  const [plan] = await connection
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.id, id));

  if (!plan) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "no plan found with the given id",
      },
      status: 404,
    };
  }

  return { ok: true, data: plan, status: 200 };
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
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "no plan found with the given id",
      },
      status: 404,
    };
  }

  return { ok: true, data: plan, status: 200 };
};

export const deletePlan = async (id: string) => {
  const [deleted] = await connection
    .delete(membershipPlans)
    .where(eq(membershipPlans.id, id))
    .returning();

  if (!deleted) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "plan not found with the given id",
      },
      status: 404,
    };
  }

  return {
    ok: true,
    data: deleted,
    message: "successfully deletd membership plan",
    status: 200,
  };
};
