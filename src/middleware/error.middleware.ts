import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DrizzleQueryError } from "drizzle-orm";
import { nodeEnv } from "../config/env.ts";
import { failure } from "../utils/response.ts";

/**
 * Postgres error codes we translate into client errors.
 * Full list: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_INVALID_TEXT_REPRESENTATION = "22P02"; // malformed uuid, unknown enum value
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

type ClientError = {
  status: ContentfulStatusCode;
  code: string;
  message: string;
};

const CLIENT_ERRORS: Record<string, ClientError> = {
  [PG_INVALID_TEXT_REPRESENTATION]: {
    status: 400,
    code: "BAD_REQUEST",
    message: "A value in the request has an invalid format",
  },
  [PG_UNIQUE_VIOLATION]: {
    status: 409,
    code: "CONFLICT",
    message: "A record with the same unique value already exists",
  },
  [PG_FOREIGN_KEY_VIOLATION]: {
    status: 409,
    code: "CONFLICT",
    message: "The request references a record that does not exist or is in use",
  },
};

/**
 * Drizzle (>= 0.44) wraps every driver error in a DrizzleQueryError whose
 * message contains the full SQL and its parameters. The real Postgres error,
 * with its `code`, lives on `.cause`.
 */
const getPostgresCode = (err: unknown): string | undefined => {
  const source = err instanceof DrizzleQueryError ? err.cause : err;
  if (typeof source === "object" && source !== null && "code" in source) {
    return typeof source.code === "string" ? source.code : undefined;
  }
  return undefined;
};

// Deny by default: internal details are shown only where a developer is
// reading them, never in an environment we forgot to label.
const exposeInternalErrors = nodeEnv === "development" || nodeEnv === "test";

export const errorHandler: ErrorHandler = (err, c) => {
  const pgCode = getPostgresCode(err);
  const clientError = pgCode ? CLIENT_ERRORS[pgCode] : undefined;
  if (clientError) {
    return failure(
      c,
      { code: clientError.code, message: clientError.message },
      clientError.status,
    );
  }

  console.error(err);
  return failure(
    c,
    {
      code: "INTERNAL_SERVER_ERROR",
      message: exposeInternalErrors ? err.message : "Internal server error",
    },
    500,
  );
};
