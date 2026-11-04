import { redirect } from "next/navigation";
import Link from "next/link";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import BootstrapForm from "@/components/admin/bootstrap-form";
import { Logo } from "@/components/public-nav";

export const dynamic = "force-dynamic";

export default async function AdminBootstrapPage() {
  const n = await db.select({ n: count() }).from(admins);
  if (Number(n[0]?.n ?? 0) > 0) redirect("/admin/login");

  return (
    <main className="min-h-screen grid place-items-center px-4 py-16 relative overflow-hidden">
      <div className="hero-bg">
        <div className="hero-glow !opacity-10" />
      </div>
      <div className="card p-8 w-full max-w-md relative">
        <Logo />
        <p className="kicker mt-6 mb-3">First-time setup</p>
        <h1 className="h-display text-2xl font-bold mb-3">Create the first administrator</h1>
        <p className="text-mist text-sm mb-6 leading-relaxed">
          No administrators exist yet. This secure bootstrap creates the platform{" "}
          <b className="text-volt">owner</b> account. Once an admin exists, this screen is
          permanently closed.
        </p>
        <BootstrapForm />
        <p className="text-center mt-5">
          <Link href="/" className="mono text-[11px] text-mist hover:text-volt">
            ← Back to website
          </Link>
        </p>
      </div>
    </main>
  );
}
