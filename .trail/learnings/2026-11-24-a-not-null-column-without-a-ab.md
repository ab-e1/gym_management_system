---
title: "A NOT NULL column without a default must be declared to Better Auth, or every protected route fails"
author: Ab-e1
date: 2026-11-24
branch: main
cost: { minutes: 7, tokens: 330002 }
id: l-d7eb597f
scope: repo
status: active
src: agent
touches:
  - src/config/auth.ts
  - src/db/schema.ts
---

## Decided
- Keep `phoneNumber` declared in Better Auth's user `additionalFields` (with `input: false`). The users.phone column is NOT NULL with no default, and Better Auth checks the Drizzle schema on first use and refuses to run if it finds a required column it never writes.
## Tried and ruled out
- Commenting out the `phoneNumber` and `phoneNumberVerified` declarations after removing the phoneNumber plugin: `bun check` showed only 2 type errors in one test, but at runtime every `auth.api.getSession` call threw SCHEMA_MISMATCH, so requiredAuth failed on every protected route (34 of 34 member API tests failed).
## Watch out
- A small `bun check` result does not prove the app works; run `bun test --parallel=1` too.
- `phoneNumberVerified` has a default, so Better Auth does not require it; it is declared only for types and getSession output.
- The error lists the missing columns ("Required columns Better Auth never writes"); declare each one in additionalFields.
In the code: src/config/auth.ts (user.additionalFields), src/db/schema.ts (users.phoneNumber).
