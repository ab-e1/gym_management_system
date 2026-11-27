---
title: "Drizzle wraps database errors, so the Postgres error code is on err.cause, not err.code"
author: Ab-e1
date: 2026-11-23
branch: main
cost: { minutes: 21, tokens: 186694 }
id: l-12ea4df2
scope: repo
status: active
src: agent
touches:
  - src/config/auth.ts
  - src/middleware/error.middleware.ts
  - src/app.ts
  - src/middleware/auth.middleware.ts
  - src/config/env.ts
  - src/utils/otpRatelimit.ts
  - src/controllers/auth.controller.ts
  - src/tests/e2e/auth.api.test.ts
  - src/schema/staff.schema.ts
  - src/routes/staff.route.ts
---

## Decided
- Map database errors to HTTP statuses in one place, the global error handler, by unwrapping DrizzleQueryError first: 22P02 (bad uuid or enum value) -> 400, 23505 (unique) and 23503 (foreign key) -> 409.
## Tried and ruled out
- Checking err.code === "22P02" directly (the old app.onError): since drizzle-orm 0.44 every driver error is wrapped, so err.code is undefined and the check never matched. Every DB error became a 500, and outside NODE_ENV=production the response body carried the full SQL and its parameters.
## Watch out
- DrizzleQueryError.message contains SQL and params (names, phone numbers). Never send it to clients; the handler only exposes messages when NODE_ENV is development or test.
- A unique-index violation is a valid way to return 409 (e.g. renaming a plan onto an existing name) once this mapping exists; no racy pre-check is needed for it.
In the code:
- src/middleware/error.middleware.ts: getPostgresCode, CLIENT_ERRORS
- src/tests/unit/errorHandler.test.ts
