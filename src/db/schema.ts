import * as p from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = p.pgEnum("role", ["staff", "member", "owner"]);
export const userStatusEnum = p.pgEnum("user_status", ["active", "inactive"]);
export const membershipStatusEnum = p.pgEnum("membership_status", [
  "active",
  "expired",
  "cancelled",
]);
export const paymentMethodEnum = p.pgEnum("payment_method", [
  "bank",
  "telebirr",
  "cash",
]);

export const notificationTypeEnum = p.pgEnum("notification_type", [
  "expiry_warning",
  "expired",
  "call_list",
]);

export const notificationChannelEnum = p.pgEnum("notification_channel", [
  "telegram",
  "sms",
]);

export const users = p.pgTable(
  "users",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    name: p.text("name").notNull(),
    phoneNumber: p.text("phone").notNull(),
    email: p.text("email"),
    photoUrl: p.text("photo_url"),
    role: roleEnum("role").default("member").notNull(),
    phoneNumberVerified: p.boolean("phone_verified").default(false).notNull(),
    emailVerified: p.boolean("email_verified").default(false).notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    isDeleted: p.boolean("is_deleted").default(false).notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    p.index("user_name_idx").on(table.name),
    p.index("user_gym_id_idx").on(table.gymId),
    p.unique("user_phone_unique_per_gym").on(table.gymId, table.phoneNumber),
    p.unique("user_email_unique_per_gym").on(table.gymId, table.email),
    p
      .index("user_all_members_idx")
      .on(table.gymId, table.role, table.isDeleted),
    p
      .index("user_all_active_members")
      .on(table.gymId, table.role, table.isDeleted, table.status),
  ],
);

export const membershipPlans = p.pgTable(
  "membership_plans",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    name: p.text("name").notNull(),
    price: p.integer("price").notNull(),
    duration: p.integer("duration").notNull(),
    isDeleted: p.boolean("is_deleted").default(false).notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .defaultNow()
      .notNull(),
  },
  (table) => [
    p.index("membershipPlans_gym_id_idx").on(table.gymId),
    p.check("price_positive_check", sql`${table.price} > 0`),
    p.check("duration_postive_check", sql`${table.duration} > 0`),
  ],
);

export const memberships = p.pgTable(
  "memberships",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    userId: p
      .uuid("user_id")
      .references(() => users.id)
      .notNull(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    planId: p
      .uuid("plan_id")
      .references(() => membershipPlans.id)
      .notNull(),
    startDate: p.timestamp("start_date").notNull(),
    endDate: p.timestamp("end_date").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    lastNotifiedDay: p.timestamp("last_notified_day"),
    isDeleted: p.boolean("is_deleted").default(false).notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .defaultNow()
      .notNull(),
  },
  (table) => [
    p.index("memberships_gym_id_idx").on(table.gymId),
    p.index("memberships_user_id_idx").on(table.userId),
    p
      .index("memberships_auto_expire_idx")
      .on(table.gymId, table.status, table.endDate),
    p
      .index("memberships_user_active_idx")
      .on(table.gymId, table.userId, table.status, table.endDate),
    p
      .index("memberships_gym_user_deleted_idx")
      .on(table.gymId, table.userId, table.isDeleted),
  ],
);

export const payments = p.pgTable(
  "payments",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),

    membershipId: p
      .uuid("membership_id")
      .references(() => memberships.id)
      .notNull(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    amount: p.integer("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    recordedBy: p
      .uuid("recorded_by")
      .references(() => users.id)
      .notNull(),
    paidAt: p.timestamp("paid_at").defaultNow().notNull(),
    referenceCode: p.text("reference_code"),
  },
  (table) => [
    p.index("payments_memberships_id_idx").on(table.membershipId),
    p.index("payments_gym_id_idx").on(table.gymId),
    p.index("payments_paid_at_idx").on(table.paidAt),
    p.check("amount_positive_check", sql`${table.amount} > 0`),
  ],
);

export const notificationLog = p.pgTable(
  "notification_log",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    membershipId: p
      .uuid("membership_id")
      .references(() => memberships.id)
      .notNull(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    sentAt: p.timestamp("sent_at").defaultNow().notNull(),
    status: p.text("status").default("sent").notNull(),
  },
  (table) => [
    p.index("notificationLog_gym_id_idx").on(table.gymId),
    p
      .index("notification_log_dedupe_idx")
      .on(table.membershipId, table.type, table.sentAt),
  ],
);

export const leads = p.pgTable(
  "leads",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    gymId: p
      .uuid("gym_id")
      .references(() => gyms.id)
      .notNull(),
    name: p.text("name").notNull(),
    phoneNumber: p.text("phone").notNull(),
    email: p.text("email"),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },

  (table) => [
    p.index("leads_name_idx").on(table.name),
    p.index("leads_gym_id_idx").on(table.gymId),
  ],
);

export const gyms = p.pgTable("gyms", {
  id: p.uuid("id").defaultRandom().primaryKey(),
  name: p.text("name").notNull(),
  slug: p.text("slug").notNull().unique(),
  status: userStatusEnum("status").default("active").notNull(),
  isDeleted: p.boolean("is_deleted").default(false).notNull(),
  createdAt: p.timestamp("created_at").defaultNow().notNull(),
  updatedAt: p
    .timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
});
// ─────────────────────────────────────────────
// BETTER AUTH TABLES
// ─────────────────────────────────────────────

// 7. SESSION TABLE
// Tracks active staff/owner tablet logins.
// id is text (Better Auth generated internal ID). userId is uuid referencing users.id.
export const sessions = p.pgTable(
  "sessions",
  {
    id: p.text("id").primaryKey(),
    userId: p
      .uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: p.text("token").notNull().unique(),
    expiresAt: p.timestamp("expires_at").notNull(),
    ipAddress: p.text("ip_address"),
    userAgent: p.text("user_agent"),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [p.index("session_user_id_idx").on(table.userId)],
);

// 8. ACCOUNT TABLE
// Stores hashed passwords and OAuth provider credentials.
// Includes access/refresh tokens for potential future OAuth integrations (Google, etc).
export const accounts = p.pgTable(
  "accounts",
  {
    id: p.text("id").primaryKey(),
    userId: p
      .uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: p.text("account_id").notNull(),
    providerId: p.text("provider_id").notNull(),
    accessToken: p.text("access_token"),
    refreshToken: p.text("refresh_token"),
    idToken: p.text("id_token"),
    accessTokenExpiresAt: p.timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: p.timestamp("refresh_token_expires_at"),
    scope: p.text("scope"),
    password: p.text("password"),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [p.index("account_user_id_idx").on(table.userId)],
);

// 9. VERIFICATION TABLE
// Stores SMS OTP codes and email verification tokens.
// Uses "identifier" (phone number or email) instead of userId
// because the user may not be logged in yet when requesting an OTP.
export const verifications = p.pgTable(
  "verifications",
  {
    id: p.text("id").primaryKey(),
    identifier: p.text("identifier").notNull(),
    value: p.text("value").notNull(),
    expiresAt: p.timestamp("expires_at").notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p
      .timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [p.index("verification_identifier_idx").on(table.identifier)],
);
