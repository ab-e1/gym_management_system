import { requiredRole, requiredAuth } from "../middleware/auth.middleware.ts";
import * as memberController from "../controllers/member.controller.ts";
import { Hono } from "hono";
import { validate } from "../middleware/validate.middleware.ts";
import {
  createMemberSchema,
  updateMemberSchema,
  paginationQuerySchema,
} from "../schema/user.schema.ts";

const memberRoute = new Hono();

memberRoute.use("*", requiredAuth, requiredRole("owner", "staff"));

memberRoute.get(
  "/",
  validate(paginationQuerySchema, "query"),
  memberController.getAllMembers,
);
memberRoute.get("/:id", memberController.getMemberById);

memberRoute.post(
  "/",
  validate(createMemberSchema),
  memberController.createMember,
);

memberRoute.patch(
  "/:id",
  validate(updateMemberSchema),
  memberController.updateMember,
);

memberRoute.delete("/:id", memberController.deleteMemberToggle);

export default memberRoute;
