import { z } from "zod";
import { phoneSchema, emailSchema } from "./common.schema.ts";

export const createMemberSchema = z.object({
  name: z.string().min(1, "name can not be empty"),
  phoneNumber: phoneSchema,
  email: emailSchema.optional(),
});

export const updateMemberSchema = z.object({
  name: z.string().optional(),
  phoneNumber: phoneSchema.optional(),
  email: emailSchema.optional(),
  status: z.enum(["active", "inactive", "banned"]).optional(),
});

export { paginationQuerySchema } from "./common.schema.ts";
