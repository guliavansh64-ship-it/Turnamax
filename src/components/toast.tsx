"use client";

import { useEffect, useState } from "react";

type ToastItem = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

export function toast(message: string, type: "success" | "error" | "info" = "info") {
  window.dispatchEvent(
    new CustomEvent("app:toast", {
      detail: { message, type, id: Math.random().toString(36).slice(2) },
    })
  );
}

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as ToastItem;
      setItems((p) => [...p, d]);
      setTimeout(() => {
        setItems((p) => p.filter((i) => i.id !== d.id));
      }, 4200);
    };
    window.addEventListener("app:toast", handler);
    return () => window.removeEventListener("app:toast", handler);
  }, []);

  return (
    <div className="toast-stack" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast ${i.type}`}>
          {i.message}
        </div>
      ))}
    </div>
  );
}
