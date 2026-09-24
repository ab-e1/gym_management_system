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
- **2026-09-24**: Articulated product-market fit requirements for Ethiopian market context (Phone-first identity, optional email, SMS/OTP workflow).

---

## 10. Next Recommended Challenges
1. Implement Hono route handlers & controllers for Staff (`/api/v1/staff`) using `zValidator` and test with full E2E test suite.
2. Transition to Phase 2: Lead Acquisition CRM Module (`leads` table schema + `convertLeadToMember` transaction).

