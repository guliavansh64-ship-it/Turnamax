"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ActiveLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
}) {
  const p = usePathname();
  const active = exact ? p === href : p.startsWith(href);
  return (
    <Link href={href} className={`side-link ${active ? "active" : ""}`}>
      {children}
    </Link>
  );
}
