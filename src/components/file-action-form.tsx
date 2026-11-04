"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./toast";

type Props = {
  url: string;
  label: string;
  accept?: string;
  hidden?: Record<string, string | number>;
  successMsg?: string;
  redirect?: string;
  children?: ReactNode;
  className?: string;
  fileLabel?: string;
};

export default function FileActionForm({
  url,
  label,
  accept = "",
  hidden = {},
  successMsg = "Upload complete.",
  redirect,
  children,
  className = "",
  fileLabel,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !file) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    Object.entries(hidden).forEach(([k, v]) => fd.append(k, String(v)));
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast(successMsg, "success");
        form.reset();
        setFile(null);
        if (redirect) {
          window.location.href = redirect;
          return;
        }
        router.refresh();
      } else {
        setError(data.error ?? "Upload failed.");
        toast(data.error ?? "Upload failed.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={`space-y-3 ${className}`}>
      {children}
      <label className="file-drop">
        <input
          type="file"
          name="file"
          required
          accept={accept}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError("");
          }}
        />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-volt shrink-0">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
          <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
        </svg>
        <span className="file-drop-text">
          {file
            ? `${file.name} · ${(file.size / 1048576).toFixed(2)} MB`
            : (fileLabel ?? "Choose a file…")}
        </span>
      </label>
      {error && <p className="text-coral text-sm">{error}</p>}
      <button type="submit" className="btn btn-volt" disabled={busy || !file}>
        {busy ? <span className="spinner" /> : label}
      </button>
    </form>
  );
}
