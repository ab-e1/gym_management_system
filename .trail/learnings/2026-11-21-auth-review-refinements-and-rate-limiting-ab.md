---
title: "Phone OTP auth review refinements: gateway quota protection, gym status verification, and IP limits on verify"
author: Ab-e1
date: 2026-11-21
branch: main
cost: { minutes: 12, tokens: 185000 }
id: l-c48d21ea
scope: repo
status: active
src: agent
touches:
  - src/services/auth/login.service.ts
  - src/controllers/auth.controller.ts
  - src/utils/otp.ts
  - src/config/env.ts
---

## Decided
- Superpowers code review scored the Phone OTP & Session lifecycle at 9.2/10, approving it for production.
- Key refinements queued for upcoming polish:
  1. `sendOtp` must check `users.status === "active"` before dispatching SMS to eliminate credit waste on banned/inactive users.
  2. Both `sendOtp` and `verifyOtp` must join `gyms` and check `!gyms.isDeleted && gyms.status === "active"` so inactive/deleted gym facilities cannot generate OTPs or establish sessions.
  3. `verifyOtp` at the controller layer needs an in-memory IP rate limiter (e.g. 60 attempts / 15 min) to shield PostgreSQL connection pools and `.for("update")` row locks from distributed DoS floods.
  4. Database calls in `sendOtp` can be simplified to a single query via `onConflictDoUpdate` on `verifications.identifier`.

## Watch out
- Do not remove `app.all("/api/v1/auth/*")`: Better Auth client libraries call `/api/v1/auth/sign-out` and `/api/v1/auth/get-session` via HTTP. Keeping custom routes mounted *before* `app.all` gives custom OTP logic precedence while preserving Better Auth's standard endpoints.
