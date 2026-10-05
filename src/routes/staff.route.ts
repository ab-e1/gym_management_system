import * as staffController from "../controllers/staff.controller.ts";
import { Hono } from "hono";
import { requiredAuth, requiredRole } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import {
  createMemberSchema,
  updateMemberSchema,
} from "../schema/user.schema.ts";
import { paginationQuerySchema } from "../schema/common.schema.ts";

const staffRoute = new Hono();

staffRoute.use("*", requiredAuth, requiredRole("owner"));

staffRoute.get(
  "/",
  validate(paginationQuerySchema, "query"),
  staffController.getAllStaff,
);

staffRoute.get("/:id", staffController.getStaffById);

staffRoute.post("/", validate(createMemberSchema), staffController.createStaff);

staffRoute.post("/:id/promote", staffController.promoteMemberToStaff);

staffRoute.post("/:id/rehire", staffController.rehireStaff);

staffRoute.patch(
  "/:id",
  validate(updateMemberSchema),
  staffController.updateStaff,
);

staffRoute.delete("/:id", staffController.deleteStaffToggle);

export default staffRoute;
