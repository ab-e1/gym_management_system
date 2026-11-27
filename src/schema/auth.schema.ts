import { z } from "zod";
import { phoneSchema } from "./common.schema.ts";

const phonePreprocessor = (val: unknown) => {
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (!obj.phoneNumber && obj.phone) {
      return { ...obj, phoneNumber: obj.phone };
    }
  }
  return val;
};

export const sendOtpSchema = z.preprocess(
  phonePreprocessor,
  z.object({
    gymId: z.string().uuid("Invalid gym ID UUID"),
    phoneNumber: phoneSchema,
  }),
);

export const verifyOtpSchema = z.preprocess(
  phonePreprocessor,
  z.object({
    gymId: z.string().uuid("Invalid gym ID UUID"),
    phoneNumber: phoneSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "code must be a 6-digit numeric string"),
  }),
);

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
