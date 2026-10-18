import { z } from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(1, "name can not be empty"),
  price: z.int().positive("plan price should be greater than 0"),
  duration: z.int().positive("plan duration should be atleast 1 day"),
});

export const updatePlanSchema = planSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message:
      "At least one field(name, price, duration) must be provided to update",
  });

export { paginationQuerySchema } from "./common.schema.ts";
