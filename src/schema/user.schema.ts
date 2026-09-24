import { z } from "zod";
import { normalizePhoneNumber } from "../utils/helpers.ts";

const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

export const createMemberSchema = z.object({
  name: z.string().min(1, "name can not be empty"),
  phoneNumber: z
    .string()
    .regex(ethiopianPhoneRegex, "phoneNumber must be a valid ethiopian number")
    .transform(normalizePhoneNumber),
  email: z.string().email("invalid email address").optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().optional(),
  phoneNumber: z
    .string()
    .regex(ethiopianPhoneRegex, "phone number must be a valid ethiopian number")
    .transform(normalizePhoneNumber)
    .optional(),
  email: z.string().email({ message: "invalid email address" }).optional(),
  status: z.string().optional(),
});

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
