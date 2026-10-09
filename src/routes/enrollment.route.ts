import { Hono } from "hono";
import { enrollMember } from "../controllers/enrollment.controller.ts";
import { requiredAuth, requiredRole } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { enrollmentSchema } from "../schema/enrollment.schema.ts";

const enrollmentRoute = new Hono();

enrollmentRoute.use("*", requiredAuth, requiredRole("owner", "staff"));

enrollmentRoute.post("/", validate(enrollmentSchema), enrollMember);

export default enrollmentRoute;
