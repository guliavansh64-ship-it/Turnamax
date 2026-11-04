import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import ProfileForm from "@/components/dashboard/profile-form";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">Profile</p>
        <h1 className="h-display text-3xl font-bold">Your account</h1>
        <p className="text-mist mt-2 mono text-[12px]">
          Customer #{c.id} · joined {formatDateTime(c.createdAt)} · status: {c.status}
        </p>
      </div>
      <ProfileForm name={c.name} email={c.email} />
    </div>
  );
}
