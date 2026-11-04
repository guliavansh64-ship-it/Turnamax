"use client";

import { FormEvent, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./toast";

type Props = {
  url: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  label: ReactNode;
  type?: "volt" | "ghost" | "danger";
  size?: "sm" | "md";
  hidden?: Record<string, string | number | boolean>;
  children?: ReactNode;
  confirmText?: string;
  successMsg?: string;
  redirect?: string;
  className?: string;
};

export default function ActionForm({
  url,
  method = "POST",
  label,
  type = "volt",
  size = "md",
  hidden = {},
  children,
  confirmText,
  successMsg,
  redirect,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    const form = e.currentTarget;
    const body: Record<string, unknown> = { ...hidden };
    form.querySelectorAll<HTMLElement>("[name]").forEach((el) => {
      const name = el.getAttribute("name");
      if (!name) return;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox") {
        body[name] = (el as HTMLInputElement).checked;
      } else {
        body[name] = (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
      }
    });
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast(successMsg ?? "Done.", "success");
        if (redirect) {
          window.location.href = redirect;
          return;
        }
        router.refresh();
      } else {
        toast(data.error ?? "Something went wrong.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={`inline-flex flex-wrap items-end gap-2 ${className}`}>
      {children}
      <button
        type="submit"
        disabled={busy}
        className={`btn btn-${type} btn-${size} min-w-[72px]`}
      >
        {busy ? <span className="spinner" /> : label}
      </button>
    </form>
  );
}
