# Project State & Architecture Reference (Single Source of Truth)

> **IMPORTANT FOR ALL AGENTS**: Read this document at the start of any non-trivial task. Update this document whenever new features, schema changes, endpoints, or testing patterns are introduced.

---

## 1. Project Overview & Tech Stack
- **Project Name**: Gym Management System (`gym_management_system`)
- **Target Market**: Ethiopian Gym Management (Phone-first identity `+2519...` / `+2517...`, Telebirr / CBE Birr / Cash payments)
- **Runtime**: Bun
- **Web Framework**: Hono (`^4.13.7`)
- **Database & ORM**: PostgreSQL + Drizzle ORM (`^0.45.2`) + `postgres` driver (`^3.4.9`)
- **Auth**: Better Auth (`^1.7.3`) with `@better-auth/drizzle-adapter` & `phoneNumber` / `bearer` plugins
- **Validation**: Zod (`^4.5.4`)
- **Test Command**: `OTP_HMAC_SECRET=test-otp-secret bun test --parallel=1` (Strictly run sequentially across test files to prevent concurrent table truncation collisions; 452 passing tests across 27 files)

---

## 2. Workspace Snapshots & Git Branches
- **`snapshot/single-tenant` (Tag: `single-tenant-v1.0`)**: Preserved immutable snapshot of the 100% complete single-tenant CRUD foundation (Members, Staff, Plans) with 109 passing tests.
- **`main`**: Active branch transitioning into Multi-Tenant SaaS Architecture.

---

## 3. Database Schema (`src/db/schema.ts`)

### Enums
- `roleEnum`: `"staff" | "member" | "owner"` (default: `"member"`)
- `userStatusEnum`: `"active" | "inactive" | "banned"` (default: `"active"`)
- `membershipStatusEnum`: `"active" | "expired" | "cancelled"` (default: `"active"`)
- `paymentMethodEnum`: `"bank" | "telebirr" | "cash"`
- `notificationTypeEnum`: `"expiry_warning" | "expired" | "call_list"`
- `notificationChannelEnum`: `"telegram" | "sms"`

### Core Tables
1. **`gyms`**:
   - Columns: `id` (UUID pk), `name` (text), `slug` (text, unique), `status` (userStatusEnum), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
2. **`users`** (Global Identity Layer - Better Auth for staff/owners/coaches only):
   - Columns: `id` (UUID pk), `name` (text, not null), `phoneNumber` (text, not null, globally unique), `email` (text, optional, unique), `photoUrl` (text), `phoneNumberVerified` (boolean), `emailVerified` (boolean), `status` (userStatusEnum), `createdAt`, `updatedAt`.
   - Constraints & Indexes: `users_phone_unique` on `phoneNumber`, `users_email_unique` on `email`, `user_name_idx` on `name`.
3. **`gymStaff`** (`gym_staff` - Workplace Badge pivot):
   - Columns: `id` (UUID pk), `gymId` (fk `gyms.id`), `userId` (fk `users.id`), `role` (`owner` | `admin` | `staff` | `coach`), `status` (`active` | `suspended`), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
   - Constraints & Indexes: `gym_staff_gym_user_unique` composite unique on `(gymId, userId)`, `gym_staff_gym_id_idx`, `gym_staff_user_id_idx`.
4. **`members`** (Customer CRM - Gym-scoped paying clients & walk-ins):
   - Columns: `id` (UUID pk), `gymId` (fk `gyms.id`), `name` (text, not null), `phoneNumber` (text, not null), `email` (text, optional), `photoUrl` (text), `status` (userStatusEnum), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
   - Constraints & Indexes: `member_phone_unique_per_gym` composite unique on `(gymId, phoneNumber)`, `member_email_unique_per_gym` composite unique on `(gymId, email)`, `member_gym_id_idx`, `member_name_idx`, `member_phone_idx`, `member_active_status_idx`.
5. **`membershipPlans`**:
   - Columns: `id` (UUID pk), `name` (text), `price` (integer, check `price > 0`), `duration` (integer in days, check `duration > 0`), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
6. **`memberships`**:
   - Columns: `id` (UUID pk), `memberId` (fk `members.id`), `planId` (fk `membershipPlans.id`), `gymId` (fk `gyms.id`), `startDate`, `endDate`, `status` (membershipStatusEnum), `lastNotifiedDay`, `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
   - Indexes: `memberships_gym_id_idx` (`gymId`), `memberships_member_id_idx` (`memberId`), `memberships_auto_expire_idx` (`gymId, status, endDate`), `memberships_member_active_idx` (`gymId, memberId, status, endDate`), `memberships_gym_member_deleted_idx` (`gymId, memberId, isDeleted`).
   - Strategy: Transactional Concurrency Control with Pessimistic Row Locking (`.for("update")`) inside `connection.transaction` for renewal stacking. Dynamic Computed Expiration — status evaluated at query time against `endDate < NOW()`, eliminating DB write locks on read APIs.
7. **`payments`**:
   - Columns: `id` (UUID pk), `membershipId` (fk `memberships.id`), `amount` (check `amount > 0`), `paymentMethod` (paymentMethodEnum), `recordedBy` (fk `users.id`), `paidAt`.
8. **`notificationLog`**:
   - Columns: `id` (UUID pk), `membershipId`, `type`, `channel`, `sentAt`, `status`.
9. **Better Auth Tables**:
   - `sessions`: `id` (UUID defaultRandom pk), `userId` (UUID fk `users.id`), `activeGymId` (UUID fk `gyms.id`), `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`.
   - `accounts`: `id` (UUID defaultRandom pk), `userId` (UUID fk `users.id`), `accountId`, `providerId`, `password`, etc.
   - `verifications`: `id` (UUID defaultRandom pk), `identifier` (text, unique), `value` (text), `attempt` (integer default 0), `expiresAt`, `createdAt`, `updatedAt`.

---

## 4. Architecture & Design Patterns

### A. HTTP Envelopes & Response Standard (`src/utils/response.ts`)
- **Success Format**:
  ```json
  {
    "ok": true,
    "data": { ... },
    "pagination": { "page": 1, "limit": 10, "total": 45, "totalPages": 5 },
    "message": "Optional message"
  }
  ```
- **Failure Format**:
  ```json
  {
    "ok": false,
    "error": {
      "code": "INPUT_VALIDATION_ERROR",
      "message": "Detailed error message"
    }
  }
  ```

### B. Validation Middleware & Schemas (`src/middleware/validate.middleware.ts`, `src/schema/`)
- `validate(schema, target)` accepts `target: "body" | "query" = "body"`.
- Coerces parameters (e.g. `paginationQuerySchema` page/limit strings to numbers) and attaches validated data to `c.set("validData", result.data)`.
- `auth.schema.ts`:
  - `sendOtpSchema`: Validates `gymId` (UUID) and `phoneNumber` (Ethiopian regex, auto-transformed to E.164 `+251...`), with preprocessor accepting `phone` alias.
  - `verifyOtpSchema`: Validates `gymId` (UUID), `phoneNumber`, and 6-digit numeric `code` (auto-trimmed).

### C. Input Sanitization & Normalization (`src/utils/helpers.ts`)
- `normalizePhoneNumber`: Converts inputs like `"0911234567"`, `"251911234567"`, or `"911234567"` into standardized Ethiopian E.164 format: `"+251911234567"`.
- `escapeSqlLikePattern`: Escapes SQL `LIKE`/`ILIKE` wildcard characters (`%`, `_`, `\`) with a backslash to prevent user input from causing unintended wildcard matching or database scans.
- `isValidUUID`: Validates UUID v4 syntax before hitting database queries to reject malformed route parameters with 400.

### D. Authentication & Role Middleware (`src/middleware/auth.middleware.ts`)
- `requiredAuth`: 4-stage tenant & operator validation:
  1. Validates Better Auth session from headers (`401` if missing).
  2. Validates global operator `user.status === "active"` (`403` if suspended).
  3. Validates `session.activeGymId` presence (`403` if missing).
  4. Queries `gymStaff` joined with `gyms`: validates operator holds an active badge (`badge.status === "active"`, `!badge.isDeleted`) and gym is operational (`gym.status === "active"`, `!gym.isDeleted`) (`403` if invalid).
  5. Injects context: `c.set("user", session.user)`, `c.set("session", session.session)`, `c.set("gymId", activeGymId)`, `c.set("role", badge.role)`.
- `requiredRole(...roles)`: Verifies injected `c.get("role")` is in allowed roles (`owner`, `admin`, `staff`, `coach`) or returns `403`.

---

## 5. API Endpoints Inventory

| Method | Endpoint | Access / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System health status & uptime |
| `ALL` | `/api/v1/auth/*` | Public | Better Auth handler (OTP, sessions) |
| `POST` | `/api/v1/members` | `staff`, `owner` | Register new gym member |
| `GET` | `/api/v1/members` | `staff`, `owner` | List members with pagination & search (`ilike`) |
| `GET` | `/api/v1/members/:id` | `staff`, `owner` | Get member details by ID |
| `PATCH` | `/api/v1/members/:id` | `staff`, `owner` | Update member details |
| `DELETE` | `/api/v1/members/:id` | `staff`, `owner` | Soft-delete / reactivate member toggle |
| `POST` | `/api/v1/staff` | `owner` | Register staff (fails with 409 + details if member/archived staff exists) |
| `POST` | `/api/v1/staff/:id/promote` | `owner` | Explicitly promote active member to staff role |
| `POST` | `/api/v1/staff/:id/rehire` | `owner` | Rehire archived/soft-deleted staff (`status: active`, `isDeleted: false`) |
| `GET` | `/api/v1/staff` | `owner` | List staff members with pagination & search |
| `GET` | `/api/v1/staff/:id` | `owner` | Get staff details by ID |
| `PATCH` | `/api/v1/staff/:id` | `owner` | Update staff details |
| `DELETE` | `/api/v1/staff/:id` | `owner` | Soft-delete / reactivate staff toggle (purges active sessions on delete) |
| `POST` | `/api/v1/plans` | `owner` | Create membership plan |
| `GET` | `/api/v1/plans` | `staff`, `owner` | List active membership plans |
| `GET` | `/api/v1/plans/:id` | `staff`, `owner` | Get plan details by ID |
| `PATCH` | `/api/v1/plans/:id` | `owner` | Update plan details |
| `DELETE` | `/api/v1/plans/:id` | `owner` | Soft-delete / delete plan toggle |
| `POST` | `/api/v1/membership` | `staff`, `owner` | Create active membership for member with smart renewal stacking |
| `GET` | `/api/v1/membership` | `staff`, `owner` | List memberships with pagination, status filter & userId filter |
| `GET` | `/api/v1/membership/:id` | `staff`, `owner` | Get single membership details by ID |
| `PATCH` | `/api/v1/membership/:id` | `staff`, `owner` | Update membership status (`active`, `expired`, `cancelled`) |
| `DELETE` | `/api/v1/membership/:id` | `staff`, `owner` | Soft-delete / recover membership toggle |
| `POST` | `/api/v1/enrollment` | `staff`, `owner` | Fast atomic enrollment (user + membership + payment in 1 transaction) |
| `GET` | `/api/v1/search/omnibar` | `owner`, `admin`, `staff`, `coach` | Omnibar search: fast phone exact match or candidate name/partial disambiguation |
| `GET` | `/api/v1/search` | `owner`, `admin`, `staff`, `coach` | Alias route for Omnibar search with `?query=...&limit=...` |

---

## 6. Test Suite Status (314 Passing Tests across 20 Green Suites - 100% Complete)

Run with: `bun test --maxConcurrency=1`

### 100% Green Modules (All 20 Suites, 314 Passing Tests):
- `src/tests/unit/response.test.ts` (3 pass - failure with details)
- `src/tests/unit/helpers.test.ts` (19 pass - escapeSqlLikePattern, normalizePhoneNumber, isValidUUID, maskPhone with separator cleaning & tiers, formatOtpMessage)
- `src/tests/unit/sms.test.ts` (25 pass - AfroMessage REST client validation, mock mode, timeouts, payload guards, INVALID_PAYLOAD vs INVALID_RECIPIENT distinction, auto-normalization, reverse proxy & response.error extraction, error sanitization)
- `src/tests/unit/otp.test.ts` (13 pass with `OTP_HMAC_SECRET` configured - HMAC OTP generation, verification, timingSafeEqual)
- `src/tests/unit/otpRatelimit.test.ts` (13 pass - per-phone 60s cooldown, 4/15m sliding window quota, shared gym Wi-Fi NAT 60/15m flood shield, opportunistic sweeper, LRU bounds)
- `src/tests/unit/zSchema/user.schema.test.ts` (10 pass - status enum active/inactive/banned & normalization)
- `src/tests/unit/zSchema/plan.schema.test.ts` (11 pass)
- `src/tests/unit/zSchema/membership.schema.test.ts` (16 pass)
- `src/tests/unit/zSchema/enrollment.schema.test.ts` (9 pass - UUID plan validation & payment enum)
- `src/tests/unit/zSchema/search.schema.test.ts` (9 pass - query trimming, limits, bounds)
- `src/tests/integration/member.service.test.ts` (17 pass - 3-tier CRM customer queries & multi-tenant isolation)
- `src/tests/integration/plan.service.test.ts` (13 pass - soft delete toggle, FK constraints with members.id)
- `src/tests/integration/membership.service.test.ts` (16 pass - 3-tier members CRM join, desc createdAt ordering, soft-deleted plan preservation, synced count query, concurrency stacking & banned member 403 guard)
- `src/tests/integration/enrollment.service.test.ts` (7 pass - 3-tier member CRM resurrection, members.id linkage, atomic membership + payment)
- `src/tests/integration/omnibarSearch.service.test.ts` (18 pass - deterministic candidate ordering, O(1) phone states, stacked renewals, batched candidate search with inactive lapsed members, literal %/_ wildcard escaping)
- `src/tests/integration/staff.service.test.ts` (24 pass - `createStaff`, `getAllStaff`, `getStaffById`, badge-scoped `updateStaff`, `deleteStaffToggle`, `promoteMemberToStaff`, and `rehireStaff` fully migrated to 3-tier multi-tenant `gymStaff` + `users` with atomic transactions, session cleanup, and explicit projections)
- `src/tests/e2e/member.api.test.ts` (34 pass - RBAC, coach 403, suspended 403, missing activeGym 403, Zod validation, UUID 400, soft-delete toggle recovery, cross-tenant isolation)
- `src/tests/e2e/plan.api.test.ts` (16 pass - multi-tenant owner/staff RBAC, 401 unauthenticated, CRUD, pagination, 409 duplicate plan name)
- `src/tests/e2e/membership.api.test.ts` (11 pass - RBAC coach 403, validation, malformed non-UUID 400 guard, full CRUD lifecycle)
- `src/tests/e2e/enrollment.api.test.ts` (10 pass - 3-tier auth guardrails, coach 403, validation, conflict, and atomic creation)
- `src/tests/e2e/search.api.test.ts` (22 pass - auth, validation, phone match states, candidate list, multi-tenant isolation)
- `src/tests/e2e/staff.api.test.ts` (40 pass - RBAC security gates, coach 403, missing activeGym 403, suspended badge 403, Zod validation, CRM member phone collision 409, search queries, UUID 400 guards, soft-delete session invalidation, promote member to staff, rehire archived staff, and cross-tenant isolation)

### Migration Status:
- **Phase 2 Multi-Tenant Foundation**: 100% COMPLETE across all layers (Schema, Services, Controllers, Routes, and E2E Test Suites).

## 7. Critical Domain Constraints & Edge Cases Handled
1. **Soft-Delete Unique Constraint Collision**:
   - Soft-deleted users still exist in `users` table with `is_deleted = true`.
   - Creating staff with an existing soft-deleted phone number updates the row in-place (`isDeleted: false`, `role: "staff"`) rather than attempting a duplicate SQL `INSERT` (which throws Postgres error `23505`).
2. **Test Lifecycle Order**:
   - DB wipe (`delete(table)`) and seeding must be placed **inside `beforeAll()`** hooks, not top-level in test files, to prevent premature wiping before execution.
3. **Query vs Body Schema Validation**:
   - HTTP GET routes pass `target: "query"` to `validate(paginationQuerySchema, "query")` so `c.req.query()` is parsed instead of `c.req.json()`.
4. **Foreign Key Integrity via Soft Delete (Plans & Memberships)**:
   - `membershipPlans` are soft-deleted (`isDeleted = true`) and toggled rather than hard-deleted.
   - Deleting a plan that has active or past member contracts in `memberships` succeeds without triggering PostgreSQL error `23503` (`foreign_key_violation`).
   - `getAllPlans()` and `getPlanById()` strictly query `where(eq(membershipPlans.isDeleted, false))`.
5. **Membership Ledger Plan Preservation & Pagination Count Sync**:
   - In [membership.service.ts](file:///home/ab/gym_management_system/src/services/membership.service.ts), `getAllMemberships` and `getMembershipById` utilize `leftJoin` on `membershipPlans` without `isDeleted: false` criteria so historical subscriptions and contract receipts remain intact even when a plan is archived.
   - The `select({ total: count() })` query mirrors the joins of the records query, eliminating pagination count drift.
   - Deterministic pagination ordering is enforced via `.orderBy(desc(memberships.createdAt))`.
6. **End-of-Day Expiration Normalization & Candidate Ranking**:
   - `createMembership` and `fastEnrollment` normalize `endDate` to `23:59:59.999` so members retain facility access through the final calendar day.
   - Omnibar candidate search enforces deterministic ranking via `.orderBy(asc(users.name), desc(users.createdAt))`.
7. **Fast UUID Validation & Global 22P02 Error Safety Net**:
   - `isValidUUID` regex helper guards all path `:id` endpoints across controllers (`member`, `staff`, `plan`, `membership`), returning 400 Bad Request.
   - `app.onError` traps PostgreSQL `22P02` syntax errors as a defense-in-depth safety net preventing unhandled 500 crashes.
8. **Email Uniqueness Pre-Check on Mutations & Resurrections**:
   - `createMember`, `updateMember`, `createStaff`, `updateStaff`, and `enrollment` (during soft-deleted member resurrection) pre-check email uniqueness per gym, rejecting duplicate email conflicts with a clean 409 Conflict rather than allowing unhandled 23505 database exceptions.
9. **Tenant-Scoped Session Revocation**:
   - `deleteStaffToggle` strictly revokes sessions matching `and(eq(sessions.userId, targetUser.userId), eq(sessions.activeGymId, gymId))`. Soft-deleting a workplace badge at Gym 1 preserves active sessions at Gym 2 for cross-facility staff.
10. **Financial Ledger Tenant Ownership Validation**:
   - Standalone `recordPayment` validates membership ownership within the tenant boundary (`and(eq(memberships.id, membershipId), eq(memberships.gymId, gymId))`), returning 404 NOT_FOUND on tenant mismatch and 400 on malformed UUID.
11. **Operational Staff Role Inclusivity**:
   - `getStaffById` and `getAllStaff` query non-owner roles (`ne(gymStaff.role, "owner")`), allowing `staff`, `coach`, and `admin` workplace badges to be fetched and inspected via API endpoints.
12. **Unified API Pagination Contract**:
   - All list endpoints (`members`, `staff`, `plans`, `memberships`) return a standardized `pagination: { total, page, limit, totalPages }` envelope, while preserving domain-specific total keys (`totalMembers`, `totalStaff`, `totalMemberships`) for backwards compatibility.
13. **Consistent RBAC Status Code & Production Error Shield**:
   - `requiredRole` middleware returns HTTP 403 with `code: "FORBIDDEN"` (replacing the misleading `UN_AUTHORIZED` code).
   - `app.onError` redacts raw database/driver error details when running in production.

14. **SMS Gateway, Phone/OTP Helpers & Identity OTP Architecture (`src/utils/sms.ts`, `src/utils/helpers.ts`, `src/utils/otp.ts`)**:
   - **Unified Result Envelope (`SmsResult`)**: `sendSms` returns `{ ok: true, data: { messageId, to } }` or `{ ok: false, error: { code, message } }` (`"SMS_API_NOT_CONFIGURED" | "INVALID_RECIPIENT" | "INVALID_PAYLOAD" | "GATEWAY_ERROR" | "NETWORK_ERROR"`), aligning with the `{ ok, data } / { ok, error }` envelope convention and eliminating `console.*` side effects. Differentiates `INVALID_RECIPIENT` (missing phone) from `INVALID_PAYLOAD` (empty/whitespace message).
   - **Zero-Dependency Direct REST Dispatcher with Timeout & Runtime Guards**: `sendSms(to, body, options)` auto-normalizes recipient phone numbers via `normalizePhoneNumber(to)`, calls the full AfroMessage send URL via native Bun `fetch` with Bearer auth, `AbortSignal.timeout(timeoutMs)` (default `defaultTimeoutMs = 8000`, falling back cleanly on non-positive/`NaN`/`Infinity` values), lightweight runtime response validation (`res.ok && acknowledge === "success"`, non-empty `message_id`, safe fallback for `response.to` and multi-tiered extraction for `errors` / `response.error` / `response.message` / `data.message` / reverse proxy `message` and `error` fields), body-read timeout rethrow, and sanitized timeout/network error messages.
   - **Vendor Lock-In Shield & Explicit Config Errors**: Gateway full send URL, key, and optional defaults come from `SMS_OTP_BASE_URL` (validated for `http:`/`https:`), `SMS_PROVIDER_API_KEY`, `SMS_SENDER_NAME`, and `SMS_IDENTIFIER_ID`, trimming whitespace and reporting exact missing or malformed env config.
   - **PII Privacy & Formatting Helpers (`src/utils/helpers.ts`)**: `normalizePhoneNumber(phoneNumber?)` cleans whitespace/hyphens, `maskPhone(phone)` strips internal separators before applying length-tier slicing for Ethiopian 9/10-digit, 11/12-digit, and E.164 numbers, and `formatOtpMessage(otpCode, brandName, expiresInMinutes)` formats SMS copy with singular/plural minute grammar.
   - **Development & Test Cost Protection**: Supports `MOCK_SMS=true` returning `mock-${crypto.randomUUID()}` offline without hitting the gateway or spending quota, backed by unit tests in `src/tests/unit/sms.test.ts` (25 pass) and `src/tests/unit/helpers.test.ts` (19 pass).
   - **In-House Cryptographic OTP Verification**: Verification remains strictly in-house via HMAC-SHA256 constant-time comparison (`timingSafeEqual`) and DB `verifications` table rather than delegating validation to external gateways.

15. **In-Memory Sliding-Window OTP Rate Limiter (`src/utils/otpRatelimit.ts`)**:
   - **Multi-Tier Protection**: Enforces 60-second cooldown per phone number (`OTP_COOLDOWN_ACTIVE`), 4 requests per 15-minute sliding window per phone (`TOO_MANY_REQUESTS_PHONE`), and a 60 requests per 15-minute sliding window IP flood shield (`TOO_MANY_REQUESTS_IP`) calibrated to accommodate shared gym Wi-Fi (NAT).
   - **Zero-Dependency & Memory Bounds**: Uses native Bun `Map<string, number[]>` with LRU size eviction cap (`MAX_PHONE_IP_ENTRIES = 10_000`) and opportunistic background sweeping (`sweepExpiredRateLimits`) every 15 minutes to prevent memory leaks from dead keys.
   - **Proxy IP Resolution**: `getClientIp` extracts `cf-connecting-ip`, `x-forwarded-for` (comma-split first IP), and `x-real-ip` to prevent spoofing.
   - **Full TDD Verification**: 13 unit tests in `src/tests/unit/otpRatelimit.test.ts` covering cooldowns, window boundary rolloffs, shared Wi-Fi NAT safety, and store reset isolation.

16. **Phone OTP Auth Service - `sendOtp` & `verifyOtp` Security Hardening (`src/services/auth/login.service.ts`)**:
   - **Zero-Enumeration Security Model**: Non-existent users, missing gym staff badges, deleted badges (`isDeleted: true`), and non-active/banned staff (`status !== "active"`) all return identical generic HTTP 200 responses in `sendOtp` and generic HTTP 401 `UNAUTHORIZED` (`"Invalid or expired verification code"`) in `verifyOtp`, preventing attackers from enumerating staff members or active codes via error codes or status differences.
   - **Database Connection Pool Protection & Orphan Cleanup**: DB queries and external network calls (`sendSms`) are strictly decoupled. Only the atomic `delete` of stale OTPs and `insert` of the new HMAC-SHA256 hash execute within `connection.transaction`. If `sendSms` fails (`!result.ok`), any inserted verification row is immediately cleaned up (`connection.delete(verifications)...`) so no orphaned OTP remains in PostgreSQL on SMS failure.
   - **Single-OTP Integrity & Row-Level Locking**: `verifications.identifier` enforces `UNIQUE` constraint in PostgreSQL. `verifyOtp` locks verification row with `.for("update")` to prevent concurrent brute-force race conditions.
   - **Brute-Force Burn & Oracle Shield**: Tracks `attempt` count up to 5. Upon the 5th failed attempt or when exceeding 5 attempts, the verification row is immediately burned (`tx.delete(verifications)...`) and returns uniform generic HTTP 401 (`GENERIC_INVALID_CREDENTIALS`), eliminating the 429 user enumeration oracle.
   - **Staff Status & Verification State Mutation**: `verifyOtp` checks `users.status === "active"`, blocking banned or inactive staff. Upon successful OTP verification, `users.phoneNumberVerified` is updated to `true` inside the transaction.
   - **Session Client Metadata**: `verifyOtp` accepts optional `clientInfo?: { ipAddress?: string; userAgent?: string }` and forwards metadata directly to `insertSession`.
   - **Comprehensive Test Suite (`src/tests/unit/login.service.test.ts`)**: 10 tests verifying input validation (400), anti-enumeration (200), happy-path OTP generation and HMAC verification, stale row cleanup, and gateway failure cleanup (502).

17. **Real Database Authentication & Session Integration Test Suite (`src/tests/integration/auth.service.test.ts`)**:
   - **Full Real Database & Session Lifecycle**: 34 comprehensive tests validating `insertSession`, `sendOtp`, `verifyOtp`, and Better Auth session integration against PostgreSQL.
   - **`insertSession` Contract**: Generates 64-character hex tokens with 256-bit entropy, sets 30-day expiration, records optional `ipAddress` and `userAgent`, operates seamlessly standalone and inside active transactions (`tx`), and verifies transaction rollback semantics.
   - **`sendOtp` Real DB Flow**: End-to-end OTP generation, dynamic 15-minute expiration, 64-character HMAC-SHA256 persistence (non-plaintext), SMS formatting with gym name, prior pending OTP cleanup, anti-enumeration (uniform 200 without SMS or DB write on non-existent, soft-deleted, or suspended staff), and orphan OTP cleanup on SMS gateway 502 failures.
   - **`verifyOtp` Real DB Flow**: Input validation (400), uniform 401 UNAUTHORIZED anti-enumeration responses (user missing, badge missing/suspended/deleted, user inactive/banned, OTP missing/expired, wrong code), attempt counting and atomic burn on 5th failure, client metadata persistence, and transactional `users.phoneNumberVerified = true` mutation upon success.
   - **Concurrency & Row-Level Locking**: Verified concurrent requests under pessimistic `.for("update")` locking serialize cleanly and burn OTP upon limit exhaustion without deadlocks or race conditions.
   - **Better Auth Bearer Token Session Integration**: End-to-end integration with `auth.api.getSession`, confirming tokens issued by `verifyOtp` authenticate active staff, resolve `userId`, `activeGymId`, and user verification status via both `Headers` instances and plain object headers, and reject expired or deleted sessions.

18. **Auth HTTP Transport Layer & End-to-End API Suite (`src/controllers/auth.controller.ts`, `src/routes/auth.routes.ts`, `src/tests/e2e/auth.api.test.ts`)**:
   - **Router Precedence**: `app.route("/api/v1/auth", authRoutes)` mounted before `app.all("/api/v1/auth/*")` in `src/app.ts` so custom OTP endpoints (`/api/v1/auth/otp/send`, `/api/v1/auth/otp/verify`) intercept requests before falling back to Better Auth's handler.
   - **Client IP & User-Agent Extraction**: `getClientIp(c.req.raw.headers)` extracts true client IP via `cf-connecting-ip` / `x-forwarded-for` priority; `user-agent` header recorded in `sessions.userAgent`.
   - **In-Memory Rate Limiting Guard**: `checkOtpRateLimit` executed in the controller before invoking domain services, dropping cooldown or window violations with HTTP 429 in < 0.1ms without database roundtrips.
   - **Full E2E API Verification (26 Tests)**:
     - Input validation (HTTP 400 on missing or invalid UUID gymId, missing/invalid phone formats, invalid OTP code length).
     - Anti-enumeration testing across all send and verify failure branches.
     - Sliding-window rate limit triggers (HTTP 429 `OTP_COOLDOWN_ACTIVE` on immediate repeat calls; HTTP 429 `TOO_MANY_REQUESTS_IP` upon exceeding 60 requests).
     - SMS gateway 502 failure and verification cleanup.
     - Full login lifecycle handoff: `sendOtp` -> `verifyOtp` -> use returned Bearer token on `GET /api/v1/staff` (200 OK for owner) and `GET /api/v1/members` (200 OK for staff), confirming RBAC enforcement (`403 FORBIDDEN` when non-owner staff attempts `/api/v1/staff`) and multi-tenant gym isolation.

---

## 8. Backlog & Planned Architectural Refinements (from Superpowers Review)
1. **SMS Quota Protection**: Add `users.status === "active"` check in `sendOtp` before dispatching SMS to prevent banned/inactive accounts from draining SMS gateway credits.
2. **Tenant Gym Active Validation**: Join `gyms` in both `sendOtp` and `verifyOtp` to assert `!gyms.isDeleted && gyms.status === "active"`, preventing session issuance for soft-deleted or deactivated gyms.
3. **Verify IP-Flood Protection**: Add in-memory sliding-window IP rate limiting on `verifyOtp` at the controller layer to guard PostgreSQL connection pools and `.for("update")` row locks from distributed DoS attempts.
4. **Env Fail-Fast Guard**: Throw explicit startup error in `src/config/env.ts` when `OTP_HMAC_SECRET` is missing in non-test environments.
5. **Single-Query Join Optimization**: Collapse sequential `SELECT users` -> `SELECT gymStaff` queries in `sendOtp` and `verifyOtp` into a single SQL `INNER JOIN` (`users` + `gymStaff` + `gyms`), halving network latency and eliminating subtle timing discrepancies.
6. **Atomic PostgreSQL Upsert**: Replace `tx.delete(verifications)` + `tx.insert(verifications)` in `sendOtp` with Drizzle's `.insert().onConflictDoUpdate()` on `verifications.identifier`.
7. **Dynamic SMS White-Label Branding**: Inject the specific gym's name (`gym.name`) into the SMS template rather than the hardcoded `"GYM_Scale"` placeholder.

---

## 9. Multi-Tenant Roadmap (Phase 2 Target)
1. **Tenant Schema Isolation**: ✅ **100% COMPLETE** (`gyms`, `gymStaff` badges, `members` CRM, composite unique constraints).
2. **Phone OTP Auth & Session Lifecycle**: ✅ **100% COMPLETE** (HMAC-SHA256, sliding-window rate limits, AfroMessage REST client, Better Auth Bearer token handoff, 73 integration/E2E tests).
3. **Multi-Branch Gym Switching (`POST /api/v1/auth/switch-gym`)**:
   - Allow multi-facility staff/owners with badges at multiple gyms to switch `sessions.activeGymId` in-place without needing to re-authenticate via SMS.
4. **Memberships & Subscriptions Module**:
   - State machine transitions: Active, Expired, Frozen, and Cancelled.
   - Subscription renewal stacking with pessimistic locking.
5. **Transactional Enrollment & Payments Ledger**:
   - Atomic creation of `member` + `membership` + `payment` in `connection.transaction()`.
   - Payment method recording (Telebirr, CBE Birr, Cash) with transaction reference codes.
   - Daily/monthly gym revenue reporting.
6. **Front-Desk Check-In & Attendance**:
   - Quick member check-in by phone or ID with real-time membership validity check.
   - Offline sync support.
