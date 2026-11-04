import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------- Customers & auth ---------------- */

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  status: text("status", { enum: ["active", "suspended", "deactivated"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerSessions = pgTable(
  "customer_sessions",
  {
    token: text("token").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("ix_sessions_customer").on(t.customerId)]
);

export const resetTokens = pgTable(
  "reset_tokens",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose", { enum: ["password_reset", "email_verify"] })
      .notNull()
      .default("password_reset"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_reset_tokens_customer").on(t.customerId)]
);

/* ---------------- Main administrators ---------------- */

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "staff"] }).notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    token: text("token").primaryKey(),
    adminId: integer("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("ix_admin_sessions_admin").on(t.adminId)]
);

/* ---------------- Plans & subscriptions ---------------- */

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    cycle: text("cycle", { enum: ["monthly", "yearly"] }).notNull(),
    priceCents: integer("price_cents").notNull(),
    // One-time (non-recurring) charge, e.g. the manual APK preparation fee.
    setupFeeCents: integer("setup_fee_cents").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    durationDays: integer("duration_days").notNull(),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    description: text("description").notNull().default(""),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_plans_active_sort").on(t.active, t.sort)]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => plans.id),
    status: text("status", { enum: ["active", "expired", "revoked"] })
      .notNull()
      .default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_subscriptions_customer").on(t.customerId, t.status)]
);

/* ---------------- Orders & payments ---------------- */

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderCode: text("order_code").notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => plans.id),
    amountCents: integer("amount_cents").notNull(),
    // How much of amountCents was the one-time setup fee (0 on renewals).
    setupFeeCents: integer("setup_fee_cents").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "refunded"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_orders_customer").on(t.customerId, t.createdAt)]
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    method: text("method").notNull().default("upi_manual"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("INR"),
    reference: text("reference"),
    proofName: text("proof_name"),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "refunded"],
    })
      .notNull()
      .default("pending"),
    rejectReason: text("reject_reason"),
    verifiedBy: integer("verified_by").references(() => admins.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    /* ---- online gateway (ZetPay) ---- */
    // Payment method actually used: "upi_manual" | "zetpay".
    gateway: text("gateway"),
    // ZetPay's order id (e.g. "ZP1782...ABCD"). Verified server-to-server.
    gatewayOrderId: text("gateway_order_id"),
    // Amount ZetPay reports back, in rupees — stored for reconciliation.
    gatewayAmount: integer("gateway_amount"),
    // Last status we saw from order-status: pending | success | failed.
    gatewayStatus: text("gateway_status"),
    // When a server-side order-status call returned "success".
    gatewayVerifiedAt: timestamp("gateway_verified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_payments_customer").on(t.customerId, t.createdAt),
    index("ix_payments_status").on(t.status),
    // Partial unique: at most one row per ZetPay order id.
    uniqueIndex("ix_payments_gateway_order")
      .on(t.gatewayOrderId)
      .where(sql`${t.gatewayOrderId} is not null`),
  ]
);

/* ---------------- Branding ---------------- */

export const branding = pgTable(
  "branding",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .unique()
      .references(() => customers.id, { onDelete: "cascade" }),
    appName: text("app_name"),
    tenantId: text("tenant_id").unique(),
    logoName: text("logo_name"),
    brandPrimary: text("brand_primary"),
    brandSecondary: text("brand_secondary"),
    firebaseProjectId: text("firebase_project_id"),
    firebaseAppId: text("firebase_app_id"),
    firebaseApiKey: text("firebase_api_key"),
    notes: text("notes"),
    status: text("status", { enum: ["draft", "submitted"] })
      .notNull()
      .default("draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_branding_customer").on(t.customerId)]
);

/* ---------------- APK releases (manual upload only) ---------------- */

export const apkReleases = pgTable(
  "apk_releases",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    appType: text("app_type", { enum: ["user", "admin"] }).notNull(),
    appName: text("app_name").notNull(),
    versionName: text("version_name").notNull(),
    versionCode: integer("version_code"),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    sha256: text("sha256").notNull(),
    releaseNotes: text("release_notes"),
    published: boolean("published").notNull().default(false),
    superseded: boolean("superseded").notNull().default(false),
    uploadedBy: integer("uploaded_by").references(() => admins.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_apk_customer").on(t.customerId, t.appType)]
);

/* ---------------- Audit, notifications, downloads ---------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorType: text("actor_type", { enum: ["customer", "admin", "system"] })
      .notNull()
      .default("system"),
    actorId: integer("actor_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_audit_created").on(t.createdAt),
    index("ix_audit_entity").on(t.entity, t.entityId),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["info", "success", "warning", "danger"] })
      .notNull()
      .default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_notif_customer").on(t.customerId, t.createdAt)]
);

export const downloadLog = pgTable("download_log", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  apkId: integer("apk_id")
    .notNull()
    .references(() => apkReleases.id, { onDelete: "cascade" }),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- Site content (admin-managed) ---------------- */

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});


