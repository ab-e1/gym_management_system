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
  error: {
    code: string;
    message: string;
    description?: string;
  },
  statusCode: ContentfulStatusCode = 400,
) => {
  return c.json(
    {
      ok: false,
      error,
    },
    statusCode,
  );
};
