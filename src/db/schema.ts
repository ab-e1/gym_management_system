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
    name: p.text("name").notNull(),
    phone: p.text("phone").notNull().unique(),
    email: p.text("email").unique(),
    photoUrl: p.text("photo_url"),
    role: roleEnum("role").default("member").notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    isDeleted: p.boolean("is_deleted").default(false).notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [p.index("user_name_idx").on(table.name)],
);

export const membershipPlans = p.pgTable(
  "membership_plans",
  {
    id: p.uuid("id").defaultRandom().primaryKey(),
    name: p.text("name").notNull(),
    price: p.integer("price").notNull(),
    duration: p.integer("duration").notNull(),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
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
    planId: p
      .uuid("plan_id")
      .references(() => membershipPlans.id)
      .notNull(),
    startDate: p.timestamp("start_date").notNull(),
    endDate: p.timestamp("end_date").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    lastNotifiedDay: p.timestamp("last_notified_day"),
    createdAt: p.timestamp("created_at").defaultNow().notNull(),
    updatedAt: p.timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    p.index("memberships_user_id_idx").on(table.userId),
    p.index("memberships_end_date_status_idx").on(table.endDate, table.status),
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
    amount: p.integer("amount").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    recordedBy: p
      .uuid("recorded_by")
      .references(() => users.id)
      .notNull(),
    paidAt: p.timestamp("paid_at").defaultNow().notNull(),
  },
  (table) => [
    p.index("payments_memberships_id_idx").on(table.membershipId),
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
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    sentAt: p.timestamp("sent_at").defaultNow().notNull(),
    status: p.text("status").default("sent").notNull(),
  },
  (table) => [
    p
      .index("notification_log_dedupe_idx")
      .on(table.membershipId, table.type, table.sentAt),
  ],
);
