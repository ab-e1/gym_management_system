import { success, failure } from "../utils/response.ts";
import type { Context } from "hono";
import * as planServices from "../services/plan.service.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const createPlan = async (c: Context) => {
  const body = c.get("validData");
  const gymId = c.get("gymId");
  const result = await planServices.createPlan(gymId, body);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const getAllPlans = async (c: Context) => {
  const { page, limit } = c.get("validData") ?? { page: 1, limit: 10 };
  const gymId = c.get("gymId");

  const result = await planServices.getAllPlans(gymId, page, limit);

  return success(c, result.data, result.status, {
    pagination: result.pagination,
  });
};

export const getPlanById = async (c: Context) => {
  const id = c.req.param("id");
  const gymId = c.get("gymId");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }
  const result = await planServices.getPlanById(gymId, id);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const updatePlan = async (c: Context) => {
  const data = c.get("validData");
  const id = c.req.param("id");
  const gymId = c.get("gymId");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await planServices.updatePlan(gymId, id, data);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const deletePlan = async (c: Context) => {
  const id = c.req.param("id");
  const gymId = c.get("gymId");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "plan Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await planServices.deletePlan(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};
