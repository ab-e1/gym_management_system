import type { Context } from "hono";
import { failure, success } from "../utils/response.ts";
import * as membershipServices from "../services/membership.service.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const createMembership = async (c: Context) => {
  const body = c.get("validData");
  const gymId = c.get("gymId");

  const result = await membershipServices.createMembership(gymId, body);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const getAllMemberships = async (c: Context) => {
  const gymId = c.get("gymId");
  const query = c.get("validData");
  const result = await membershipServices.getAllMemberships(
    gymId,
    query.page,
    query.limit,
    query.status,
    query.userId,
  );

  return success(c, result.data, result.status, {
    pagination: result.pagination,
  });
};

export const getMembershipById = async (c: Context) => {
  const gymId = c.get("gymId");
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "membership Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await membershipServices.getMembershipById(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const updateMembershipStatus = async (c: Context) => {
  const gymId = c.get("gymId");
  const id = c.req.param("id");
  const body = c.get("validData");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "Membership ID is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await membershipServices.updateMembershipStatus(
    gymId,
    id,
    body.status,
  );

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const deleteMembershipToggle = async (c: Context) => {
  const gymId = c.get("gymId");
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      { code: "BAD_REQUEST", message: "membership Id is required" },
      400 as ContentfulStatusCode,
    );
  }

  const result = await membershipServices.deleteMembershipToggle(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};
