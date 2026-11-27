import { z } from "zod";
import { gymStaffRoleEnum, gymStaffStatusEnum } from "../db/schema.ts";

export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    // Ownership is never assigned through the staff endpoints.
    role: z.enum(gymStaffRoleEnum.enumValues).exclude(["owner"]).optional(),
    status: z.enum(gymStaffStatusEnum.enumValues).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "provide at least one of: name, role, status",
  });

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
