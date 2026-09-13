import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const success = <T>(
  c: Context,
  data: T,
  statusCode: ContentfulStatusCode = 200,
  options?: {
    message?: string;
    pagination?: Record<string, any>;
  },
) => {
  return c.json(
    {
      ok: true,
      data,
      ...(options?.pagination && { pagination: options.pagination }),
      ...(options?.message && { message: options.message }),
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
