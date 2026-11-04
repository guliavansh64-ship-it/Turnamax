import { count, desc, eq, ilike, or, and } from "drizzle-orm";
import AutoSubmitSelect from "@/components/auto-submit-select";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; actor?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const actor = sp.actor ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const filters = [
    q ? or(ilike(auditLog.action, `%${q}%`), ilike(auditLog.entity, `%${q}%`)) : undefined,
    actor !== "all" ? eq(auditLog.actorType, actor as "admin") : undefined,
  ].filter(Boolean);

  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(auditLog).where(and(...filters)),
    db
      .select()
      .from(auditLog)
      .where(and(...filters))
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const total = totalRows[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-2">Audit</p>
          <h1 className="h-display text-3xl font-bold">
            Audit log <span className="text-mist text-xl">({total})</span>
          </h1>
          <p className="text-mist mt-2 text-sm">
            Every administrative and customer action is recorded here, including who acted and
            when.
          </p>
        </div>
        <form method="GET" className="flex gap-2">
          <input name="q" defaultValue={q} className="input !w-48" placeholder="action or entity…" />
          <AutoSubmitSelect
            name="actor"
            className="input !w-32"
            defaultValue={actor}
            ariaLabel="Filter by actor"
            options={[
              { value: "", label: "All actors" },
              { value: "admin", label: "Admin" },
              { value: "customer", label: "Customer" },
              { value: "system", label: "System" },
            ]}
          />
          <button className="btn btn-volt">Search</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Meta</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="mono text-[11px] text-mist whitespace-nowrap">
                    {formatDateTime(a.createdAt)}
                  </td>
                  <td>
                    <span className={`tag ${a.actorType === "admin" ? "tag-volt" : a.actorType === "customer" ? "tag-blue" : "tag-gray"}`}>
                      {a.actorType}
                      {a.actorId ? ` #${a.actorId}` : ""}
                    </span>
                  </td>
                  <td className="mono text-[12px]">{a.action}</td>
                  <td className="text-mist text-[13px]">
                    {a.entity ?? "—"}
                    {a.entityId ? ` #${a.entityId}` : ""}
                  </td>
                  <td className="mono text-[10px] text-mist max-w-[260px] truncate">
                    {a.meta ? JSON.stringify(a.meta) : ""}
                  </td>
                  <td className="mono text-[11px] text-mist">{a.ip ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-mist py-10">
                    No entries match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            className="mono text-xs px-3 py-2 rounded-lg border border-line text-mist disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => history.back()}
            onClickCapture={() => {}}
          >
            ←
          </button>
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/admin/audit?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${actor !== "all" ? `&actor=${actor}` : ""}`}
              className={`mono text-xs px-3 py-2 rounded-lg border ${
                p === page ? "border-volt text-volt" : "border-line text-mist hover:text-snow"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
