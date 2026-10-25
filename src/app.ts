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

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => {
  return c.json({ ok: true, uptime: process.uptime() });
});

app.all("/api/v1/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.route("/api/v1/plans", planRoute);

app.route("/api/v1/members", memberRoute);

app.route("/api/v1/staff", staffRoute);

app.route("/api/v1/membership", membershipRoute);

app.route("/api/v1/enrollment", enrollmentRoute);

app.route("/api/v1/search", searchRoute);

// error handling
app.onError((err: any, c) => {
  if (
    err?.code === "22P02" ||
    err?.message?.includes("invalid input syntax for type uuid")
  ) {
    return failure(
      c,
      {
        code: "BAD_REQUEST",
        message: "Invalid UUID format in identifier",
      },
      400,
    );
  }

  console.log(err);
  return failure(
    c,
    {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message || "Internal server error",
    },
    500,
  );
});

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
