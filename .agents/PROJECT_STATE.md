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
- **Test Command**: `bun test --maxConcurrency=1` (Strictly run sequentially to avoid database transaction collisions)

---

## 2. Workspace Snapshots & Git Branches
- **`snapshot/single-tenant` (Tag: `single-tenant-v1.0`)**: Preserved immutable snapshot of the 100% complete single-tenant CRUD foundation (Members, Staff, Plans) with 109 passing tests.
- **`main`**: Active branch transitioning into Multi-Tenant SaaS Architecture.

---

## 3. Database Schema (`src/db/schema.ts`)

### Enums
- `roleEnum`: `"staff" | "member" | "owner"` (default: `"member"`)
- `userStatusEnum`: `"active" | "inactive"` (default: `"active"`)
- `membershipStatusEnum`: `"active" | "expired" | "cancelled"` (default: `"active"`)
- `paymentMethodEnum`: `"bank" | "telebirr" | "cash"`
- `notificationTypeEnum`: `"expiry_warning" | "expired" | "call_list"`
- `notificationChannelEnum`: `"telegram" | "sms"`

### Core Tables
36: 1. **`users`**:
37:    - Columns: `id` (UUID pk), `name` (text, not null), `phoneNumber` (text, not null), `email` (text, optional), `photoUrl` (text), `role` (roleEnum), `phoneNumberVerified` (boolean), `emailVerified` (boolean), `status` (userStatusEnum), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
38:    - Indexes & Constraints: `user_name_idx` on `name`, `user_gym_id_idx` on `gymId`, `user_phone_unique_per_gym` unique on `(gymId, phoneNumber)`, `user_email_unique_per_gym` unique on `(gymId, email)`, `user_all_members_idx` on `(gymId, role, isDeleted)`, `user_all_active_members` on `(gymId, role, isDeleted, status)`.
39: 2. **`membershipPlans`**:
40:    - Columns: `id` (UUID pk), `name` (text), `price` (integer, check `price > 0`), `duration` (integer in days, check `duration > 0`), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
41: 3. **`memberships`**:
42:    - Columns: `id` (UUID pk), `userId` (fk `users.id`), `planId` (fk `membershipPlans.id`), `startDate`, `endDate`, `status` (membershipStatusEnum), `lastNotifiedDay`, `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
43:    - Indexes: `memberships_gym_id_idx` (`gymId`), `memberships_user_id_idx` (`userId`), `memberships_auto_expire_idx` (`gymId, status, endDate`), `memberships_user_active_idx` (`gymId, userId, status, endDate`), `memberships_gym_user_deleted_idx` (`gymId, userId, isDeleted`).
44:    - Strategy: Transactional Concurrency Control with Pessimistic Row Locking (`.for("update")`) inside `connection.transaction` for renewal stacking. Dynamic Computed Expiration — status evaluated at query time against `endDate < NOW()`, eliminating DB write locks on read APIs.
4. **`payments`**:
   - Columns: `id` (UUID pk), `membershipId` (fk `memberships.id`), `amount` (check `amount > 0`), `paymentMethod` (paymentMethodEnum), `recordedBy` (fk `users.id`), `paidAt`.
5. **`notificationLog`**:
   - Columns: `id` (UUID pk), `membershipId`, `type`, `channel`, `sentAt`, `status`.
6. **`gym`**:
   - Columns: `id` (UUID pk), `name` (text), `slug` (text, unique), `status` (userStatusEnum), `isDeleted` (boolean, default false), `createdAt`, `updatedAt`.
7. **Better Auth Tables**:
   - `sessions`: `id` (text), `userId` (UUID fk `users.id`), `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`.
   - `accounts`: `id` (text), `userId` (UUID fk `users.id`), `accountId`, `providerId`, `password`, etc.
   - `verifications`: `id` (text), `identifier` (text), `value` (text), `expiresAt`, `createdAt`, `updatedAt`.

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

### B. Validation Middleware (`src/middleware/validate.middleware.ts`)
- `validate(schema, target)` accepts `target: "body" | "query" = "body"`.
- Coerces parameters (e.g. `paginationQuerySchema` page/limit strings to numbers) and attaches validated data to `c.set("validData", result.data)`.

### C. Phone Number Normalization (`src/utils/helpers.ts`)
- Converts inputs like `"0911234567"`, `"251911234567"`, or `"911234567"` into standardized Ethiopian E.164 format: `"+251911234567"`.

### D. Authentication & Role Middleware (`src/middleware/auth.middleware.ts`)
- `requiredAuth`: Intercepts request headers, invokes `auth.api.getSession`, sets `c.set("user")` and `c.set("session")` or returns `401`.
- `requiredRole(...roles)`: Verifies `user.role` is in allowed roles (`owner`, `staff`, `member`) or returns `403`.

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

---

## 6. Test Suite Status (198 Passing Multi-Tenant Tests)

Run with: `bun test --maxConcurrency=1`

- `src/tests/unit/response.test.ts` (3 pass - failure with details)
- `src/tests/unit/zSchema/user.schema.test.ts` (9 pass - status enum & normalization)
- `src/tests/unit/zSchema/plan.schema.test.ts` (11 pass)
- `src/tests/unit/zSchema/membership.schema.test.ts` (16 pass)
- `src/tests/unit/zSchema/enrollment.schema.test.ts` (9 pass - UUID plan validation & payment enum)
- `src/tests/integration/member.service.test.ts` (18 pass - cross-tenant isolation, soft-delete resurrection & demotion)
- `src/tests/integration/staff.service.test.ts` (20 pass - promote, rehire, session nuke, 409 conflict details)
- `src/tests/integration/plan.service.test.ts` (13 pass)
- `src/tests/integration/membership.service.test.ts` (15 pass - inner join soft-delete gate & concurrency stacking)
- `src/tests/integration/enrollment.service.test.ts` (4 pass - atomic user, membership, and payment transaction orchestration)
- `src/tests/e2e/member.api.test.ts` (21 pass)
- `src/tests/e2e/staff.api.test.ts` (23 pass - RBAC 403, promote, rehire, conflict details)
- `src/tests/e2e/plan.api.test.ts` (17 pass)
- `src/tests/e2e/membership.api.test.ts` (9 pass)
- `src/tests/e2e/enrollment.api.test.ts` (10 pass - RBAC, validation, conflict, and atomic creation)

*Audit Reference*: Complete QA & Forensic Audit verified on October 10, 2026. Status: PASSED (100% green).


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

---

## 8. Multi-Tenant Roadmap (Phase 2 Target)
1. **Tenant Schema Isolation**:
   - Introduce `tenants` table (`id`, `name`, `slug`, `status`).
   - Add `tenantId: uuid("tenant_id")` to `users`, `membershipPlans`, `memberships`, `payments`, etc.
   - Replace global unique constraints with composite unique constraints: `(tenantId, phoneNumber)`.
2. **Phone OTP Auth Integration**:
   - Implement Better Auth Phone OTP sign-in endpoint for tablet staff logins.
3. **Memberships & Subscriptions Module**:
   - Active, Expired, Frozen, and Cancelled state machine logic.
4. **Payments & Ledger**:
   - Transactional enrollment: atomic creation of `membership` + `payment` in `db.transaction()`.
