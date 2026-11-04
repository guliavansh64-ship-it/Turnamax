# TurfLaunch — White-Label Tournament App SaaS

A complete white-label tournament app platform. Customers register, buy a subscription, submit
their branding and UPI payment; the **Main Admin** verifies the payment by hand, prepares the two
branded APKs **outside** this website (from the base templates) and uploads/publishes them. The
customer then downloads **User Panel APK** and **Admin Panel APK** from their dashboard.

> **Stack note.** This sandbox provides a Next.js (App Router) + PostgreSQL/Drizzle runtime, so
> the platform is delivered on that stack. The architecture maps 1:1 to the PHP 8.2/MySQL
> requirements: Drizzle prepared statements ≙ PDO prepared statements, the `storage/` directory
> ≙ private upload directory outside the web root, token sessions in `customer_sessions` /
> `admin_sessions` tables ≙ secure PHP sessions, `site_settings` ≙ content table, etc.

## The exact workflow

1. Visitor lands on the animated public site (hero, live product previews, features, how-it-works,
   dynamic pricing from the DB, FAQ, honest trust section, footer with legal pages).
2. Customer **registers** (scrypt-hashed password, token session, rate-limited, optional email
   verification) and logs in.
3. Customer fills **App Branding** (app name, logo upload, brand colors, tenant id auto-derived,
   optional Firebase project/app/API key, notes).
4. Customer goes to **Checkout**: picks a plan, sees the UPI VPA (admin-configured), pays via UPI,
   submits the transaction reference (UTR) and optionally a screenshot proof.
   - A unique order code (e.g. `TNT-20250614-9F3A`) is created; the payment row is `pending`.
   - **The amount is always read from the server-side plan record — never from the client.**
   - No UPI PIN/OTP/banking credentials are ever asked for.
5. **Main Admin** (separate login, separate cookie) reviews the customer profile: branding,
   payment reference + proof. Then **Approves** (or Rejects with a mandatory reason).
   - Approval is an atomic `pending → approved` transition (double-approval impossible) inside a
     DB transaction that also activates/extends the subscription and notifies the customer.
   - Approving a payment **never** triggers any build step.
6. Admin opens the customer profile, reviews the branding (name, logo, colors, tenant id,
   Firebase), prepares both APKs manually from the base templates, then **uploads** each APK
   (`.apk` + ZIP-signature + size validation, SHA-256 recorded), sets version/notes, and
   **Publishes**. Publishing replaces the previous published version of that app type.
7. The customer's **My APKs** dashboard flips from
   *“Your customized APK is being prepared. Please check back later.”* to download cards with
   version, upload date, size, SHA-256, release notes and an authenticated download link.
8. Renewal = repeat steps 4–5; expiry enforcement pauses downloads after a 7-day grace period
   (configurable) and marks the subscription expired; prepared APKs are **never deleted**.

## Base templates (existing tournament app source)

- `public/templates/user-panel.html` — Tournament **User Panel** base template.
- `public/templates/admin-panel.html` — Tournament **Admin Panel** base template.

These represent the original tournament app UIs and are linked from the landing page as live
previews. Replace them with your production template files — the platform does **not** compile,
sign or regenerate APKs. Customization (app name, launcher icon, tenant id, Firebase config,
brand colors) happens at preparation time in your own toolchain.

## Getting started

```bash
# 1. env
cp .env.example .env          # set DATABASE_URL

# 2. database schema (idempotent; no migration files required)
npx drizzle-kit push

# 3. run
npm run dev                   # or: npm run build && npm start
```

Seeding (default plans + site content) happens automatically on first page load — idempotent.

### First administrator (secure bootstrap)

- Visit `/admin/bootstrap`. It renders **only while zero admins exist**.
- Create the owner account (password ≥ 10 chars, weak-password blocklist, rate-limited).
- After the first admin exists, the bootstrap page and API permanently refuse.
- Log in at `/admin/login`. All admin actions are audit-logged.

## Main admin panel (`/admin`)

| Area | Capabilities |
|---|---|
| Dashboard | Real counts: customers, active/expired subs, pending payments + value, verified revenue, APKs awaiting preparation, published releases, suspended, recent activity |
| Customers | Search/filter/paginate; profile with status (activate/suspend/deactivate), branding review, subscription assign/extend/revoke, payments approve/reject/refund, APK upload + publish/unpublish/revoke, per-customer activity |
| Payments | Status tabs, search by order/UTR/email, proof viewer, approve / reject (reason required) / refund (revokes subscription), filtered totals |
| Plans | Create/edit/deactivate/feature plans, monthly & yearly pricing, duration, features — live on the public site |
| APK releases | Global table of all releases with customer, uploader, checksums, publish controls |
| Content | Hero copy, UPI details, contact, FAQs, features, announcements, testimonials (real reviews only), terms/privacy/refund |
| Audit | Filterable log of every admin + customer action with actor, entity, meta, IP |

## Database schema (PostgreSQL via Drizzle)

`customers`, `customer_sessions`, `reset_tokens`, `admins`, `admin_sessions`, `plans`,
`subscriptions`, `orders`, `payments`, `branding`, `apk_releases`, `audit_log`,
`notifications`, `download_log`, `site_settings` — with indexes and FKs
(see `src/db/schema.ts`). Apply with `npx drizzle-kit push`.

## Security model

- **Passwords**: scrypt with per-user salt, timing-safe compare. Never stored in plaintext.
- **Sessions**: 256-bit random tokens, HttpOnly, SameSite=Lax, Secure (production), short TTL for
  admins (12 h), stored server-side with expiry; revocable.
- **Authorization**: every API checks the correct session; every customer query is scoped to the
  caller's `customer_id` (branding, payments, APKs, files). Admin routes require an admin session.
  A customer can never fetch another customer's APK/logo/proof (ownership + filename-pattern +
  DB check).
- **Payments**: never approved by the frontend; atomic status transition prevents duplicate
  approval/activation; rejection requires a reason; refunds are audited and revoke the
  subscription.
- **Uploads**: validated by magic bytes (APK = ZIP signature, logos = PNG/JPEG/WEBP, proof =
  image/PDF), size limits, random filenames, stored in `storage/` **outside any public directory**,
  served only through authenticated route handlers.
- **CSRF**: origin-header check on all mutating routes + SameSite=Lax cookies.
- **Rate limiting**: register, login, admin login, forgot/reset password, order creation, APK
  uploads, bootstrap.
- **Audit**: admin actions (login, payment decisions, plan/content changes, APK lifecycle,
  customer status, subscription grants) and customer actions (register, orders, downloads) are
  logged in `audit_log` with actor + IP.
- **Tenant isolation**: each customer gets a unique `tenant_id` baked into their builds;
  Firebase credentials (if used) are stored server-side only. Note: config changes alone are not
  a complete isolation guarantee — the tournament app's server-side rules (Auth + DB security
  rules per project) must enforce tenant authorization; if your Firebase setup cannot, isolate
  per-customer Firebase projects (the branding fields support this per customer).

## Download & expiry policy

- Downloads allowed while the subscription is active **or** within `DOWNLOAD_GRACE_DAYS` (7) of
  expiry. After that, the dashboard shows a renewal banner and download routes return 403.
- Expired customers keep their APK files; renewal restores access automatically.
- Every download is recorded in `download_log` + `audit_log`.

## Email delivery (Gmail SMTP) — configured and verified

`EMAIL_ENABLED=1` plus Gmail SMTP credentials in `.env` enables real transactional email.
Delivery was verified live during setup. All of these are sent automatically:

| Event | Email |
|---|---|
| Registration | Verification link (14-day expiry) |
| Password reset | Single-use link (60-min expiry) |
| Payment approved / rejected / refunded | Status + reason / refund confirmation |
| APK published / revoked | "Ready to download" / withdrawal notice |
| Subscription assigned / extended / revoked | Confirmation |
| Subscription expiring / expired | Renewal warning |

Implementation: `src/lib/mailer.ts` (transport + responsive HTML templates, tight timeouts,
fail-safe so a mail outage never blocks a business action) and `src/lib/utils.ts#notify()`,
which writes the in-app notification **and** sends the email. If email is unavailable, the
verification/reset link falls back to being shown on-screen so the flow still works.

Verify or re-test any time at **Admin → System → Send test email**.

## Admin → System (new)

Live status page for the two services the platform depends on:

- **Email delivery** — SMTP config summary, credential verification, and a real test send.
- **Production MySQL** — read-only connect + ping + table count against `MYSQL_*`, with masked
  host/user (never displays the password). Useful for confirming hosting credentials before
  go-live; it never writes to the remote database.
- **Active configuration** — session TTLs, upload limits, download grace period, storage location.

## Deployment (alchosting / alchemyCP)

See **`deploy/DEPLOY.md`** for the full, credential-specific guide and
**`deploy/mysql-schema.sql`** for the production MySQL 8 / MariaDB schema (15 tables + seed
plans, idempotent). It documents the one hosting-side change still required: enabling
**Remote MySQL** access so the database accepts connections from the app server.

## Deployment checklist (PHP/MySQL-compatible hosting → any Node host)

1. Node 20+ host with PostgreSQL (or MySQL via Drizzle's mysql dialect if preferred).
2. `cp .env.example .env` → set `DATABASE_URL`, `APP_BASE_URL`, UPI details in the admin panel.
3. `npx drizzle-kit push` → `npm ci && npm run build` → start.
4. HTTPS (reverse proxy, e.g. Caddy/Nginx + TLS). Secure cookies activate automatically in
   production; keep the site behind TLS so HttpOnly Secure cookies work.
5. Keep `storage/` out of document root (it already is — Next only serves `public/`). Add disk
   monitoring; remove superseded APK files on disk if desired (the row metadata remains).
6. **Backups**: `pg_dump -Fc app_db > backup_$(date +%F).dump` nightly + before schema changes.
   Also back up the `storage/` directory. Rollback = restore dump + previous build artifact.
7. Error logging: route handlers return safe generic errors; add a process logger (e.g.
   `pino`) at the server level in production.

## Test results (verified in this environment)

- `next typegen`, `tsc --noEmit`, production `next build` — pass.
- `/api/health` — passes (DB round-trip OK).
- Flow walkthrough: seed → register → login → branding save/upload logo → checkout (order +
  pending payment created server-side) → admin bootstrap → admin login → approve payment
  (subscription activated, duplicate-approve blocked) → APK upload (checksum recorded) →
  publish → customer sees ready cards + authorized download.
- Isolation checks: customer A's download route returns 404 for customer B's release id;
  logo/proof routes enforce ownership; bootstrap refuses after first admin.

## Honest-data policy

The public site never shows fake testimonials, download counts or statistics. Testimonials are
admin-managed content (empty by default) and the landing page says so. All admin dashboard
figures are computed from actual rows.
