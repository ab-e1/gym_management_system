import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { DrizzleQueryError } from "drizzle-orm";
import { errorHandler } from "../../middleware/error.middleware.ts";

// Simulates what Drizzle throws: the driver error (with the Postgres `code`)
// is wrapped, and the wrapper's message contains the SQL and its parameters.
const drizzleError = (pgCode: string) =>
  new DrizzleQueryError(
    'update "gym_staff" set "status" = $1',
    ["banned"],
    Object.assign(new Error("driver error"), { code: pgCode }),
  );

const appThrowing = (err: Error) => {
  const app = new Hono();
  app.get("/", () => {
    throw err;
  });
  app.onError(errorHandler);
  return app;
};

describe("errorHandler (global error mapping)", () => {
  test("unwraps DrizzleQueryError: 22P02 (bad uuid / enum value) -> 400", async () => {
    const res = await appThrowing(drizzleError("22P02")).request("/");
    expect(res.status).toBe(400);
  });

  test("unwraps DrizzleQueryError: 23505 (unique violation) -> 409", async () => {
    const res = await appThrowing(drizzleError("23505")).request("/");
    const body = (await res.json()) as any;
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });

  test("never sends SQL to the client for a mapped database error", async () => {
    const res = await appThrowing(drizzleError("23505")).request("/");
    const text = await res.text();
    expect(text).not.toContain("gym_staff");
    expect(text).not.toContain("banned");
  });

  test("unmapped errors become 500 INTERNAL_SERVER_ERROR", async () => {
    const res = await appThrowing(new Error("boom")).request("/");
    const body = (await res.json()) as any;
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
