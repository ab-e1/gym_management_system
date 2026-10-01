import { z } from "zod";

export const createMembershipSchema = z.object({
  userId: z.string().uuid("userId must be a valid uuid string"),
  planId: z.string().uuid("planId must be a valid uuid string"),
  startDate: z.coerce.date().optional(),
});
export const updateMembershipStatusSchema = z.object({
  status: z.enum(["active", "expired", "cancelled"], {
    message: "status must be one of: active, expired, cancelled",
  }),
});
export const membershipQuerySchema = z.object({
  page: z.coerce.number().int().positive("page must be >= 1").default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, "limit cannot exceed 100")
    .default(10),
  status: z.enum(["active", "expired", "cancelled"]).optional(),
  userId: z.string().uuid("userId must be a valid UUID").optional(),
});
