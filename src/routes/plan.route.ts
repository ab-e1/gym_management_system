import { requiredAuth, requiredRole } from "../middleware/auth.middleware.ts";
import { updatePlanSchema, planSchema } from "../schema/plan.schema.ts";
import * as planController from "../controllers/plan.controller.ts";
import { validate } from "../middleware/validate.middleware.ts";

import { Hono } from "hono";

const planRoute = new Hono();

//get request
//
planRoute.get(
  "/",
  requiredAuth,
  requiredRole("owner", "staff"),
  planController.getAllPlans,
);
planRoute.get(
  "/:id",
  requiredAuth,
  requiredRole("owner", "staff"),
  planController.getPlanById,
);

//post request (create plan)

planRoute.post(
  "/",
  requiredAuth,
  requiredRole("owner"),
  validate(planSchema),
  planController.createPlan,
);

// patch request (update the membership)

planRoute.patch(
  "/:id",
  requiredAuth,
  requiredRole("owner"),
  validate(updatePlanSchema),
  planController.updatePlan,
);

//delete request (dleeteing a plan)

planRoute.delete(
  "/:id",
  requiredAuth,
  requiredRole("owner"),
  planController.deletePlan,
);

export default planRoute;
