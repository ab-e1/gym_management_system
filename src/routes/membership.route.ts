import { Hono } from "hono";
import * as membershipController from "../controllers/membership.controller.ts";
import { requiredAuth, requiredRole } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware.ts";
import {
  membershipQuerySchema,
  createMembershipSchema,
  updateMembershipStatusSchema,
} from "../schema/membership.schema";

const membershipRoute = new Hono();

membershipRoute.use("*", requiredAuth, requiredRole("owner", "staff"));

membershipRoute.get(
  "/",
  validate(membershipQuerySchema, "query"),
  membershipController.getAllMemberships,
);

membershipRoute.get("/:id", membershipController.getMembershipById);

membershipRoute.post(
  "/",
  validate(createMembershipSchema),
  membershipController.createMembership,
);

membershipRoute.patch(
  "/:id",
  validate(updateMembershipStatusSchema),
  membershipController.updateMembershipStatus,
);

membershipRoute.delete("/:id", membershipController.deleteMembershipToggle);

export default membershipRoute;
