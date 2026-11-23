import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  pagination?: Record<string, unknown>;
  message?: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    description?: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type TestResponse<T = any> = {
  ok: boolean;
  data: T;
  error: {
    code: string;
    message: string;
    description?: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
  };
  message?: string;
  pagination?: Record<string, unknown>;
};

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
    details?: Record<string, any>;
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
