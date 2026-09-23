import type { Context } from "hono";
import * as memberServices from "../services/users/member.service.ts";
import { failure, success } from "../utils/response";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const createMember = async (c: Context) => {
  const body = c.get("validData");
  const result = await memberServices.createMember(body);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const getMemberById = async (c: Context) => {
  const id = c.req.param("id");

  if (!id) {
    return failure(
      c,
      {
        code: "BAD_REQUEST",
        message: "member id is required",
      },
      400 as ContentfulStatusCode,
    );
  }

  const result = await memberServices.getMemberById(id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const getAllMembers = async (c: Context) => {
  const page = Number(c.req.query("page"));
  const limit = Number(c.req.query("limit"));
  const search = c.req.query("search");

  const result = await memberServices.getAllMembers(page, limit, search);

  return success(c, result.data, result.status);
};

export const updateMember = async (c: Context) => {
  const id = c.req.param("id");
  const body = await c.get("validData");

  if (!id) {
    return failure(
      c,
      {
        code: "BAD_REQUEST",
        message: "member id is required",
      },
      400 as ContentfulStatusCode,
    );
  }

  const result = await memberServices.updateMember(id, body);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const deleteMemberToggle = async (c: Context) => {
  const id = c.req.param("id");
  if (!id) {
    return failure(
      c,
      {
        code: "BAD_REQUEST",
        message: "member id is required",
      },
      400 as ContentfulStatusCode,
    );
  }
  const result = await memberServices.deleteMemberToggle(id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data.message, result.status);
};
