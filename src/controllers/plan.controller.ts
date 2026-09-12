import { success, failure } from "../utils/response.ts";
import type { Context } from "hono";
import * as planServices from "../services/plan.service.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const createPlan = async (c: Context) => {
  const body = await c.req.json();
  const result = await planServices.createPlan(body);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const getAllPlans = async (c: Context) => {
  const result = await planServices.getAllPlans();

  return success(c, result.data, result.status);
};

export const getPlanById = async (c: Context) => {
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }
  const result = await planServices.getPlanById(id);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const updatePlan = async (c: Context) => {
  const data = await c.req.json();
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await planServices.updatePlan(id, data);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const deletePlan = async (c: Context) => {
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await planServices.deletePlan(id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};
