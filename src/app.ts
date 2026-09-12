import { Hono } from "hono";
import { logger } from "hono/logger";
import { auth } from "./config/auth.ts";
import planRoute from "./routes/plan.route.ts";
const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => {
  return c.json({ ok: true, uptime: process.uptime() });
});

app.all("/api/v1/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.route("/api/v1/plans", planRoute);

// error handeling
//
//
//
app.onError((err, c) => {
  console.log(err);
  return c.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err.message || "Internal server error",
      },
    },
    500,
  );
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        ok: false,
        code: "NOT_FOUND",
        message: `Path ${c.req.path} not not found`,
      },
    },
    404,
  );
});
export default app;
