import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load .env.local or .env if present
if (fs.existsSync(path.join(process.cwd(), ".env.local"))) {
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
} else {
  dotenv.config();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const isRemotePostgres =
    databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");

  const sqlFile = path.join(process.cwd(), "drizzle", "0000_high_iron_fist.sql");
  const sql = fs.readFileSync(sqlFile, "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  if (isRemotePostgres) {
    console.log("Connecting to PostgreSQL / Neon:", databaseUrl.replace(/:[^:@]+@/, ":****@"));
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    try {
      // Check if the schema is already initialized
      const check = await client.query(`SELECT to_regclass('public.admins') AS tbl_exists;`);
      if (check.rows[0]?.tbl_exists) {
        console.log("Database tables already initialized in Neon. Skipping migration.");
        return;
      }

      console.log(`Executing ${statements.length} migration statements on remote database...`);
      for (const stmt of statements) {
        try {
          await client.query(stmt);
        } catch (err) {
          // Ignore if table or object already exists (codes 42P07, 42710)
          if (
            err.code === "42P07" ||
            err.code === "42710" ||
            err.message?.includes("already exists")
          ) {
            continue;
          }
          throw err;
        }
      }
      console.log("Remote database initialized successfully!");
    } finally {
      client.release();
      await pool.end();
    }
    return;
  }

  const dataDir = path.join(process.cwd(), "storage", "pgdata");
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });

  console.log("Initializing fresh PGlite in:", dataDir);
  const p = new PGlite(dataDir);
  await p.waitReady;

  console.log(`Executing ${statements.length} migration statements...`);
  for (const stmt of statements) {
    await p.exec(stmt);
  }

  console.log("Database initialized successfully!");
  await p.close();
  console.log("PGlite cleanly closed.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

