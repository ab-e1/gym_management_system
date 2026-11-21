import { checkOtpRateLimit, getClientIp } from "../utils/otpRatelimit.ts";
import * as login from "../services/auth/login.service.ts";
import type { Context } from "hono";
import { failure, success } from "../utils/response.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const sendOtp = async (c: Context) => {
  const ip = getClientIp(c.req.raw.headers);
  const { gymId, phoneNumber } = c.get("validData");

  const rateLimitResult = checkOtpRateLimit(ip, phoneNumber);

  if (!rateLimitResult.ok) {
    return failure(
      c,
      rateLimitResult.error,
      rateLimitResult.status as ContentfulStatusCode,
    );
  }
  const result = await login.sendOtp(gymId, phoneNumber);
  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};

export const verifyOtp = async (c: Context) => {
  const { gymId, phoneNumber, code } = c.get("validData");
  const ipAddress = getClientIp(c.req.raw.headers);
  const userAgent = c.req.header("user-agent") ?? undefined;

  const result = await login.verifyOtp(gymId, code, phoneNumber, {
    ipAddress,
    userAgent,
  });

  if (!result.ok) {
    return failure(c, result.error, result.status);
  }

  return success(c, result.data, result.status);
};
