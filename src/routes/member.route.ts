import { requiredRole, requiredAuth } from "../middleware/auth.middleware.ts";
import * as memberController from "../controllers/member.controller.ts";
import { Hono } from "hono";

const memberRoute = new Hono();

memberRoute.use("*", requiredAuth);

memberRoute.get(
  "/",
  requiredAuth,
  requiredRole("owner", "staff"),
  memberController.getAllMembers,
);
memberRoute.get(
  "/:id",
  requiredRole("owner", "staff"),
  memberController.getMemberById,
);

memberRoute.post(
  "/",
  requiredRole("owner", "staff"),
  memberController.createMember,
);

memberRoute.patch(
  "/:id",
  requiredRole("owner", "staff"),
  memberController.updateMember,
);

memberRoute.delete(
  "/id",
  requiredRole("owner", "staff"),
  memberController.deleteMemberToggle,
);

export default memberRoute;
