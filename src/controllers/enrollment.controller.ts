import type { Context } from "hono";
import { failure, success } from "../utils/response.ts";
import { enrollment } from "../services/enrollment.service.ts";

export const enrollMember = async (c: Context) => {
  const gymId = c.get("gymId");
  const user = c.get("user");

  if (!user) {
    return failure(
      c,
      { code: "UN_AUTHORIZED", message: "User session required" },
      401,
    );
  }

  const staffId = user.id;
  const body = c.get("validData");

  const result = await enrollment(
    gymId,
    staffId,
    body.planId,
    body.userData,
    body.paymentData,
  );

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};
