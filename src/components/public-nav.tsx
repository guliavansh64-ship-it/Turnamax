"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const links = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Tournamax"
        width={small ? 28 : 34}
        height={small ? 28 : 34}
        className="w-auto object-contain"
        style={{ height: small ? 28 : 34 }}
      />
      <span className={`font-display font-700 tracking-tight ${small ? "text-base" : "text-lg"}`} style={{ fontWeight: 700 }}>
        Tourna<span className="text-[#FF5500]">max</span>
      </span>
    </span>
  );
}

export default function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-ink/85 backdrop-blur-md border-b border-line py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="wrap-wide flex items-center justify-between">
        <Link href="/" aria-label="Tournamax home">
          <Logo small={scrolled} />
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-600 text-mist hover:text-snow transition-colors"
              style={{ fontWeight: 600 }}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
          <Link href="/register" className="btn btn-volt btn-sm">
            Get Your App
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-snow"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="wrap flex flex-col gap-1 pt-4 pb-5 bg-ink/95 backdrop-blur-md">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2.5 px-3 rounded-lg text-sm font-600 text-mist hover:text-snow hover:bg-panel"
              style={{ fontWeight: 600 }}
            >
              {l.label}
            </a>
          ))}
          <div className="flex gap-3 pt-3">
            <Link href="/login" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
              Log in
            </Link>
            <Link href="/register" className="btn btn-volt flex-1" onClick={() => setOpen(false)}>
              Get Your App
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
