# TurfLaunch — White-Label Tournament App SaaS

Complete Next.js 16 + PostgreSQL source package.

## What's inside
- Public marketing site, customer dashboard, and Main Admin panel
- Single subscription plan: ₹299 one-time setup + ₹50/month
- ZetPay automatic UPI checkout with **server-side** payment verification
- Manual admin payment verification (kept as a fallback/reference)
- Manual APK upload + assignment with SHA-256, private storage, authorised downloads
- Gmail SMTP transactional email + operator alerts
- Mobile-first UI with a fixed bottom tab bar and animations

## Setup
```bash
cp .env.example .env.local          # then fill in the values
npm install
npx drizzle-kit push                # create tables (drizzle.config.json)
npm run build && npm start
```

Then open `/admin/bootstrap` **once** to create the owner account (the page
permanently closes after that).

### Required environment variables
| Key | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Gmail SMTP (use an App Password, not your Google password) |
| `ADMIN_NOTIFY_EMAIL` | Inbox that receives all important platform alerts |
| `ZETPAY_API_KEY` | ZetPay / ZetAPI key (server-side only) |
| `ZETPAY_ENABLED=1` | Turns on automatic UPI checkout |

Integrations can also be edited at runtime in **Admin → System**; those values
are stored in the database and take effect immediately. Real environment
variables always win over stored values.

## ZetPay notes
- Orders are created server-side; the API key is never sent to the browser.
- Fulfilment requires `GET /api/developer/order-status/:id` returning
  `status === "success"` from our server. Redirects and browser callbacks are
  never trusted.
- Limits: ₹1–₹5,000 per payment, 60 API calls / 15 min (the app throttles
  itself below this and caches status briefly).
- The ZetPay account has its own **Test / Live** toggle in the ZetPay dashboard.

## Scripts
- `node scripts/reset-admin-password.mjs <email> "<new-password>"` — emergency
  owner recovery; also revokes every admin session.
- `node scripts/seed.mjs` — optional idempotent content/bootstrap seed.

## Security
Secrets live only in `.env.local` or the database — never in source.
Passwords use scrypt. Customer data is isolated by `customer_id` on every query.
APKs and payment proofs are stored outside the public web root and served only
through ownership-checked routes.

See `deploy/DEPLOY.md` and `deploy/mysql-schema.sql` for hosting notes.
