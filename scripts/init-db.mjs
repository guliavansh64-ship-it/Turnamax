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

    console.log(`Executing ${statements.length} migration statements on remote database...`);
    const client = await pool.connect();
    try {
      for (const stmt of statements) {
        await client.query(stmt);
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

