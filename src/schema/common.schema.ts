import { z } from "zod";

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
