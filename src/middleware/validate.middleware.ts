import type { Context, Next } from "hono";
import type { ZodSchema } from "zod";
import { failure } from "../utils/response.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const validate = (schema: ZodSchema) => {
  return async (c: Context, next: Next) => {
    const body = await c.req.json().catch(() => ({}));
    const result = schema.safeParse(body);

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
    await next();
  };
};
