"use client";

import { FormEvent, useState } from "react";
import { toast } from "../toast";
import FileActionForm from "../file-action-form";
import ActionForm from "../action-form";

type BrandingInit = {
  appName?: string | null;
  brandPrimary?: string | null;
  brandSecondary?: string | null;
  tenantId?: string | null;
  firebaseProjectId?: string | null;
  firebaseAppId?: string | null;
  firebaseApiKey?: string | null;
  notes?: string | null;
  logoName?: string | null;
  status?: string;
} | null;

export default function BrandingForm({ initial }: { initial: BrandingInit }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    f.forEach((v, k) => {
      if (k === "submit") body.submit = (f.get(k) as HTMLInputElement | null)?.toString() === "on";
      else body[k] = v;
    });
    // checkboxes: read properly
    const submitEl = e.currentTarget.querySelector<HTMLInputElement>('input[name="submit"]');
    body.submit = submitEl?.checked ?? false;

    setBusy(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast(
          data.branding?.status === "submitted"
            ? "Branding submitted. Our team will review it during preparation."
            : "Branding draft saved.",
          "success"
        );
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        // Refresh the server-rendered preview
        window.dispatchEvent(new Event("branding-saved"));
      } else {
        toast(data.error ?? "Could not save.", "error");
      }
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="field sm:col-span-2">
          <label className="label" htmlFor="appName">Desired application name *</label>
          <input
            id="appName"
            name="appName"
            className="input"
            required
            minLength={2}
            maxLength={40}
            defaultValue={initial?.appName ?? ""}
            placeholder="e.g. Thunder League"
          />
          <p className="hint">
            2–40 characters. This becomes the launcher label and is used to derive your tenant
            id.
          </p>
        </div>
        <div className="field">
          <label className="label" htmlFor="brandPrimary">Primary brand color</label>
          <div className="flex gap-2">
            <input
              id="brandPrimary"
              name="brandPrimary"
              type="color"
              className="w-12 h-11 rounded-lg border border-line bg-ink2 cursor-pointer"
              defaultValue={initial?.brandPrimary ?? "#c8f32e"}
            />
            <input name="brandPrimaryText" type="hidden" />
            <span className="mono text-[11px] text-mist self-center">
              e.g. #C8F32E — buttons & accents
            </span>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="brandSecondary">Secondary brand color</label>
          <div className="flex gap-2">
            <input
              id="brandSecondary"
              name="brandSecondary"
              type="color"
              className="w-12 h-11 rounded-lg border border-line bg-ink2 cursor-pointer"
              defaultValue={initial?.brandSecondary ?? "#0b0e14"}
            />
            <span className="mono text-[11px] text-mist self-center">
              e.g. #0B0E14 — backgrounds
            </span>
          </div>
        </div>
      </div>

      <div className="divider" />

      <p className="label !mb-1">Firebase configuration <span className="text-snow/50">(optional — used when applicable)</span></p>
      <p className="hint !mt-0 mb-4">
        Only fill these in if your plan includes a customer-specific Firebase project. These
        values stay on the server and are compiled into your builds by our team.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="field">
          <label className="label" htmlFor="fp">Firebase project id</label>
          <input id="fp" name="firebaseProjectId" className="input mono" maxLength={120} defaultValue={initial?.firebaseProjectId ?? ""} placeholder="my-tournament-01" />
        </div>
        <div className="field">
          <label className="label" htmlFor="fa">Firebase app id</label>
          <input id="fa" name="firebaseAppId" className="input mono" maxLength={160} defaultValue={initial?.firebaseAppId ?? ""} placeholder="1:1234567890:android:abc123" />
        </div>
        <div className="field sm:col-span-2">
          <label className="label" htmlFor="fk">Firebase web API key</label>
          <input id="fk" name="firebaseApiKey" className="input mono" maxLength={200} defaultValue={initial?.firebaseApiKey ?? ""} placeholder="AIza…" />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="notes">Notes for our team</label>
        <textarea
          id="notes"
          name="notes"
          className="input"
          maxLength={1000}
          defaultValue={initial?.notes ?? ""}
          placeholder="Anything else we should know when preparing your builds…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button className="btn btn-volt" disabled={busy}>
          {busy ? <span className="spinner" /> : saved ? "Saved ✓" : "Save branding"}
        </button>
        <label className="flex items-center gap-2 text-sm text-mist cursor-pointer select-none">
          <input
            type="checkbox"
            name="submit"
            className="accent-[#c8f32e] w-4 h-4"
            defaultChecked={initial?.status === "submitted"}
          />
          Submit for preparation
        </label>
      </div>
    </form>
  );
}

export function LogoUpload({ logoName }: { logoName?: string | null }) {
  return (
    <div className="space-y-4">
      {logoName && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/logo/${logoName}`}
            alt="Current logo"
            className="w-14 h-14 rounded-xl object-cover border border-line"
          />
          <ActionForm
            url="/api/branding/logo"
            method="DELETE"
            label="Remove logo"
            type="danger"
            size="sm"
            successMsg="Logo removed."
          />
        </div>
      )}
      <FileActionForm
        url="/api/branding/logo"
        label="Upload logo"
        accept=".png,.jpg,.jpeg,.webp"
        fileLabel="PNG, JPG or WebP · max 2 MB"
        successMsg="Logo uploaded."
      />
      <p className="hint">
        Tip: a square icon (512×512+) works best for the launcher. Replace your current logo at
        any time — the new file is used for the next build preparation.
      </p>
    </div>
  );
}
