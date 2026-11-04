import mysql from "mysql2/promise";
import { resolveMysql } from "./integrations";

/**
 * Optional connection to the production MySQL database (alchemyCP / alchosting).
 *
 * The application's primary datastore is configured by DATABASE_URL. This client
 * exists so the platform owner can validate their production database
 * credentials and connectivity from the admin panel, and so the deployment kit
 * (deploy/mysql-schema.sql) can be brought up and verified before go-live.
 */

export async function mysqlEnabled(): Promise<boolean> {
  const cfg = await resolveMysql();
  return cfg.enabled && Boolean(cfg.host);
}

export type MysqlStatus = {
  configured: boolean;
  ok: boolean;
  host: string;
  database: string;
  user: string;
  latencyMs: number | null;
  serverVersion: string | null;
  tableCount: number | null;
  error?: string;
};

function masked(v: string): string {
  if (v.length <= 4) return "•".repeat(v.length);
  return `${v.slice(0, 2)}${"•".repeat(Math.max(3, v.length - 3))}${v.slice(-1)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}

/** Connect, ping and count TurfLaunch tables. Never throws. */
export async function checkMysql(): Promise<MysqlStatus> {
  const cfg = await resolveMysql();
  const host = cfg.host;
  const database = cfg.database;
  const user = cfg.user;
  const base: MysqlStatus = {
    configured: cfg.enabled && Boolean(host),
    ok: false,
    host: host ? masked(host) : "",
    database,
    user: user ? masked(user) : "",
    latencyMs: null,
    serverVersion: null,
    tableCount: null,
  };
  if (!cfg.enabled || !host)
    return { ...base, error: "Not configured. Add MySQL details in Admin → System." };

  let conn: mysql.Connection | null = null;
  const started = Date.now();
  try {
    conn = await withTimeout(
      mysql.createConnection({
        host,
        port: cfg.port || 3306,
        user,
        password: cfg.password,
        database: database || undefined,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 6_000,
        // Read-only sanity check; no writes are ever performed here.
      }),
      8_000
    );
    await withTimeout(conn.ping(), 5_000);
    const latencyMs = Date.now() - started;

    let serverVersion: string | null = null;
    let tableCount: number | null = null;
    try {
      const [rows] = await withTimeout(
        conn.query("SELECT VERSION() AS v, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ?) AS t", [
          database,
        ]) as unknown as Promise<[mysql.RowDataPacket[]]>,
        8_000
      );
      const row = rows[0] as { v?: string; t?: number } | undefined;
      serverVersion = row?.v ?? null;
      tableCount = row?.t != null ? Number(row.t) : null;
    } catch {
      /* version/table introspection is optional */
    }

    return { ...base, ok: true, latencyMs, serverVersion, tableCount };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "Connection failed",
    };
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
