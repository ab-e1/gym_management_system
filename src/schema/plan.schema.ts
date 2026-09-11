import { z } from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(1, "name can not be empty"),
  price: z.number().positive("plan price should be greater than 0"),
  duration: z.number().positive("plan duration should be atleast 1 day"),
});
