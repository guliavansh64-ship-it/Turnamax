"use client";

import { useState } from "react";
import { toast } from "../toast";

type Settings = Record<string, any>;

function jsonText(v: unknown): string {
  return JSON.stringify(v ?? [], null, 2);
}

export default function ContentManager({ settings }: { settings: Settings }) {
  const [busy, setBusy] = useState(false);
  const [hero, setHero] = useState({
    headline: settings.hero?.headline ?? "",
    sub: settings.hero?.sub ?? "",
    ctaPrimary: settings.hero?.ctaPrimary ?? "Get Your Tournament App",
    ctaSecondary: settings.hero?.ctaSecondary ?? "Explore Features",
  });
  const [contact, setContact] = useState({
    email: settings.contact?.email ?? "",
    phone: settings.contact?.phone ?? "",
    hours: settings.contact?.hours ?? "",
  });
  const [policies, setPolicies] = useState({
    terms: settings.policies?.terms ?? "",
    privacy: settings.policies?.privacy ?? "",
    refund: settings.policies?.refund ?? "",
  });
  const [faqs, setFaqs] = useState(jsonText(settings.faqs));
  const [features, setFeatures] = useState(jsonText(settings.features));
  const [announcements, setAnnouncements] = useState(jsonText(settings.announcements));
  const [testimonials, setTestimonials] = useState(jsonText(settings.testimonials));
  const [subConfig, setSubConfig] = useState({
    warningDays: Number(settings.subscription_config?.warningDays ?? 3),
    graceDays: Number(settings.subscription_config?.graceDays ?? 2),
    renewalFee: Number(settings.subscription_config?.renewalFee ?? 50),
    upiId: settings.subscription_config?.upiId ?? "tournamax@upi",
    upiName: settings.subscription_config?.upiName ?? "Tournamax",
    adminLockMessage:
      settings.subscription_config?.adminLockMessage ??
      "Your hosting subscription expired. Management features are restricted until renewal payment is verified.",
    warningMessage:
      settings.subscription_config?.warningMessage ??
      "Your tournament hosting renewal is due soon. Fee: ₹50 / 30 days.",
    userLockMessage:
      settings.subscription_config?.userLockMessage ?? "Coming Back Soon",
    userLockSubmessage:
      settings.subscription_config?.userLockSubmessage ??
      "This tournament app is currently undergoing scheduled maintenance & subscription renewal. Tournaments, squads, and live matches will resume shortly once the organizer completes renewal!",
  });

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      let faqsArr: unknown, featuresArr: unknown, annArr: unknown, testiArr: unknown;
      for (const [name, text, setter] of [
        ["faqs", faqs, setFaqs],
        ["features", features, setFeatures],
        ["announcements", announcements, setAnnouncements],
        ["testimonials", testimonials, setTestimonials],
      ] as const) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text || "[]");
        } catch {
          toast(`"${name}" is not valid JSON. Fix it before saving.`, "error");
          setBusy(false);
          return;
        }
        if (!Array.isArray(parsed)) {
          toast(`"${name}" must be a JSON array.`, "error");
          setBusy(false);
          return;
        }
        if (name === "faqs") faqsArr = parsed;
        if (name === "features") featuresArr = parsed;
        if (name === "announcements") annArr = parsed;
        if (name === "testimonials") testiArr = parsed;
        void setter;
      }

      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hero,
          contact,
          policies,
          faqs: faqsArr,
          features: featuresArr,
          announcements: annArr,
          testimonials: testiArr,
          subscription_config: subConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) toast("Content saved. The public site updates immediately.", "success");
      else toast(data.error ?? "Save failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-lg">Homepage hero</h2>
          <div className="field">
            <label className="label">Headline</label>
            <input className="input" value={hero.headline} onChange={(e) => setHero({ ...hero, headline: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Supporting text</label>
            <textarea className="input" rows={3} value={hero.sub} onChange={(e) => setHero({ ...hero, sub: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="label">Primary CTA</label>
              <input className="input" value={hero.ctaPrimary} onChange={(e) => setHero({ ...hero, ctaPrimary: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Secondary CTA</label>
              <input className="input" value={hero.ctaSecondary} onChange={(e) => setHero({ ...hero, ctaSecondary: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-lg">Contact / support</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="field col-span-1">
                <label className="label">Email</label>
                <input className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Phone</label>
                <input className="input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Hours</label>
                <input className="input" value={contact.hours} onChange={(e) => setContact({ ...contact, hours: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <JsonEditor label="FAQs (array of {q, a})" value={faqs} onChange={setFaqs} rows={10} />
        <JsonEditor label="Features (array of {icon, title, desc})" value={features} onChange={setFeatures} rows={10} />
        <JsonEditor label="Announcements (array of {title, body, active})" value={announcements} onChange={setAnnouncements} rows={6} />
        <JsonEditor label="Testimonials (array of {name, role, quote} — only real reviews)" value={testimonials} onChange={setTestimonials} rows={6} />
      </div>

      {/* -------- Tournament Subscription & Lock Settings -------- */}
      <div className="card p-6 space-y-5 border border-volt/20">
        <div>
          <span className="tag tag-volt mb-2">Automated Enforcement</span>
          <h2 className="font-bold text-xl">Tournament Subscription &amp; Lock System</h2>
          <p className="hint mt-1">
            Rules governing the Tournament Admin APK warning banner, immediate Admin expiry lock, and delayed User APK lock screen (&quot;Coming Back Soon&quot;).
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="field !mb-0">
            <label className="label">Warning period (days before expiry)</label>
            <input
              type="number"
              min={1}
              max={15}
              className="input"
              value={subConfig.warningDays}
              onChange={(e) =>
                setSubConfig({ ...subConfig, warningDays: Math.max(1, Number(e.target.value) || 1) })
              }
            />
            <span className="text-[11px] text-mist mt-1 block">
              Dismissible warning popup shown on Admin APK
            </span>
          </div>

          <div className="field !mb-0">
            <label className="label">Delayed User APK lock (grace days)</label>
            <input
              type="number"
              min={0}
              max={15}
              className="input"
              value={subConfig.graceDays}
              onChange={(e) =>
                setSubConfig({ ...subConfig, graceDays: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <span className="text-[11px] text-mist mt-1 block">
              Days after expiry before User APK locks with maintenance screen
            </span>
          </div>

          <div className="field !mb-0">
            <label className="label">Platform Renewal UPI ID</label>
            <input
              type="text"
              className="input"
              value={subConfig.upiId}
              onChange={(e) => setSubConfig({ ...subConfig, upiId: e.target.value })}
            />
            <span className="text-[11px] text-mist mt-1 block">
              Embedded in Admin APK lock screen QR code
            </span>
          </div>

          <div className="field !mb-0">
            <label className="label">Payee Name</label>
            <input
              type="text"
              className="input"
              value={subConfig.upiName}
              onChange={(e) => setSubConfig({ ...subConfig, upiName: e.target.value })}
            />
            <span className="text-[11px] text-mist mt-1 block">
              Displayed in UPI payment apps
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="field !mb-0">
            <label className="label">Tournament Admin APK Expiry Lock Message</label>
            <textarea
              className="input"
              rows={3}
              value={subConfig.adminLockMessage}
              onChange={(e) => setSubConfig({ ...subConfig, adminLockMessage: e.target.value })}
            />
            <span className="text-[11px] text-mist mt-1 block">
              Displayed on Admin APK non-dismissible lock screen
            </span>
          </div>

          <div className="space-y-3">
            <div className="field !mb-0">
              <label className="label">User APK Maintenance Headline</label>
              <input
                type="text"
                className="input"
                value={subConfig.userLockMessage}
                onChange={(e) => setSubConfig({ ...subConfig, userLockMessage: e.target.value })}
              />
            </div>
            <div className="field !mb-0">
              <label className="label">User APK Maintenance Description</label>
              <textarea
                className="input"
                rows={2}
                value={subConfig.userLockSubmessage}
                onChange={(e) => setSubConfig({ ...subConfig, userLockSubmessage: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Policies</h2>
        <div className="field">
          <label className="label">Terms of service</label>
          <textarea className="input" rows={7} value={policies.terms} onChange={(e) => setPolicies({ ...policies, terms: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Privacy policy</label>
          <textarea className="input" rows={7} value={policies.privacy} onChange={(e) => setPolicies({ ...policies, privacy: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Refund policy</label>
          <textarea className="input" rows={5} value={policies.refund} onChange={(e) => setPolicies({ ...policies, refund: e.target.value })} />
        </div>
      </div>

      <button className="btn btn-volt btn-lg" onClick={save} disabled={busy}>
        {busy ? <span className="spinner" /> : "Save all content"}
      </button>
    </div>
  );
}

function JsonEditor({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className="card p-6">
      <label className="label">{label}</label>
      <textarea
        className="input mono !text-[12px]"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
