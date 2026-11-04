import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { ensureSeed, getPublicContent } from "@/lib/seed";
import { formatMoney } from "@/lib/utils";
import PublicNav, { Logo } from "@/components/public-nav";
import Reveal from "@/components/reveal";

export const dynamic = "force-dynamic";

const icons: Record<string, React.ReactNode> = {
  palette: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21a9 9 0 110-18 8.5 8.5 0 018.5 8.5c0 2-1.5 3-3 3H15a2 2 0 00-1.5 3.3c.6.7.2 2.2-1.5 2.2z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  flame: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22c4 0 7-2.7 7-6.5 0-2.8-1.6-4.8-3-6.5-1.2-1.5-2.4-2.9-2.8-5-2 1.5-3 3.6-3 5.5-1-.6-1.7-1.4-2-2.5C6 9 5 11.6 5 13.5 5 17.3 8 22 12 22z" />
    </svg>
  ),
  layers: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17l9 5 9-5" opacity=".5" />
    </svg>
  ),
  trophy: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4h8v6a4 4 0 11-8 0V4z" />
      <path d="M8 6H4.5a3.5 3.5 0 003.6 3.9M16 6h3.5a3.5 3.5 0 01-3.6 3.9" />
      <path d="M12 14v3m-4 4h8m-6.5-4h5l1 4h-7l1-4z" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 15l2.5 2.5L16 12" />
    </svg>
  ),
  lock: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 118 0v4" />
      <circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const steps = [
  {
    t: "Register your account",
    d: "Create your Tournamax account with your name and email. Verification is instant in demo mode.",
  },
  {
    t: "Pick a subscription plan",
    d: "Monthly or yearly — one plan covers both the User APK and the Admin APK.",
  },
  {
    t: "Submit your branding",
    d: "App name, logo, brand colors, tenant identifier and Firebase details where applicable.",
  },
  {
    t: "Complete payment",
    d: "Pay via UPI to the VPA shown at checkout and submit your transaction reference.",
  },
  {
    t: "Manual verification & preparation",
    d: "Our team verifies the payment by hand, then prepares your two branded APKs from the base templates.",
  },
  {
    t: "Download from your dashboard",
    d: "Once published, both APKs appear in your dashboard with versions, checksums and one-tap download.",
  },
];

function PhoneUserMock() {
  return (
    <div className="phone float-chip">
      <div className="phone-screen">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-volt/15 border border-volt/40 grid place-items-center text-volt text-[10px] font-bold mono">
              TL
            </span>
            <div>
              <div className="text-[11px] font-bold leading-none">YourTournament</div>
              <div className="mono text-[7px] text-mist tracking-[0.2em]">USER PANEL</div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-[8px] font-bold text-coral">
            <span className="live-dot" /> LIVE
          </span>
        </div>
        <div className="mock-card mb-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold">Lightning FC</span>
            <span className="text-volt font-extrabold text-lg mono">2:1</span>
            <span className="text-[10px] font-bold">Storm XI</span>
          </div>
          <div className="mono text-[7px] text-mist text-center mt-1">MATCH 14 · HALF 2 · 12:40</div>
        </div>
        <div className="mock-card">
          <div className="mono text-[7px] text-mist tracking-widest mb-2">STANDINGS</div>
          {[
            ["1", "Lightning FC", "12"],
            ["2", "Storm XI", "9"],
            ["3", "Royal Strikers", "3"],
          ].map(([n, t, p]) => (
            <div key={n} className="flex items-center gap-2 py-1 border-b border-line last:border-0">
              <span className={`mono text-[8px] w-3 ${n === "1" ? "text-volt" : "text-mist"}`}>{n}</span>
              <span className="text-[9px] flex-1">{t}</span>
              <span className="mono text-[8px] text-volt">{p}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 h-8 rounded-xl bg-volt flex items-center justify-center text-[9px] font-extrabold text-ink">
          CHECK IN MY TEAM
        </div>
        <div className="mock-tabbar">
          <span className="mock-tab on" />
          <span className="mock-tab" />
          <span className="mock-tab" />
          <span className="mock-tab" />
        </div>
      </div>
    </div>
  );
}

function PhoneAdminMock() {
  return (
    <div className="phone float-chip d2">
      <div className="phone-screen">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] font-bold leading-none">YourTournament</div>
            <div className="mono text-[7px] text-mist tracking-[0.2em]">ADMIN PANEL</div>
          </div>
          <span className="mono text-[7px] text-mist border border-line rounded-full px-2 py-0.5">v1.2.0</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {[
            ["TEAMS", "24"],
            ["MATCHES", "58"],
            ["ENTRIES", "₹1.15L"],
            ["LIVE", "2"],
          ].map(([k, v]) => (
            <div key={k} className="mock-card !p-2">
              <div className="mono text-[6.5px] text-mist tracking-widest">{k}</div>
              <div className={`text-sm font-extrabold ${k === "LIVE" ? "text-coral" : "text-volt"}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mock-card">
          <div className="mono text-[7px] text-mist tracking-widest mb-2">MATCH CONTROL</div>
          {[
            ["M-14", "Lightning vs Storm", "LIVE", "text-coral"],
            ["M-15", "Royal vs Foxes", "QUEUE", "text-gold"],
            ["M-16", "Voltage vs Owls", "DONE", "text-volt"],
          ].map(([id, m, s, c]) => (
            <div key={id} className="flex items-center gap-2 py-1 border-b border-line last:border-0">
              <span className="mono text-[8px] text-mist w-7">{id}</span>
              <span className="text-[9px] flex-1">{m}</span>
              <span className={`mono text-[7px] font-bold ${c}`}>{s}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="h-8 rounded-xl bg-volt flex items-center justify-center text-[9px] font-extrabold text-ink">
            SCORE
          </div>
          <div className="h-8 rounded-xl border border-line2 flex items-center justify-center text-[9px] font-bold">
            NEXT
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  await ensureSeed();
  const [content, allPlans] = await Promise.all([
    getPublicContent(),
    db
      .select()
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(desc(plans.sort)),
  ]);
  const monthly = allPlans.filter((p) => p.cycle === "monthly");
  const yearly = allPlans.filter((p) => p.cycle === "yearly");
  const activeAnnouncement = (content.announcements as any[]).find((a) => a.active);

  return (
    <main className="bg-ink">
      <PublicNav />

      {activeAnnouncement && (
        <div className="fixed top-0 inset-x-0 z-50 bg-volt text-ink text-[11px] font-bold text-center py-1 px-4" style={{ display: "none" }}>
          {activeAnnouncement.title}: {activeAnnouncement.body}
        </div>
      )}

      {/* ============ HERO ============ */}
      <section className="relative pt-36 pb-24 overflow-hidden">
        <div className="hero-bg">
          <div className="hero-grid" />
          <div className="hero-glow" />
          <div className="hero-glow two" />
          <div className="hero-scan" />
        </div>
        <div className="wrap-wide relative grid lg:grid-cols-[1.15fr_1fr] gap-16 items-center">
          <div>
            <Reveal>
              <p className="kicker mb-5 flex items-center gap-3">
                <span className="inline-block w-8 h-px bg-volt" />
                White-label tournament apps
              </p>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="h-display text-4xl sm:text-5xl lg:text-[3.6rem] font-bold mb-6">
                {String(content.hero?.headline ?? "").split(". ").slice(0, 2).join(". ") ||
                  "Your tournament. Your brand."}
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="text-mist text-lg leading-relaxed max-w-xl mb-9">
                {content.hero?.sub}
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="flex flex-wrap gap-4">
                <Link href="/register" className="btn btn-volt btn-lg">
                  {content.hero?.ctaPrimary ?? "Get Your Tournament App"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14m-6-6l6 6-6 6" />
                  </svg>
                </Link>
                <a href="#features" className="btn btn-ghost btn-lg">
                  {content.hero?.ctaSecondary ?? "Explore Features"}
                </a>
              </div>
            </Reveal>
            <Reveal delay={420}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-10 mono text-[11px] text-mist tracking-wide">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-volt" /> Human-verified payments
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-volt" /> Manually prepared builds
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-volt" /> SHA-256 checksums
                </span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={250} className="hidden lg:flex justify-center relative">
            <div className="relative">
              <PhoneUserMock />
              <div className="absolute -left-20 top-10 float-chip d3">
                <div className="card !rounded-xl px-4 py-3 mono text-[10px] flex items-center gap-3">
                  <span className="text-volt font-bold">APK</span>
                  <span className="text-mist">User v1.2.0</span>
                  <span className="tag tag-green">ready</span>
                </div>
              </div>
              <div className="absolute -right-14 bottom-16 float-chip d2">
                <div className="card !rounded-xl px-4 py-3 mono text-[10px] flex items-center gap-3">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7ee081" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span className="text-mist">SHA-256 verified</span>
                </div>
              </div>
              <div className="absolute -left-8 -bottom-8 float-chip">
                <div className="card !rounded-xl px-4 py-3 mono text-[10px]">
                  <span className="text-mist">tenant:</span> <span className="text-volt">your-brand-01</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ PRODUCT PREVIEW ============ */}
      <section id="product" className="py-24 border-t border-line">
        <div className="wrap-wide">
          <Reveal>
            <div className="max-w-2xl mb-14">
              <p className="kicker mb-4">The product</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold mb-4">
                Two apps. One subscription. <span className="text-volt">Your name on both.</span>
              </h2>
              <p className="text-mist leading-relaxed">
                Every customer receives two separate Android builds — a participant-facing
                <b className="text-snow"> User Panel</b> and an organizer-facing{" "}
                <b className="text-snow">Admin Panel</b> — prepared from the same base tournament
                application and customized with your branding and configuration.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                tag: "USER APK",
                title: "User Panel",
                desc: "Live match screens, squads, standings and check-ins for teams and spectators.",
                mock: <PhoneUserMock />,
                link: "/templates/user-panel.html",
              },
              {
                tag: "ADMIN APK",
                title: "Admin Panel",
                desc: "Full tournament control — matches, scores, brackets, teams, payments and settings.",
                mock: <PhoneAdminMock />,
                link: "/templates/admin-panel.html",
              },
            ].map((p, i) => (
              <Reveal key={p.tag} delay={i * 120}>
                <div className="card card-hover p-8 flex flex-col items-center gap-8">
                  <div className="flex items-center gap-3 self-start">
                    <span className="tag tag-volt">{p.tag}</span>
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[11px] text-mist hover:text-volt transition-colors underline underline-offset-4"
                    >
                      Open live template ↗
                    </a>
                  </div>
                  <div className="scale-90 sm:scale-100">{p.mock}</div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold mb-2">{p.title}</h3>
                    <p className="text-mist text-sm leading-relaxed max-w-sm">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={150}>
            <div className="mt-8 card !border-volt/30 bg-volt/[0.04] px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
              <p className="text-sm">
                <b className="text-volt">Provided separately:</b> each APK is its own signed file with
                its own version, checksum and release notes.
              </p>
              <span className="mono text-[11px] text-mist">no automatic builds · prepared by hand per customer</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="py-24 border-t border-line bg-ink2/60">
        <div className="wrap-wide">
          <Reveal>
            <div className="max-w-2xl mb-14">
              <p className="kicker mb-4">Features</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold">
                Everything you need to run tournaments <span className="text-volt">as your own product</span>
              </h2>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(content.features as any[]).map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 100}>
                <div className="card card-hover p-6 h-full group">
                  <div className="w-11 h-11 rounded-xl bg-volt/10 border border-volt/25 text-volt grid place-items-center mb-5 transition-transform duration-300 group-hover:scale-110">
                    {icons[f.icon] ?? icons.trophy}
                  </div>
                  <h3 className="font-bold text-[1.02rem] mb-2">{f.title}</h3>
                  <p className="text-mist text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="py-24 border-t border-line">
        <div className="wrap">
          <Reveal>
            <div className="max-w-2xl mb-14">
              <p className="kicker mb-4">How it works</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold">
                From signup to APK download, <span className="text-volt">in six clear steps</span>
              </h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-9">
            {steps.map((s, i) => (
              <Reveal key={s.t} delay={(i % 2) * 100}>
                <div className="flex gap-4">
                  <div className="step-num">{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <h3 className="font-bold mb-1.5">{s.t}</h3>
                    <p className="text-mist text-sm leading-relaxed">{s.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="py-24 border-t border-line bg-ink2/60">
        <div className="wrap-wide">
          <Reveal>
            <div className="max-w-2xl mb-14">
              <p className="kicker mb-4">Pricing</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold">
                One plan covers <span className="text-volt">both APKs</span>
              </h2>
              <p className="text-mist mt-4">
                Billed via UPI and verified manually by our team. Plans and prices are managed by
                the platform and may change; your active period is protected.
              </p>
            </div>
          </Reveal>
          <div
            className={`grid gap-6 items-stretch ${
              allPlans.length === 1
                ? "max-w-md mx-auto"
                : "md:grid-cols-3"
            }`}
          >
            {allPlans.map((p, i) => (
              <Reveal key={p.id} delay={i * 110} className="h-full">
                <div className={`card price-card p-7 h-full flex flex-col ${p.featured ? "featured" : ""}`}>
                  {p.featured && (
                    <span className="tag tag-volt absolute -top-3 left-7">Most popular</span>
                  )}
                  <div className="mono text-[11px] tracking-[0.2em] text-mist uppercase mb-3">
                    {p.cycle === "monthly" ? "Monthly" : "Yearly"}
                  </div>
                  <h3 className="text-xl font-bold mb-1">{p.name}</h3>
                  <p className="text-mist text-sm mb-5 min-h-[40px]">{p.description}</p>
                  {p.setupFeeCents > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="tag tag-volt">one-time</span>
                      <span className="mono text-lg font-bold">
                        {formatMoney(p.setupFeeCents, p.currency)}
                      </span>
                      <span className="text-mist text-[13px]">setup fee</span>
                    </div>
                  )}
                  <div className="flex items-end gap-2 mb-1">
                    <span className="mono text-4xl font-bold text-volt">
                      {formatMoney(p.priceCents, p.currency)}
                    </span>
                    <span className="text-mist text-sm mb-1.5">
                      / {p.cycle === "monthly" ? "month" : "year"}
                    </span>
                  </div>
                  <div className="mono text-[11px] text-mist mb-6">
                    {p.setupFeeCents > 0
                      ? `First payment ${formatMoney(
                          p.priceCents + p.setupFeeCents,
                          p.currency
                        )} · then ${formatMoney(p.priceCents, p.currency)} every ${
                          p.durationDays
                        } days`
                      : `${p.durationDays} days of access`}
                  </div>
                  <ul className="space-y-2.5 mb-8 flex-1">
                    {(p.features as string[]).map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm">
                        <svg className="text-volt shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        <span className="text-snow/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className={`btn w-full ${p.featured ? "btn-volt" : "btn-ghost"}`}
                  >
                    Start with {p.name}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <p className="text-center mono text-[11px] text-mist mt-10">
              {allPlans.length === 1 ? (
                <>
                  One simple plan · ₹299 one-time setup + ₹50/month · prices set by the main admin
                  panel
                </>
              ) : (
                <>
                  {monthly.length} monthly plan{monthly.length === 1 ? "" : "s"} · {yearly.length}{" "}
                  yearly plan{yearly.length === 1 ? "" : "s"} · prices set by the main admin panel
                </>
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="py-24 border-t border-line">
        <div className="wrap">
          <Reveal>
            <div className="max-w-2xl mb-12">
              <p className="kicker mb-4">FAQ</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold">
                Questions, <span className="text-volt">answered straight</span>
              </h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-4">
            {(content.faqs as any[]).map((f, i) => (
              <Reveal key={f.q} delay={(i % 2) * 80}>
                <details className="faq">
                  <summary>
                    {f.q}
                    <svg className="faq-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </summary>
                  <p className="faq-a">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TRUST / TESTIMONIALS ============ */}
      <section className="py-24 border-t border-line bg-ink2/60">
        <div className="wrap-wide">
          <Reveal>
            <div className="max-w-2xl mb-12">
              <p className="kicker mb-4">Trust & transparency</p>
              <h2 className="h-display text-3xl sm:text-4xl font-bold">
                No fake numbers. <span className="text-volt">Just verifiable process.</span>
              </h2>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
            {[
              ["Human-verified payments", "No payment is approved by an interface. A person checks every UPI reference before your subscription activates."],
              ["Manual, audited preparation", "Every APK upload, assignment and publish action is recorded in our audit log with the administrator who performed it."],
              ["Isolated tenants", "Your build carries its own tenant identifier and Firebase configuration. Downloads are authorized per-customer, server-side."],
              ["Files never exposed", "APKs and payment proofs live outside the web root and are streamed only to the customer they belong to."],
            ].map(([t, d], i) => (
              <Reveal key={t} delay={i * 90}>
                <div className="card card-hover p-6 h-full">
                  <svg className="text-volt mb-4" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  <h3 className="font-bold text-sm mb-2">{t}</h3>
                  <p className="text-mist text-[13px] leading-relaxed">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          {(content.testimonials as any[]).length > 0 ? (
            <div className="grid md:grid-cols-3 gap-5">
              {(content.testimonials as any[]).slice(0, 3).map((t) => (
                <Reveal key={t.name}>
                  <figure className="card p-6 h-full">
                    <blockquote className="text-sm leading-relaxed text-snow/90 mb-4">
                      “{t.quote}”
                    </blockquote>
                    <figcaption className="mono text-[11px] text-mist">
                      {t.name} — {t.role}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal>
              <div className="empty !py-10 max-w-2xl mx-auto">
                <p className="text-sm">
                  <b className="text-snow">We only publish real customer reviews.</b> Tournamax is
                  new — once customers start shipping tournaments with their branded apps, their
                  words will appear here. Be among the first to use it.
                </p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="py-28 border-t border-line relative overflow-hidden">
        <div className="hero-bg">
          <div className="hero-glow !top-auto !bottom-[-380px] !left-1/2 !-translate-x-1/2" />
        </div>
        <div className="wrap relative text-center">
          <Reveal>
            <h2 className="h-display text-3xl sm:text-5xl font-bold mb-6">
              Ready to launch <span className="text-volt">your</span> tournament app?
            </h2>
            <p className="text-mist text-lg mb-9 max-w-xl mx-auto">
              Register, submit your branding and get both APKs in your dashboard.
            </p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link href="/register" className="btn btn-volt btn-lg">
                Get Your Tournament App
              </Link>
              <Link href="/login" className="btn btn-ghost btn-lg">
                I already have an account
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-line py-14">
        <div className="wrap-wide grid md:grid-cols-4 gap-10">
          <div>
            <Logo />
            <p className="text-mist text-sm mt-4 leading-relaxed">
              White-label tournament apps. Prepared by hand, verified by humans, delivered to
              your dashboard.
            </p>
          </div>
          <div>
            <h4 className="kicker dim mb-4">Product</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                ["#product", "Product preview"],
                ["#features", "Features"],
                ["#how", "How it works"],
                ["#pricing", "Pricing"],
                ["#faq", "FAQ"],
              ].map(([h, l]) => (
                <li key={l}>
                  <a href={h} className="text-mist hover:text-volt transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="kicker dim mb-4">Legal & Support</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/legal/terms" className="text-mist hover:text-volt transition-colors">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-mist hover:text-volt transition-colors">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/legal/refund" className="text-mist hover:text-volt transition-colors">
                  Refund policy
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${content.contact?.email ?? "guliavansh64@gmail.com"}`}
                  className="text-mist hover:text-volt transition-colors"
                >
                  {content.contact?.email}
                </a>
              </li>
              <li className="text-mist">
                {content.contact?.phone} · {content.contact?.hours}
              </li>
            </ul>
          </div>
          <div>
            <h4 className="kicker dim mb-4">Platform</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/register" className="text-mist hover:text-volt transition-colors">
                  Customer sign up
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-mist hover:text-volt transition-colors">
                  Customer login
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="wrap-wide mt-12 pt-6 border-t border-line flex flex-wrap gap-3 justify-between mono text-[11px] text-mist">
          <span>© {new Date().getFullYear()} Tournamax. All rights reserved.</span>
          <span>APKs are prepared manually by our team — this site never auto-builds applications.</span>
        </div>
      </footer>
    </main>
  );
}
