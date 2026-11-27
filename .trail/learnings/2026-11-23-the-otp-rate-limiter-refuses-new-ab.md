---
title: "The OTP rate limiter refuses new keys when full instead of evicting, and only trusts proxy headers when told to"
author: Ab-e1
date: 2026-11-23
branch: main
cost: { minutes: 35, tokens: 378733 }
id: l-5579d92d
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
- When the in-memory limiter store is full, it first sweeps expired keys and, if still full, answers 503 OTP_SERVICE_BUSY for NEW keys. It never evicts a live key: evicting resets that phone's cooldown and quota, so an attacker could erase a victim's limit by flooding junk phone numbers (repro'd: cooldown wiped 3 ms later with the old first-in-first-out eviction).
- The client IP comes from forwarding headers only when a proxy we control sets them. Configure it per deploy: TRUSTED_PROXY=cloudflare uses cf-connecting-ip, TRUSTED_PROXY=reverse-proxy uses the LAST x-forwarded-for entry, unset uses the TCP socket address.
## Tried and ruled out
- Reading the FIRST x-forwarded-for entry: proxies append, so the first entry is whatever the client sent; every request could carry a fresh fake IP and never hit the IP quota.
## Watch out
- In tests app.request() has no socket and no TRUSTED_PROXY, so every request resolves to IP "unknown" and shares one IP bucket. Reset the store in beforeEach (the auth e2e suite does).
- Behind Cloudflare or nginx in production, TRUSTED_PROXY must be set, or every user shares the proxy's IP and the 60/15min IP quota trips for everyone.
In the code:
- src/utils/otpRatelimit.ts: hasRoomForNewKey, getClientIp, MAX_PHONE_IP_ENTRIES = 50_000
- src/config/env.ts: trustedProxy / TRUSTED_PROXY
- src/controllers/auth.controller.ts: resolveClientIp (hono/bun getConnInfo)
