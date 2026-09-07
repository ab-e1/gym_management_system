import { Hono } from "hono";
import { logger } from "hono/logger";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => {
  return c.json({ ok: true, uptime: process.uptime() });
});

// erros handeling
//
app.onError((err, c) => {
  console.log(err);
  return c.json(
    {
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
        code: "NOT_FOUND",
        message: `Path${c.req.path} not not found`,
      },
    },
    404,
  );
});
export default app;
