import { z } from "zod";
import { normalizePhoneNumber } from "../utils/helpers.ts";

const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

export const enrollmentSchema = z.object({
  planId: z.string().uuid("Invalid plan ID UUID"),
  userData: z.object({
    name: z.string().trim().min(1, "name cannot be empty"),
    phoneNumber: z
      .string()
      .regex(ethiopianPhoneRegex, "phoneNumber must be a valid ethiopian number")
      .transform(normalizePhoneNumber),
    email: z.string().email("invalid email address").optional(),
  }),
  paymentData: z.object({
    paymentMethod: z.enum(["cash", "telebirr", "bank"], {
      message: "paymentMethod must be cash, telebirr, or bank",
    }),
    amount: z
      .number()
      .int()
      .positive("amount must be a positive integer")
      .optional(),
    referenceCode: z.string().trim().min(1).optional(),
  }),
});

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
