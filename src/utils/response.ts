import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const success = <T>(
  c: Context,
  data: T,
  statusCode: ContentfulStatusCode = 200,
  message?: string,
) => {
  return c.json(
    {
      ok: true,
      data,
      ...(message && { message }),
    },
    statusCode,
  );
};

export const failure = (
  c: Context,
  code: string,
  message: string,
  statusCode: ContentfulStatusCode = 400,
  description?: string,
) => {
  return c.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(description && { description }),
      },
    },
    statusCode,
  );
};
