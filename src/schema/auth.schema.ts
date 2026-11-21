import { z } from "zod";
import { normalizePhoneNumber } from "../utils/helpers.ts";

export const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

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
    phoneNumber: z
      .string()
      .trim()
      .regex(
        ethiopianPhoneRegex,
        "phoneNumber must be a valid Ethiopian phone number (+2519..., +2517..., 09..., 07...)",
      )
      .transform((val) => normalizePhoneNumber(val)!),
  }),
);

export const verifyOtpSchema = z.preprocess(
  phonePreprocessor,
  z.object({
    gymId: z.string().uuid("Invalid gym ID UUID"),
    phoneNumber: z
      .string()
      .trim()
      .regex(
        ethiopianPhoneRegex,
        "phoneNumber must be a valid Ethiopian phone number (+2519..., +2517..., 09..., 07...)",
      )
      .transform((val) => normalizePhoneNumber(val)!),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "code must be a 6-digit numeric string"),
  }),
);

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
