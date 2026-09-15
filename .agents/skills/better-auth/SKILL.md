---
name: better-auth
description: Comprehensive reference and guide for integrating Better Auth with Hono, Bun, Drizzle ORM, PostgreSQL, Phone Number plugin, Bearer tokens, and custom database schemas.
---

# Better Auth Integration Guide & Reference

This skill provides full technical documentation, standard operating procedures, and architectural guidelines for using **Better Auth** in Bun + Hono + Drizzle ORM + PostgreSQL projects.

---

## 1. Overview & Key Architecture

Better Auth is a modern TypeScript-first authentication framework designed around Web Standard `Request` and `Response` objects.

### Core Stack Requirements
- **Runtime**: Bun / Node.js (Web Standard APIs)
- **HTTP Framework**: Hono
- **ORM / Database**: Drizzle ORM + PostgreSQL
- **Adapter Package**: `@better-auth/drizzle-adapter` (**Note**: do NOT import adapter directly from `"better-auth/adapters/drizzle"`, always install and use `@better-auth/drizzle-adapter`).

---

## 2. Drizzle Adapter & Database Schema Rules

### Package Installation
```bash
bun add better-auth @better-auth/drizzle-adapter
```

### Table Pluralization (`usePlural: true`)
By default, Better Auth expects singular table names (`user`, `session`, `account`, `verification`). If your database schema uses plural table names (`users`, `session` or `sessions`, `account` or `accounts`, `verification` or `verifications`), pass `usePlural: true` in the Drizzle adapter options:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db/connection";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true, // Auto-maps 'user' -> 'users', 'account' -> 'accounts', 'session' -> 'sessions'/'session', 'verification' -> 'verifications'/'verification'
  }),
  // ...
});
```

### Custom Primary Keys (UUID vs Text)
If your `users` table uses PostgreSQL `uuid` for `id` (e.g. `uuid("id").defaultRandom().primaryKey()`), Better Auth supports this provided:
1. `session.userId` in your schema is typed as `uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`.
2. `account.userId` in your schema is typed as `uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" })`.
3. In `auth.ts`, disable internal string ID generation for the database adapter so PostgreSQL generates the UUID automatically:

```ts
advanced: {
  database: {
    generateId: false, // Prevents Better Auth from generating random text IDs for UUID columns
  },
}
```

> **Important**: `session.id`, `account.id`, and `verification.id` remain `text` PKs in Better Auth internal logic. Only `users.id` and the foreign keys referencing `users.id` need to match (`uuid`).

### Field Mapping (`user.fields`)
If your domain database schema uses different column names than Better Auth defaults (e.g., `phone` instead of `phoneNumber`, `photo_url` instead of `image`), map them in the `user.fields` configuration:

```ts
user: {
  fields: {
    phoneNumber: "phone",
    phoneNumberVerified: "phone_verified", // or "phoneVerified" depending on column name
    image: "photo_url",
  },
},
```

---

## 3. Server Configuration (`auth.ts`)

Complete server instance template for Hono + Bun + Drizzle + PostgreSQL + Phone Number plugin:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { phoneNumber } from "better-auth/plugins";
import { db } from "./connection";
import { betterAuthSecret, betterAuthUrl } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  user: {
    fields: {
      phoneNumber: "phone",
      phoneNumberVerified: "phone_verified",
      image: "photo_url",
    },
  },
  advanced: {
    database: {
      generateId: false, // Let PostgreSQL handle UUID PK generation
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }, ctx) => {
        // Implement SMS provider logic here (e.g. Twilio, Infobip, SMS gateway)
        console.log(`[SMS OTP] Send verification code ${code} to ${phoneNumber}`);
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 1,  // Refresh session expiration daily on activity
  },
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,
});
```

---

## 4. Hono Integration (`app.ts` / `server.ts`)

Better Auth and Hono both use Web Standard `Request` and `Response` objects. No complex wrapper adapter is required.

### Mounting Better Auth Handler
In your Hono app:

```ts
import { Hono } from "hono";
import { auth } from "./config/auth";

const app = new Hono();

// Mount all Better Auth endpoints (/api/auth/sign-in, /api/auth/sign-up, /api/auth/verify-phone, etc.)
app.all("/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

export default app;
```

### Protecting Hono Routes & Session Access
To retrieve the active session inside Hono route handlers or middleware:

```ts
import { Hono } from "hono";
import { auth } from "./config/auth";

const app = new Hono();

// Custom Auth Middleware
app.use("/api/protected/*", async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Store user and session on Hono context variable
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
```

---

## 5. Phone Number Plugin Mechanics

The Phone Number plugin enables sign up, sign in, and phone verification via OTP (One-Time Password).

### Server Plugin Setup
```ts
import { phoneNumber } from "better-auth/plugins";

phoneNumber({
  sendOTP: async ({ phoneNumber, code }, ctx) => {
    // Dispatch SMS code to user's phone number
  },
  signUpOnVerification: {
    getTempEmail: (phoneNumber) => `${phoneNumber}@temp.local`,
  },
})
```

### Core API Operations
1. **Send OTP Code**: Calls `sendOTP` defined on the server.
2. **Verify OTP / Sign In**: Verifies the 6-digit code against database verification record and generates session cookie or bearer token.
3. **Phone Number Schema Requirement**:
   - `users` table requires `phoneNumber` (text) and `phoneNumberVerified` (boolean) fields.
   - `verifications` table is used for holding temporary OTP codes and expiration timestamps (`expiresAt`).

---

## 6. Bearer Token Plugin (Mobile / API Clients)

If requests come from mobile apps or non-browser API clients where cookies are not available:

### Server Setup
```ts
import { bearer } from "better-auth/plugins";

export const auth = betterAuth({
  // ...
  plugins: [
    bearer(),
  ],
});
```

### Usage
- Client sends header: `Authorization: Bearer <session_token>`
- Better Auth intercepts the request and verifies the session token automatically.

---

## 7. Schema Summary Reference (PostgreSQL + Drizzle)

Standard Drizzle ORM schema for Better Auth tables when combined with custom application domain logic:

```ts
import { pgTable, uuid, text, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";

// --- Domain Tables ---
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").unique(),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  photoUrl: text("photo_url"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Better Auth Tables ---
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

---

## 8. Troubleshooting & Common Pitfalls

1. **`Cannot find module 'better-auth/adapters/drizzle'`**:
   - **Cause**: Using old or invalid import path.
   - **Fix**: Install `@better-auth/drizzle-adapter` and import `drizzleAdapter` from `@better-auth/drizzle-adapter`.

2. **Type Mismatch on `userId` (`text` vs `uuid`)**:
   - **Cause**: Drizzle schema defines `session.userId` as `text` while `users.id` is `uuid`.
   - **Fix**: Define `session.userId` and `account.userId` as `uuid("user_id").references(() => users.id)`. Set `advanced.database.generateId: false` in `auth.ts`.

3. **Table Name Mismatch (`user` vs `users`)**:
   - **Cause**: Drizzle schema names table `users` but Better Auth searches for `user`.
   - **Fix**: Set `usePlural: true` in `drizzleAdapter(db, { provider: "pg", usePlural: true })`.

4. **Hono Route Not Catching Auth Endpoints**:
   - **Cause**: Using `app.get` or `app.post` instead of `app.all("/api/auth/*", ...)`.
   - **Fix**: Always use `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))` so all HTTP verbs (POST, GET, OPTIONS) reach Better Auth.
