# Developer Profile & Learning Ledger

This is a living, evidence-based record of engineering development for the Gym Management System repository.

---

## 1. Current Engineering Profile
- **Role / Context**: Full-stack / Backend engineer building a production Gym Management System using Bun, Hono, Drizzle ORM, PostgreSQL, and Better Auth.
- **Current Level**: Intermediate application developer with strong domain intuition and commitment to TDD. Actively refining mental models around SQL query execution, TypeScript narrowing, and test isolation.

---

## 2. Demonstrated Strengths
- **Domain Boundaries** (FACT): Correctly identified and separated Member CRUD data operations (`user.service.ts`) from authentication identity/token management (Better Auth).
- **TDD Discipline** (FACT): Maintained a test suite of 46 passing tests across unit, integration, and E2E layers before expanding feature implementation.
- **Pattern Adoption** (FACT): Immediately recognized the superiority of the Drizzle Array filter pattern (`const conditions = [...]`) over `let` re-assignment once shown side-by-side.

---

## 3. Active Weaknesses
- **Premature Fix Requests** (FACT): Tendency to ask *"what is the cause for this now?"* immediately upon seeing an error log before formulating an initial diagnostic hypothesis or inspecting raw log lines.

---

## 4. Incorrect Mental Models Discovered
- **JS vs SQL Execution Boundary** (FACT): Believed that if a PostgreSQL query returned 0 rows for a search term, a JavaScript ternary condition (`searchCondition ? ... : ...`) would fall back to returning all members.
- **TypeScript Type Narrowing & Re-assignment** (FACT): Reassigned `filterCondition = and(filterCondition, searchCondition)` without recognizing why Drizzle's `SQL<unknown> | undefined` return type triggers assignment errors in strict TS.
- **Better Auth Field Propagation** (FACT): Missed adding `role` to `user.additionalFields` in `auth.ts`, causing `session.user.role` to be undefined and failing RBAC authorization middleware.

---

## 5. Debugging Development
- **Status**: Transitioning from error-prompting to evidence-first log extraction.
- **Goal**: Formulate a explicit hypothesis + log evidence before applying code changes or asking for solutions.

---

## 6. AI Usage Pattern
- **Status**: Uses AI as an architectural sounding board and code reviewer.
- **Goal**: Build independent mental models so AI is used as a force multiplier rather than a reasoning crutch.

---

## 7. Current Learning Priorities (Ranked)
1. **SQL & Drizzle Query Mechanics**: Understanding dynamic `WHERE` clause evaluation (`and`, `or`, `ilike`).
2. **TypeScript Type Safety**: Avoiding non-null assertions (`!`) in favor of immutability and type narrowing.
3. **Database Concurrency & Isolation**: Understanding PostgreSQL table locks and test concurrency (`--maxConcurrency=1`).

---

## 8. Concepts Demonstrated Independently
- REST API pagination metadata math (`totalPages = Math.ceil(total / limit)`).
- Schema validation with Zod (Regex rules, optional fields, partial updates).

---

## 9. Evidence of Growth
- **2026-09-14**: Successfully identified the architectural distinction between User Service (`user.service.ts`) and Auth Service (`auth.service.ts`).
- **2026-09-14**: Transitioned from `let` re-assignment to the idiomatic Drizzle Array filtering pattern.
- **2026-09-24**: Independently reasoned about PostgreSQL `UNIQUE` key constraints vs soft-deleted user reactivation (`createStaff` converting soft-deleted members to staff instead of triggering `23505` duplicate key errors).
- **2026-11-21**: Independently identified that a standalone `INSERT` does not need a transaction wrapper in `session.service.ts`, demonstrating sound understanding of individual SQL statement atomicity.
- **2026-11-21**: Championed root-cause architectural fixes: recognized that Ethiopian phone validation should be enforced within `normalizePhoneNumber` in `helpers.ts` rather than patching individual callers, instantly turning all auth unit tests green.
- **2026-11-18**: Independently spotted `id: p.uuid("id").defaultRandom()` in `schema.ts` for `verifications`, confirming that omitting `id` during `.insert()` relies on database-generated UUIDs. Successfully scoped database transactions to isolate DB writes and decouple long external HTTP calls (`sendSms`).
- **2026-09-24**: Articulated product-market fit requirements for Ethiopian market context (Phone-first identity, optional email, SMS/OTP workflow).
- **2026-09-25**: Grasped relational database constraints, CASCADE delete catastrophic failure modes in financial/subscription ledgers vs soft-delete archival, and strictly executed a TDD Red-Green cycle.
- **2026-10-06**: Demonstrated mastery of explicit privilege transitions (Stripe-style 409 conflict pattern with structured `details` metadata instead of silent privilege escalation), soft-delete session invalidation, and auth gatekeeper lifecycle logic.
- **2026-10-10**: Designed and implemented atomic multi-table orchestration with transactional client injection (passing `tx` to `recordPayment`), fail-fast precondition ordering ($O(1)$ plan lookup before user scan), and resolved foreign-key cascading teardown in test lifecycle hooks.
- **2026-10-10**: Caught defensive optional chaining anti-pattern (`user?.id`), correctly reasoning that `staffId` is mandatory for PostgreSQL `NOT NULL` audit constraints on `recorded_by` and advocating for strict boundary validation instead of silent `undefined` propagation.
- **2026-10-14**: Identified domain boundary conflation between operational lifecycle churn (`status: inactive` for lapsed members, churn analytics, bulk SMS re-engagement) and administrative discipline (`status: banned`). Recognized that treating inactive accounts as banned creates fatal front-desk friction when churned members return to renew.
- **2026-10-18**: Critically challenged pagination count drift and historical ledger data integrity. Advocated for strict best-practice scrutiny against premature feature creep (rejecting ambiguous date/month filtering on operational CRUD endpoints in favor of dedicated aggregate reporting) and identified that retired catalog plans must remain preserved in subscription history via `LEFT JOIN`.
- **2026-10-27**: Independently identified the multi-tenant identity collision vulnerability in phone-first auth (global phone lookups failing on tenant-isolated schemas), demanded strict TDD verification, and guided the architectural design toward a zero-friction phone-first disambiguation model that blocks member elevation while maintaining 100% Better Auth session compatibility.
- **2026-11-01**: Critically analyzed SQL wildcard pattern matching, evaluated performance tradeoffs between B-Tree index scans with escaped ILIKE vs PostgreSQL Trigram (`pg_trgm`) GIN indexing, and advocated for maintainable, reusable domain utility naming (`escapeSqlLikePattern`) across search services.
- **2026-11-02**: Independently deduced the cross-tenant identity tampering vulnerability in multi-tenant SaaS architecture: recognized that permitting one gym owner to alter a shared operator's global `phoneNumber` in `users` directly alters their login identity across other gym branches, creating an account hijacking / lockout vector across tenant boundaries.
- **2026-11-04**: Successfully internalized and applied explicit column projection (`.select({ id: ..., name: ... })`) across multiple service endpoints to eliminate `SELECT *` overfetching, and independently reasoned about CRM member-to-staff elevation workflows.
- **2026-11-05**: Prioritized rigorous code-review auditing and strict TDD verification for multi-tenant isolation boundaries: scoped session invalidation in `deleteStaffToggle` to `activeGymId` (preventing cross-facility session revocation) and implemented tenant ownership validation in standalone `recordPayment` to secure the financial ledger.
- **2026-11-10**: Critiqued low-level utility anti-patterns: independently spotted inconsistent response envelopes (rejecting Twilio-style loose `{ success, error }` in favor of the project's standardized `{ ok: true, data } | { ok: false, error }` Result Union) and eliminated side-effect logging (`console.warn` / `console.error`) inside core utilities to preserve pure error propagation.
- **2026-11-16**: Mastered sliding-window rate limiting and memory lifecycle architecture: independently wrote the core decision logic for `otpRatelimit.ts` (cooldown math, timestamp filtering, proxy IP extraction). Critically reasoned about shared gym Wi-Fi NAT bottlenecks, $O(N)$ memory growth versus LRU bounds, and correctly identified that Account Enumeration protection belongs at the API controller boundary rather than the rate-limiter utility.

---

## 10. Next Recommended Challenges
1. Lead Acquisition CRM Module (`leads` table schema + `convertLeadToMember` transaction).
2. Background Expiry Notification Engine (cron/job worker evaluating expiring memberships and logging Telegram/SMS alerts to `notificationLog`).
3. Front-Desk Member Check-in & Attendance Verification (`attendance` log schema + check-in validation against active membership).

