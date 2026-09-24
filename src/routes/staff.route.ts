import * as staffController from "../controllers/staff.controller.ts";
import { Hono } from "hono";
import { requiredAuth, requiredRole } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import {
  createMemberSchema,
  updateMemberSchema,
} from "../schema/user.schema.ts";

const staffRoute = new Hono();

staffRoute.use(requiredAuth, requiredRole("owner"));

staffRoute.get("/", staffController.getAllStaff);

staffRoute.get("/:id", staffController.getStaffById);

staffRoute.post("/", validate(createMemberSchema), staffController.createStaff);

staffRoute.patch(
  "/:id",
  validate(updateMemberSchema),
  staffController.updateStaff,
);

staffRoute.delete("/:id", staffController.deleteStaffToggle);

export default staffRoute;