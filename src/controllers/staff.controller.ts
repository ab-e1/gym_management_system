import type { Context } from "hono";
import * as staffServices from "../services/users/staff.service.ts";
import { failure, success } from "../utils/response";

export const createStaff = async (c: Context) => {
  const body = c.get("validData");
  const result = await staffServices.createStaff(body);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const getAllStaff = async (c: Context) => {
  const page = Number(c.req.query("page"));
  const limit = Number(c.req.query("limit"));
  const search = c.req.query("search");
  const result = await staffServices.getAllStaff(page, limit, search);

  return success(c, result.data, result.status);
};

export const getStaffById = async (c: Context) => {
  const id = String(c.req.param("id"));
  const result = await staffServices.getStaffById(id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const updateStaff = async (c: Context) => {
  const id = String(c.req.param("id"));
  const body = c.get("validData");
  const result = await staffServices.updateStaff(id, body);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const deleteStaffToggle = async (c: Context) => {
  const id = String(c.req.param("id"));
  const result = await staffServices.deleteStaffToggle(id);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};
