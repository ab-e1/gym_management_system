import crypto from "node:crypto";
import { otpHmacSecret } from "../config/env.ts";

if (!otpHmacSecret) {
  throw new Error("OTP_HMAC_SECRET must be configured");
}
const hmacSecret: string = otpHmacSecret; // filtering the thestring response from the undefined one

export const generateOtp = (): string => {
  return crypto.randomInt(100_000, 1_000_000).toString();
};

export const hashOtp = (otp: string): string => {
  return crypto
    .createHmac("sha256", hmacSecret)
    .update(otp.trim())
    .digest("hex");
};

export const verifyOtp = (inputOtp: string, storedHash: string): boolean => {
  const inputOtpHash = hashOtp(inputOtp);
  return timingSafeEqual(inputOtpHash, storedHash);
};

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
