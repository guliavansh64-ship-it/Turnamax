"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type BottomNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon: React.ReactNode;
};

/**
 * Tournamax brand glyph — used in the bottom nav.
 */
export function BrandBolt({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Tournamax"
      width={28}
      height={28}
      className={`object-contain ${className}`}
    />
  );
}

/** Icons kept inline so the bundle has no icon dependency. */
export const bottomIcons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.8 3-3.5 3H16a2 2 0 0 0-1.5 3.3c.4.5.1 1.7-.5 1.7Z" />
      <circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.7" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="7.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h3" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5v11m0 0 4-4m-4 4-4-4" />
      <path d="M4.5 17v1.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V17" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20.2a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
};

/**
 * Mobile bottom tab bar for the customer app.
 *
 * Fixed to the bottom of the viewport, hidden on desktop (the sidebar handles
 * navigation there), safe-area aware, and animated: sliding active indicator,
 * spring icon lift, logo glow and a popping badge. Every tab is a real link, so
 * it keeps working with JavaScript unavailable.
 */
export default function BottomNav({
  items,
  badge,
}: {
  items: BottomNavItem[];
  /** Small pill shown on a tab, e.g. "1" when a download is ready. */
  badge?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="App navigation"
      className="bottom-nav-shell lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-ink/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const count = badge?.[item.href] ?? 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                className={`bottom-nav-item relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-200 ${
                  active ? "text-volt" : "text-mist hover:text-white"
                }`}
              >
                <span className="bn-dot" aria-hidden />

                <span className="relative block size-[22px]">
                  <span className="bn-icon block size-full [&>*]:block [&>*]:size-full">
                    {item.icon}
                  </span>
                  {count > 0 ? (
                    <span className="bn-badge absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full bg-volt px-1 text-[9px] font-bold leading-4 text-ink shadow-[0_0_10px_rgba(200,243,46,0.6)]">
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </span>

                <span
                  className={`text-[10px] leading-none transition-all duration-200 ${
                    active ? "font-bold" : "font-medium"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
