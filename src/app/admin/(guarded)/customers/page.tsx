import Link from "next/link";
import AutoSubmitSelect from "@/components/auto-submit-select";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { customers, subscriptions } from "@/db/schema";
import { formatDateTime, getCustomerSubscription, subEffectiveStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "all") as string;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const filters = [
    q
      ? or(
          ilike(customers.name, `%${q}%`),
          ilike(customers.email, `%${q}%`)
        )
      : undefined,
    status !== "all" ? eq(customers.status, status as "active") : undefined,
  ].filter(Boolean);

  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(customers).where(and(...filters)),
    db
      .select()
      .from(customers)
      .where(and(...filters))
      .orderBy(desc(customers.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const total = totalRows[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const subInfo = await Promise.all(
    rows.map(async (c) => {
      const s = await getCustomerSubscription(c.id);
      return { plan: s?.plan.name ?? null, status: subEffectiveStatus(s?.sub) };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-2">Customers</p>
          <h1 className="h-display text-3xl font-bold">
            {total} registered {total === 1 ? "customer" : "customers"}
          </h1>
        </div>
        <form method="GET" className="flex gap-2 flex-wrap">
          <input
            name="q"
            defaultValue={q}
            className="input !w-56"
            placeholder="Search name or email…"
          />
          <AutoSubmitSelect
            name="status"
            className="input !w-36"
            defaultValue={status}
            ariaLabel="Filter by account status"
            options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
              { value: "deactivated", label: "Deactivated" },
            ]}
          />
          <button className="btn btn-volt">Search</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8">
            <div className="empty">
              <p className="text-sm">
                {q || status !== "all"
                  ? "No customers match your filters."
                  : "No customers registered yet."}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Subscription</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id}>
                    <td className="mono text-mist">{c.id}</td>
                    <td className="font-semibold">{c.name}</td>
                    <td className="text-mist">{c.email}</td>
                    <td>
                      <span
                        className={`tag ${
                          c.status === "active" ? "tag-green" : c.status === "suspended" ? "tag-red" : "tag-gray"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td>
                      {subInfo[i].plan ? (
                        <span>
                          {subInfo[i].plan}{" "}
                          <span
                            className={`tag ${
                              subInfo[i].status === "active"
                                ? "tag-green"
                                : subInfo[i].status === "expired"
                                ? "tag-amber"
                                : "tag-red"
                            }`}
                          >
                            {subInfo[i].status}
                          </span>
                        </span>
                      ) : (
                        <span className="text-mist">—</span>
                      )}
                    </td>
                    <td className="text-mist whitespace-nowrap">{formatDateTime(c.createdAt)}</td>
                    <td>
                      <Link href={`/admin/customers/${c.id}`} className="btn btn-ghost btn-sm">
                        Open profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/customers?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${status !== "all" ? `&status=${status}` : ""}`}
              className={`mono text-xs px-3 py-2 rounded-lg border ${
                p === page ? "border-volt text-volt" : "border-line text-mist hover:text-snow"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
