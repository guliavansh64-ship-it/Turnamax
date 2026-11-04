/**
 * Emergency admin password recovery.
 *
 * Use this ONLY if the platform owner is locked out. It sets a new password
 * directly in the database using the same scrypt format as the app, revokes
 * every existing admin session, and writes an audit event.
 *
 *   node scripts/reset-admin-password.mjs owner@example.com "NewStrongPassword!1"
 *
 * Nothing is logged except the email and timestamp.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
import "dotenv/config";

const [, , rawEmail, newPassword] = process.argv;
const email = (rawEmail ?? "").trim().toLowerCase();

if (!email || !newPassword) {
  console.error(
    'Usage: node scripts/reset-admin-password.mjs <admin-email> "<new-password>"'
  );
  process.exit(1);
}
if (newPassword.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
if (/^(password|admin123|12345678|qwerty)/i.test(newPassword)) {
  console.error("That password is too weak. Choose something long and unique.");
  process.exit(1);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
});

try {
  const { rows } = await pool.query("select id, email from admins where email = $1 limit 1", [
    email,
  ]);
  const admin = rows[0];
  if (!admin) {
    const any = await pool.query("select email from admins order by id limit 5");
    console.error(`No admin found for ${email}.`);
    if (any.rows.length) {
      console.error(`Existing admin accounts: ${any.rows.map((r) => r.email).join(", ")}`);
    } else {
      console.error("No admin accounts exist yet — visit /admin/bootstrap to create one.");
    }
    process.exit(1);
  }

  await pool.query("begin");
  await pool.query("update admins set password_hash = $1 where id = $2", [
    hashPassword(newPassword),
    admin.id,
  ]);
  await pool.query("delete from admin_sessions where admin_id = $1", [admin.id]);
  await pool.query(
    "insert into audit_log (actor_type, actor_id, action, entity, entity_id, meta) values ('system', null, 'admin.password_recovery', 'admin', $1, $2::jsonb)",
    [String(admin.id), JSON.stringify({ source: "scripts/reset-admin-password.mjs" })]
  );
  await pool.query("commit");

  console.log(`Password reset for ${admin.email}. All admin sessions were revoked.`);
  console.log("Sign in at /admin/login with the new password and change it again from Admin → System.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  console.error("Recovery failed:", error.message);
  process.exit(1);
} finally {
  await pool.end();
}
