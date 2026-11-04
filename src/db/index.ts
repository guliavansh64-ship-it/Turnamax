import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

export type AppDb = ReturnType<typeof drizzlePglite>;

const globalForDb = globalThis as typeof globalThis & {
  __turflaunchClient?: any;
  __turflaunchDrizzleDb?: AppDb;
};

const dataDir = path.join(process.cwd(), "storage", "pgdata");

const isBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

const databaseUrl = process.env.DATABASE_URL || "";
const isRemotePostgres =
  databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");

function initDb(): { client: any; pool: any; db: AppDb } {
  if (isRemotePostgres) {
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    });
    const db = drizzleNodePg(pool) as unknown as AppDb;
    return { client: pool, pool, db };
  }

  if (isBuild) {
    const client = new PGlite();
    return { client, pool: client, db: drizzlePglite(client) };
  }

  // Remove stale pid file if server crashed
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {}
  }
  const client = new PGlite(dataDir);
  return { client, pool: client, db: drizzlePglite(client) };
}

const instance =
  globalForDb.__turflaunchClient && globalForDb.__turflaunchDrizzleDb
    ? {
        client: globalForDb.__turflaunchClient,
        pool: globalForDb.__turflaunchClient,
        db: globalForDb.__turflaunchDrizzleDb,
      }
    : initDb();

export const client = instance.client;
export const pool = instance.pool;
export const db = instance.db;

globalForDb.__turflaunchClient = instance.client;
globalForDb.__turflaunchDrizzleDb = instance.db;


