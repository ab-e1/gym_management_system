import { z } from "zod";

export const searchOmnibarSchema = z.object({
  query: z
    .string({ message: "query parameter is required" })
    .trim()
    .min(1, "query must be at least 1 character")
    .max(50, "query cannot exceed 50 characters"),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(20, "limit cannot exceed 20")
    .default(5),
});

export type SearchOmnibarInput = z.infer<typeof searchOmnibarSchema>;
