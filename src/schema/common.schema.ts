import { z } from "zod";
import { normalizePhoneNumber } from "../utils/helpers.ts";

// Normalizes to +251XXXXXXXXX. An invalid number fails validation here, so
// code past the request border always gets a normalized phone, never undefined.
export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePhoneNumber(value);
  if (!phone) {
    ctx.addIssue({
      code: "custom",
      message:
        "phoneNumber must be a valid Ethiopian phone number (+2519..., +2517..., 09..., 07...)",
    });
    return z.NEVER;
  }
  return phone;
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("invalid email address");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive("page must be >= 1").default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, "limit cannot exceed 100")
    .default(10),
  search: z.string().trim().max(100).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
