// Pure, client-safe formatting helpers (no server imports).

export function formatMoney(cents: number, currency = "INR"): string {
  const sign = currency === "INR" ? "₹" : `${currency} `;
  return (
    sign +
    (cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })
  );
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysLeft(expiresAt: Date | string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
