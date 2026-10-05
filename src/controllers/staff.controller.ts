import type { Context } from "hono";
import * as staffServices from "../services/users/staff.service.ts";
import { failure, success } from "../utils/response";

export const createStaff = async (c: Context) => {
  const body = c.get("validData");
  const gymId = c.get("gymId");
  const result = await staffServices.createStaff(gymId, body);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const getAllStaff = async (c: Context) => {
  const { page, limit, search } = c.get("validData");
  const gymId = c.get("gymId");
  const result = await staffServices.getAllStaff(gymId, page, limit, search);

  return success(c, result.data, result.status, {
    pagination: result.pagination,
  });
};

export const getStaffById = async (c: Context) => {
  const id = String(c.req.param("id"));
  const gymId = c.get("gymId");
  const result = await staffServices.getStaffById(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const updateStaff = async (c: Context) => {
  const id = String(c.req.param("id"));
  const gymId = c.get("gymId");
  const body = c.get("validData");
  const result = await staffServices.updateStaff(gymId, id, body);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const deleteStaffToggle = async (c: Context) => {
  const id = String(c.req.param("id"));
  const gymId = c.get("gymId");
  const result = await staffServices.deleteStaffToggle(gymId, id);

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, { message: result.data.message }, result.status);
};

export const promoteMemberToStaff = async (c: Context) => {
  const id = String(c.req.param("id"));
  const gymId = c.get("gymId");

  const result = await staffServices.promoteMemberToStaff(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};

export const rehireStaff = async (c: Context) => {
  const id = String(c.req.param("id"));
  const gymId = c.get("gymId");

  const result = await staffServices.rehireStaff(gymId, id);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }
  return success(c, result.data, result.status);
};
