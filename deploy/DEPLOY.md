# Deploying TurfLaunch — alchosting (alchemyCP) + Gmail

This guide covers exactly what your credentials are used for, what is already configured, and
the one hosting-side change still needed for MySQL.

---

## 1. What you gave me, and where it lives

| Credential | Where it is stored | Status |
|---|---|---|
| Gmail `guliavansh64@gmail.com` + app password | `.env` → `SMTP_USER` / `SMTP_PASS` | ✅ **Working — verified live** |
| MySQL host `sq1301.alchosting.xyz` | `.env` → `MYSQL_HOST` | Reachable (port 3306 open) |
| DB `alcy_42527633_freefiresaas` | `.env` → `MYSQL_DATABASE` | ⚠️ Needs **Remote MySQL** enabled |
| MySQL user + password | `.env` → `MYSQL_USER` / `MYSQL_PASSWORD` | ⚠️ Same fix needed |

**All credentials live only in `.env`, which is gitignored.** They are never hardcoded in source,
never placed in HTML/JS, and never returned by any API. `.env.example` contains placeholders only.

---

## 2. Gmail — already working ✅

A real test message was delivered to **guliavansh64@gmail.com** during setup. Gmail accepted the
app password and the message was accepted for delivery.

### Emails now sent automatically

| Event | Email |
|---|---|
| Customer registers | Verification link (14-day expiry) |
| Customer forgets password | Reset link (60-min expiry, single use) |
| Payment approved | "Payment verified & approved" + subscription end date |
| Payment rejected | Rejection reason from the admin |
| Payment refunded | Refund confirmation |
| APK published | "Your User/Admin Panel APK is ready" |
| APK revoked | Withdrawal notice |
| Subscription near expiry / expired | Renewal warning |
| Admin assigns / extends / revokes a plan | Confirmation notice |

### If Gmail ever stops sending

1. Google Account → **Security** → 2-Step Verification must stay **on**.
2. App passwords can be revoked — generate a new one and update `SMTP_PASS` in `.env`.
3. Gmail limits ~500 messages/day. If you approach it, switch `SMTP_HOST` to a transactional
   provider (Resend, Postmark, SES) — only `src/lib/mailer.ts` needs the new host/credentials.
4. Test anytime: **Admin → System → Send test email**.

> App passwords are only shown once by Google. If you lose it, revoke and create a new one.

---

## 3. MySQL — needs one change on your hosting panel ⚠️

The server *is* reachable, but authentication from an external machine is refused:

```
Access denied for user 'alcy_42527633'@'136.66.94.90' (using password: YES)
```

`136.66.94.90` is this app server's IP. alchemyCP/cPanel only allows a MySQL user to connect from
hosts that are explicitly whitelisted — by default that is `localhost` only.

### Fix (2 minutes)

1. Log in to your alchosting control panel.
2. Open **Remote MySQL** (may be called *Remote Database Access*, *MySQL Remote Access*,
   or under *Databases*).
3. In **Add Access Host**, enter `%` (allow from anywhere — simplest) **or** the static IP of the
   server that runs this app.
4. Click **Add Host** / **Save**, then run **Synchronize/Reload grants** if the panel offers it.
5. Wait ~1 minute for the grant to apply.

Then open **Admin → System** in this app and press **Re-check**. It should flip to
`reachable` and show the server version and table count.

### Verify from a terminal (optional)

```bash
mysql -h sq1301.alchosting.xyz -P 3306 -u alcy_42527633 -p alcy_42527633_freefiresaas
```

If this still fails with the same error after whitelisting, then the password itself is wrong —
reset it in the panel under **MySQL Databases** and update `MYSQL_PASSWORD` in `.env`.

> **Security note:** `%` opens the DB user to the whole internet. Preferable: keep the password
> long/unique (yours is), or restrict to your app server's IP if it is static. Never expose the
> DB credentials in client-side code — this app only reads them server-side.

---

## 4. Applying the schema to your MySQL database

Once Remote MySQL is enabled:

```bash
mysql -h sq1301.alchosting.xyz -P 3306 -u alcy_42527633 -p \
      alcy_42527633_freefiresaas < deploy/mysql-schema.sql
```

Or in **phpMyAdmin**: select `alcy_42527633_freefiresaas` → **Import** → choose
`deploy/mysql-schema.sql` → **Go**.

The script is idempotent (`CREATE TABLE IF NOT EXISTS`, guarded seed inserts) — safe to re-run and
never drops data. It creates 15 tables:

`customers`, `customer_sessions`, `reset_tokens`, `admins`, `admin_sessions`, `plans`,
`subscriptions`, `orders`, `payments`, `branding`, `apk_releases`, `audit_log`,
`notifications`, `download_log`, `site_settings`

…and seeds the 3 default plans. **The first admin is never created by SQL** — use `/admin/bootstrap`
so the password is properly scrypt-hashed.

phpMyAdmin remains useful for optional administration and inspection; the application itself always
talks to the database through parameterized queries, never by trusting user input.

---

## 5. Which database does the app actually use?

- **`DATABASE_URL`** — the application's working datastore. This is where registrations, orders,
  payments, branding, APK metadata and audit records are written. It must stay reachable by the app
  process at all times.
- **`MYSQL_*`** — your production MySQL target. Used by the **Admin → System** page for a
  read-only connectivity/schema check (connect, ping, count tables — never writes), and by
  `deploy/mysql-schema.sql` for the production tables.

Because alchosting MySQL is currently blocked from remote hosts, the app keeps running on
`DATABASE_URL` and the admin panel simply reports the MySQL status. Nothing breaks while it is
unavailable — the check is timeout-bounded (6 s) and fully error-handled.

---

## 6. Files & directories

```
.env                     # secrets (gitignored) — your SMTP + MySQL credentials
.env.example             # placeholder template for new environments
deploy/mysql-schema.sql  # production MySQL 8 / MariaDB schema (+ seed plans)
deploy/DEPLOY.md         # this file
storage/apks/            # uploaded APKs      — outside the public web root
storage/logos/           # uploaded logos
storage/proofs/          # uploaded payment proofs
public/templates/        # base User/Admin tournament templates (your source)
```

### Path on shared hosting

`storage/` must never be inside the document root. On alchosting, if the app is served from
`public_html/`, keep `storage/` as a sibling (`/home/USER/storage`), exactly as it is in this
project — the public web root is `public/`.

---

## 7. Go-live checklist

- [ ] `.env` copied and filled (SMTP ✅ already working)
- [ ] Remote MySQL enabled on the panel; **Admin → System** shows `reachable`
- [ ] `deploy/mysql-schema.sql` imported into `alcy_42527633_freefiresaas`
- [ ] `/admin/bootstrap` visited **once** to create the owner account (then it closes permanently)
- [ ] Real UPI VPA set in **Admin → Content → UPI payment details**
- [ ] Contact email/phone/hours updated in **Admin → Content**
- [ ] `public/templates/*.html` replaced with your production tournament templates
- [ ] HTTPS enabled (Secure cookies switch on automatically when `NODE_ENV=production`)
- [ ] Nightly backups scheduled (see below)

### Backups

```bash
# PostgreSQL (app datastore)
pg_dump -Fc "$DATABASE_URL" > turflaunch-$(date +%F).dump

# MySQL (production target)
mysqldump -h sq1301.alchosting.xyz -u alcy_42527633 -p \
  alcy_42527633_freefiresaas | gzip > mysql-$(date +%F).sql.gz

# Uploaded files
tar -czf storage-$(date +%F).tgz storage/
```

**Restore / rollback:** restore the dump, restore `storage/`, then redeploy the previous build
artifact. Because every admin action is written to `audit_log`, you can always reconstruct *who*
changed *what* after an incident.

---

## 8. Security reminders

- Rotate the Gmail app password and the MySQL password if you have ever pasted them anywhere
  outside a private `.env` (including chat tools or tickets).
- Never commit `.env`. It is gitignored in this project — keep it that way.
- The app never asks customers for UPI PINs, OTPs, bank passwords or card numbers.
- APKs, logos and payment proofs are served only through authenticated, ownership-checked
  route handlers — never as static public files.
