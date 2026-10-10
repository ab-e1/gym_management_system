# Detailed Engineering History, Debrief & Deep Reference

> **Purpose**: This document contains a comprehensive, end-to-end breakdown of all architectural discussions, mental model breakthroughs, edge-case fixes, testing nuances, and code design decisions made during the development of the Gym Management System. Use this document alongside `.agents/PROJECT_STATE.md` to provide full context to any engineering agent or developer joining the project.

---

## 1. Domain Context & Localization (Ethiopian Gym Market)

### The Problem Space
Standard US/European SaaS boilerplate applications assume `email` + `password` is the primary user identity. In the Ethiopian market (and specifically local gym management):
- **Phone-First Identity**: Customers and staff use phone numbers (`09...`, `07...`, `+251...`) as their primary identifier. `email` is often omitted or unavailable.
- **Payment Methods**: Cash, Telebirr, and Commercial Bank of Ethiopia (CBE Birr) bank transfers are the dominant payment rails.
- **Tablet / Front-Desk Access**: Gym staff operate at front-desk tablets to check-in members, log cash payments, and register new members quickly.

### Key Architectural Implementation Details
1. **Optional Email**:
   - `users.email` in `src/db/schema.ts` is nullable and unique.
   - `createMemberSchema` in `src/schema/user.schema.ts` marks `email` as optional: `z.string().email().optional()`.

2. **Phone Number Normalization (`src/utils/helpers.ts`)**:
   - Inputs can arrive in various forms: `0911234567`, `251911234567`, `911234567`, or `+251911234567`.
   - `normalizePhoneNumber()` converts all valid variations into uniform E.164 string format `"+251911234567"`.
   - Integrated into Zod schemas via `.transform(normalizePhoneNumber)`.

---

## 2. Deep Dive: Architectural Discoveries & Hard Edge Cases

### Edge Case 1: Soft-Delete vs PostgreSQL Unique Index Collision (Error 23505)
* **The Bug**:
  - We implemented soft-deleting users by setting `is_deleted = true` instead of executing SQL `DELETE FROM users`.
  - In PostgreSQL, a `UNIQUE` index on `users(phone)` applies across **all rows in the table**, including soft-deleted rows!
  - When an owner attempted to create a new staff member using a phone number that previously belonged to a soft-deleted member, Drizzle issued an `INSERT INTO users` query. Postgres threw error `23505` (`unique_violation`).

* **The Engineering Fix (`src/services/users/staff.service.ts`)**:
  - `createStaff` must query `users` by `phoneNumber` **without** a `where(eq(users.isDeleted, false))` filter to inspect the true database state.
  - **Logic Tree**:
    1. If no user exists with that phone number: execute standard `INSERT` (`role: "staff"`).
    2. If an active user exists (`isDeleted == false`): throw duplicate conflict error `409` (`"phone number already exists"`).
    3. If a soft-deleted user exists (`isDeleted == true`): update the existing row in-place:
       ```ts
       await db.update(users).set({
         name: data.name,
         role: "staff",
         isDeleted: false,
         status: "active",
         updatedAt: new Date(),
       }).where(eq(users.id, existingUser.id));
       ```

---

### Edge Case 2: Query Parameter vs JSON Body Validation Middleware
* **The Problem**:
  - Initial implementation of `validate(schema)` in `src/middleware/validate.middleware.ts` only read HTTP request bodies via `await c.req.json()`.
  - When we built `GET /api/v1/members?page=1&limit=10&search=test`, `c.req.json()` on a `GET` request returned `{}`. The Zod pagination schema failed or ignored query string parameters.

* **The Engineering Fix (`src/middleware/validate.middleware.ts`)**:
  - Upgraded middleware signature: `validate(schema: ZodSchema, target: "body" | "query" = "body")`.
  - For `target === "query"`, it calls `c.req.query()`, which extracts URL query parameters into a plain JS object before running `schema.safeParse()`.
  - Validated data is attached to Hono context via `c.set("validData", result.data)`.
  - **Controllers**: Call `c.get("validData")` directly, keeping controllers clean and decoupled from raw parsing logic.

* **Pagination Zod Coercion (`src/schema/user.schema.ts` / `plan.schema.ts`)**:
  - Query parameters arrive as strings (`"1"`, `"10"`).
  - Used `z.coerce.number().int().positive()` to convert query strings to numbers automatically.
  - Enforced safety bounds: `page >= 1`, `1 <= limit <= 100` (prevents malicious requests like `?limit=1000000` from exhausting server memory).

---

### Edge Case 3: Test Lifecycle & Database Seeding Execution Order
* **The Bug**:
  - Top-level `await connection.insert(users)...` statements written inside a `describe()` block were executing **synchronously when Bun evaluated the test file**, *before* the `beforeAll()` hook was run!
  - When `beforeAll()` executed `await connection.delete(users)`, it wiped the database tables, destroying the top-level seeded records before individual test cases ran!

* **The Rule of Execution**:
  - **NEVER** place async DB queries or seed logic at the top level of `describe()` blocks.
  - All database cleanup (`delete`) AND initial record seeding MUST be wrapped inside `beforeAll(async () => { ... })`.

* **Concurrency Management**:
  - Multiple test files running concurrently in Bun attempt to read/write/wipe the same local Postgres database simultaneously.
  - **Enforced Rule**: Always run test suites with `bun test --maxConcurrency=1`.

---

## 3. Standard Response Envelopes (`src/utils/response.ts`)

To ensure frontends receive 100% consistent JSON structures across all endpoints:

### Success Helper
```ts
success(c, data, statusCode = 200, { message, pagination })
```
Outputs:
```json
{
  "ok": true,
  "data": { ... },
  "pagination": { "page": 1, "limit": 10, "total": 45, "totalPages": 5 },
  "message": "Operation successful"
}
```

### Failure Helper
```ts
failure(c, { code, message, description }, statusCode = 400)
```
Outputs:
```json
{
  "ok": false,
  "error": {
    "code": "INPUT_VALIDATION_ERROR",
    "message": "phone number must be a valid ethiopian number"
  }
}
```

---

## 4. End-to-End Test Suite Blueprint (109 Tests)

Every REST endpoint adheres to the following test matrix:

| HTTP Status | Condition Tested |
| :--- | :--- |
| `401 Unauthorized` | Request made without `Authorization: Bearer <token>` or session cookie. |
| `403 Forbidden` | Valid session token, but role is insufficient (e.g. member accessing staff API, or staff accessing owner API). |
| `400 Bad Request` | Zod schema validation fails (empty string, invalid phone format, negative price, limit > 100). |
| `409 Conflict` | Unique constraint violation (duplicate active phone number). |
| `404 Not Found` | Request targeting a non-existent UUID or wrong user role. |
| `200 / 201 Success` | Valid input payload and authorized role. |

### E2E Auth Mocking Pattern (`src/tests/e2e/*.api.test.ts`)
In E2E tests, we seed real `users` and `sessions` records in `beforeAll()`. Requests are dispatched using Hono's in-memory `app.request()` method:
```ts
const res = await app.request("/api/v1/members", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${staffToken}`,
  },
  body: JSON.stringify(validMemberPayload),
});
```

---

## 5. Multi-Tenancy Architecture Decision

### Single-Tenant vs Multi-Tenant SaaS
- **Snapshot Preserved**: Single-tenant foundation is saved on git branch `snapshot/single-tenant` (tag `single-tenant-v1.0`).
- **Target Architecture**: We are building a **Multi-Tenant SaaS** on `main`.

### Why Multi-Tenancy must be introduced NOW (before Memberships & Payments):
1. **Query Leakage Risk**: If single-tenant code is written first, every SQL query must later be refactored to add `where(eq(table.tenantId, tenantId))`. Missing `tenantId` in a single query allows Gym A to read Gym B's members or revenue.
2. **Composite Indexes**: Phone uniqueness changes from global `users(phone)` to composite per-tenant `(tenantId, phone)` because a person could be a member at Gym A and Gym B simultaneously.

---

## 6. Project Memory & Guidelines Protocol

To ensure no context is lost across agent turns or compacted history:
1. **`.agents/PROJECT_STATE.md`**: Single source of truth containing schemas, routes, test lists, and architecture. Updated after every major feature.
2. **`.agents/AGENTS.md`**: Enforces that all agents read `PROJECT_STATE.md` at the start of any non-trivial task.
3. **`.agents/DEVELOPER_PROFILE.md`**: Mentorship tracking document recording growth in domain modeling, SQL indexes, and TDD discipline.
