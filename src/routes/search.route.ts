import { Hono } from "hono";
import { omnibarSearchController } from "../controllers/search.controller.ts";
import { requiredAuth, requiredRole } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { searchOmnibarSchema } from "../schema/search.schema.ts";

const searchRoute = new Hono();

searchRoute.use(
  "*",
  requiredAuth,
  requiredRole("owner", "admin", "staff", "coach"),
);

searchRoute.get(
  "/omnibar",
  validate(searchOmnibarSchema, "query"),
  omnibarSearchController,
);

searchRoute.get(
  "/",
  validate(searchOmnibarSchema, "query"),
  omnibarSearchController,
);

export default searchRoute;
