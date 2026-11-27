import { z } from "zod";
import { phoneSchema, emailSchema } from "./common.schema.ts";

export const enrollmentSchema = z.object({
  planId: z.string().uuid("Invalid plan ID UUID"),
  userData: z.object({
    name: z.string().trim().min(1, "name cannot be empty"),
    phoneNumber: phoneSchema,
    email: emailSchema.optional(),
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
