"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "../toast";

type Plan = {
  id: number;
  name: string;
  slug: string;
  cycle: "monthly" | "yearly";
  priceCents: number;
  setupFeeCents: number;
  currency: string;
  durationDays: number;
  features: string[];
  description: string;
  active: boolean;
  featured: boolean;
  sort: number;
};

const empty = {
  name: "",
  cycle: "monthly" as "monthly" | "yearly",
  price: "",
  setupFee: "",
  durationDays: "30",
  description: "",
  features: "",
  active: true,
  featured: false,
};

export default function PlanManager({ plans: initial }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function openCreate() {
    setEditing(null);
    setForm({ ...empty });
  }
  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      name: p.name,
      cycle: p.cycle,
      price: String(p.priceCents / 100),
      setupFee: String(p.setupFeeCents / 100),
      durationDays: String(p.durationDays),
      description: p.description,
      features: (p.features as string[]).join("\n"),
      active: p.active,
      featured: p.featured,
    });
  }

  function set<K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/plans/${editing.id}` : "/api/admin/plans",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast(editing ? "Plan updated." : "Plan created.", "success");
        router.refresh();
        setEditing(null);
        setForm({ ...empty });
      } else toast(data.error ?? "Save failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function quick(patch: Record<string, unknown>, id: number) {
    const res = await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) router.refresh();
    else toast(data.error ?? "Update failed.", "error");
  }

  async function remove(p: Plan) {
    if (!window.confirm(`Delete plan "${p.name}"? If in use by subscriptions it will be deactivated instead.`))
      return;
    const res = await fetch(`/api/admin/plans/${p.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      toast(data.deactivated ? "Plan deactivated (in use)." : "Plan deleted.", "success");
      router.refresh();
    } else toast(data.error ?? "Delete failed.", "error");
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-3">
        {initial.map((p) => (
          <div key={p.id} className="card p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="text-lg">{p.name}</b>
                <span className="tag tag-gray">{p.cycle}</span>
                {p.featured && <span className="tag tag-volt">popular</span>}
                <span className={`tag ${p.active ? "tag-green" : "tag-gray"}`}>
                  {p.active ? "active" : "hidden"}
                </span>
              </div>
              <p className="text-mist text-[13px] mt-1">{p.description}</p>
              <p className="mono text-[11px] text-mist mt-2">
                {p.setupFeeCents > 0 && (
                  <>
                    ₹{(p.setupFeeCents / 100).toLocaleString("en-IN")} one-time +{" "}
                  </>
                )}
                ₹{(p.priceCents / 100).toLocaleString("en-IN")} / {p.durationDays} days ·{" "}
                {p.features.length} features
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                Edit
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => quick({ active: !p.active }, p.id)}
              >
                {p.active ? "Deactivate" : "Activate"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => quick({ featured: !p.featured }, p.id)}
              >
                {p.featured ? "Unfeature" : "Feature"}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{editing ? `Edit: ${editing.name}` : "New plan"}</h2>
          {editing && (
            <button className="mono text-[11px] text-mist hover:text-volt" onClick={openCreate}>
              + new instead
            </button>
          )}
        </div>
        <div className="field">
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label className="label">Cycle</label>
            <select
              className="input"
              value={form.cycle}
              onChange={(e) => set("cycle", e.target.value as "monthly")}
            >
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Duration (days)</label>
            <input
              className="input mono"
              type="number"
              min={1}
              max={730}
              value={form.durationDays}
              onChange={(e) => set("durationDays", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <label className="label">Recurring price (₹)</label>
            <input
              className="input mono"
              type="number"
              min={1}
              step={0.01}
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">One-time setup (₹)</label>
            <input
              className="input mono"
              type="number"
              min={0}
              step={0.01}
              value={form.setupFee}
              onChange={(e) => set("setupFee", e.target.value)}
            />
            <p className="hint">Charged once, on the customer&apos;s first order only.</p>
          </div>
        </div>
        <div className="field">
          <label className="label">Description</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Features (one per line)</label>
          <textarea
            className="input"
            rows={6}
            value={form.features}
            onChange={(e) => set("features", e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-mist cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#c8f32e]"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active (visible on site)
          </label>
          <label className="flex items-center gap-2 text-sm text-mist cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#c8f32e]"
              checked={form.featured}
              onChange={(e) => set("featured", e.target.checked)}
            />
            Featured
          </label>
        </div>
        <button className="btn btn-volt w-full" onClick={save} disabled={busy}>
          {busy ? <span className="spinner" /> : editing ? "Save changes" : "Create plan"}
        </button>
      </div>
    </div>
  );
}
