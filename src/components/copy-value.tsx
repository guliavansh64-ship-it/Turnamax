"use client";

import { useState } from "react";

/** Small copy-to-clipboard control (no extra dependencies). */
export default function CopyValue({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const el = document.createElement("textarea");
          el.value = value;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          el.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`shrink-0 rounded-md border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition hover:border-volt hover:text-volt ${
        copied ? "border-volt text-volt" : "text-mist"
      } ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
