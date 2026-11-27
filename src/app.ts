import { Hono } from "hono";
import { logger } from "hono/logger";
import { auth } from "./config/auth.ts";
import planRoute from "./routes/plan.route.ts";
import memberRoute from "./routes/member.route.ts";
import staffRoute from "./routes/staff.route.ts";
import membershipRoute from "./routes/membership.route.ts";
import enrollmentRoute from "./routes/enrollment.route.ts";
import searchRoute from "./routes/search.route.ts";
import { failure } from "./utils/response.ts";
import authRoutes from "./routes/auth.routes.ts";
import { errorHandler } from "./middleware/error.middleware.ts";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => {
  return c.json({ ok: true, uptime: process.uptime() });
});

app.route("/api/v1/auth", authRoutes);

app.all("/api/v1/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.route("/api/v1/plans", planRoute);

app.route("/api/v1/members", memberRoute);

app.route("/api/v1/staff", staffRoute);

app.route("/api/v1/membership", membershipRoute);

app.route("/api/v1/enrollment", enrollmentRoute);

app.route("/api/v1/search", searchRoute);

app.onError(errorHandler);

app.notFound((c) => {
  return failure(
    c,
    {
      code: "NOT_FOUND",
      message: `Path ${c.req.path} not found`,
    },
    404,
  );
});
export default app;
