import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actorType: "customer" | "admin" | "system";
  actorId?: number | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
};

export async function logAudit(entry: AuditEntry) {
  try {
    await db.insert(auditLog).values({
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? null,
      ip: entry.ip ?? null,
    });
  } catch {
    /* audit must never break the request */
  }
}
