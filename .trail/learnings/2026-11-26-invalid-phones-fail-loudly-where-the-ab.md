---
title: "Invalid phones fail loudly where the phone is an identity, but may fall back in search and rate limiting"
author: Ab-e1
date: 2026-11-26
branch: main
cost: { minutes: 106, tokens: 538867 }
id: l-1a85252d
scope: repo
status: active
src: agent
touches:
  - src/tests/e2e/auth.api.test.ts
  - src/schema/staff.schema.ts
  - src/tests/e2e/staff.api.test.ts
  - src/services/users/staff.service.ts
  - src/tests/integration/staff.service.test.ts
  - src/schema/common.schema.ts
  - src/schema/auth.schema.ts
  - src/schema/user.schema.ts
  - src/schema/enrollment.schema.ts
  - src/services/enrollment.service.ts
---

## Decided
- Phones from requests are normalized once at the request border by one shared schema; an invalid number is a 400 there, so services receive a normalized phone and do not normalize again.
- Where a phone becomes someone's identity and no request schema protects it (promoting a member to staff reads the phone from the database), normalize and fail with an explicit error. Never fall back to the raw value: that would save a wrong login identity.
## Tried and ruled out
- Falling back to the raw phone with `??` or `||` when normalization fails: it silently stores or looks up a wrong identity.
## Watch out
- Fallbacks in staff search, member search and the OTP rate limiter are intentional: search just searches the text as typed, and the limiter must keep limiting rather than skip. Judge a fallback by what it does when used, not by its syntax.
In the code: phoneSchema in src/schema/common.schema.ts; promoteMemberToStaff returns 409 INVALID_MEMBER_PHONE in src/services/users/staff.service.ts.
