import type { Context, Next } from "hono";
import type { ZodSchema } from "zod";
import { failure } from "../utils/response.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const validate = (
  schema: ZodSchema,
  target: "body" | "query" = "body",
) => {
  return async (c: Context, next: Next) => {
    const input =
      target === "query" ? c.req.query() : await c.req.json().catch(() => ({}));
    const result = schema.safeParse(input);

    if (!result.success) {
      return failure(
        c,
        {
          code: "INPUT_VALIDATION_ERROR",
          message: result.error.issues[0].message,
        },
        400 as ContentfulStatusCode,
      );
    }
    c.set("validData", result.data);
    await next();
  };
};

