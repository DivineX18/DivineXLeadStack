"use client";

import { useState } from "react";
import type { PortalView } from "@/lib/onboarding/portal-service";
import type { OnboardingSectionKey } from "@/types/client-onboarding";

/**
 * The client's onboarding experience.
 *
 * Written for someone who has just paid, has never seen this before, and is
 * doing it on a phone between other jobs. Three consequences shape it:
 *
 *   Everything autosaves. Nobody loses twenty minutes of typing because their
 *   session, their signal or their patience ran out.
 *
 *   Progress is always visible, and so is what is left. "You are 60% done, two
 *   things remain" is a reason to continue. A form with no end in sight is not.
 *
 *   It never shows internal state. No account owner, no notes, no other
 *   clients. The view model it receives simply does not contain them.
 */

const SECTION_LABELS: Record<OnboardingSectionKey, string> = {
  business: "About your business",
  brand: "Your brand",
  website: "Website and content",
  marketing: "Marketing and growth",
  social: "Social media",
};

const SECTION_FIELDS: Record<OnboardingSectionKey, { key: string; label: string; long?: boolean }[]> = {
  business: [
    { key: "business_name", label: "Business name" },
    { key: "website_url", label: "Website address" },
    { key: "contact_details", label: "Best phone and email for your business" },
    { key: "industry", label: "Industry" },
    { key: "services", label: "Main services or products", long: true },
    { key: "service_areas", label: "Areas you serve" },
    { key: "target_audience", label: "Who you most want to reach", long: true },
    { key: "competitors", label: "Main competitors" },
    { key: "goals", label: "What you want this to achieve", long: true },
    { key: "challenges", label: "What is getting in the way right now", long: true },
  ],
  brand: [
    { key: "brand_colors", label: "Brand colours, if you know them" },
    { key: "fonts", label: "Fonts, if you have them" },
    { key: "voice", label: "How you want to sound to a customer", long: true },
    { key: "social_profiles", label: "Your social profile links", long: true },
    { key: "inspiration", label: "Brands or sites you like, and why", long: true },
  ],
  website: [
    { key: "existing_site", label: "Current website address" },
    { key: "pages_needed", label: "Pages you need", long: true },
    { key: "main_offers", label: "Main offers", long: true },
    { key: "primary_cta", label: "The one action you most want visitors to take" },
    { key: "testimonials", label: "Testimonials we may use", long: true },
    { key: "faqs", label: "Questions customers always ask", long: true },
    { key: "design_preferences", label: "Anything you want, or definitely do not want", long: true },
    { key: "functionality", label: "Special functionality needed", long: true },
  ],
  marketing: [
    { key: "acquisition_goals", label: "How you want customers to find you", long: true },
    { key: "lead_magnets", label: "Any free guides or offers you already have" },
    { key: "email_platform", label: "Email platform you use" },
    { key: "booking_system", label: "Booking system you use" },
    { key: "current_crm", label: "CRM you use" },
    { key: "existing_funnels", label: "Funnels you already run" },
    { key: "seo_priorities", label: "What you most want to be found for", long: true },
    { key: "ads_history", label: "Advertising you have run before", long: true },
    { key: "conversion_goals", label: "What counts as a win for you" },
  ],
  social: [
    { key: "platforms", label: "Platforms you want us on" },
    { key: "content_preferences", label: "Content you want, and content you do not", long: true },
    { key: "examples", label: "Accounts whose style you like" },
    { key: "restrictions", label: "Anything we must never post", long: true },
    { key: "themes", label: "Themes you want to post about", long: true },
    { key: "approval_contact", label: "Who approves posts" },
  ],
};

export function OnboardingPortal({
  token,
  initialView,
  brandName,
}: {
  token: string;
  initialView: PortalView;
  brandName: string;
}) {
  const [view, setView] = useState(initialView);
  const [open, setOpen] = useState<OnboardingSectionKey | null>(view.sections[0] ?? null);
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>(
    () => ({ ...(view.intake as Record<string, Record<string, unknown>>) }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { view?: PortalView; error?: string; assetId?: string; uploadUrl?: string }
        | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "That didn't save. Check your connection and try again.");
        return null;
      }
      if (data.view) setView(data.view);
      return data;
    } catch {
      setError("That didn't reach us. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveSection(section: OnboardingSectionKey, markComplete: boolean) {
    await post({ action: "save_section", section, answers: draft[section] ?? {}, markComplete });
  }

  async function upload(file: File, key: string) {
    const minted = await post({
      action: "mint_upload",
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!minted?.uploadUrl || !minted.assetId) return;
    setBusy(true);
    try {
      // Straight to storage. The file never passes through the app, which is
      // what makes a 40MB brand pack possible at all.
      const put = await fetch(minted.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError("The upload was rejected by storage. Try again.");
        return;
      }
    } catch {
      setError("The upload didn't finish. Check your connection and try again.");
      return;
    } finally {
      setBusy(false);
    }
    await post({ action: "finalize_upload", assetId: minted.assetId, key, filename: file.name });
  }

  const remaining = [
    ...view.sections.filter((s) => !view.sectionsComplete.includes(s)).map((s) => SECTION_LABELS[s]),
    ...view.requiredAssets.filter((a) => !view.uploadedAssetKeys.includes(a)).map((a) => `Upload: ${a}`),
    ...view.platforms.filter((p) => p.required && p.state === "not_invited").map((p) => `Invite us to ${p.label}`),
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">{brandName} onboarding</p>
        <h1 className="mt-1 text-3xl font-bold">{view.businessName}</h1>
        <p className="mt-2 text-muted-foreground">
          {view.packageName}. Everything saves as you go, so you can close this and come back.
        </p>
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${view.completion.overallPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {view.completion.overallPct}% complete
            {remaining.length > 0 ? `, ${remaining.length} thing${remaining.length === 1 ? "" : "s"} left` : ", all done"}
          </p>
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3">
        {view.sections.map((section) => {
          const done = view.sectionsComplete.includes(section);
          const isOpen = open === section;
          return (
            <div key={section} className="rounded-xl border">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : section)}
                className="flex w-full items-center justify-between px-4 py-4 text-left"
              >
                <span className="font-semibold">{SECTION_LABELS[section]}</span>
                <span className={`text-sm ${done ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {done ? "Done" : "To do"}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-4 border-t px-4 py-5">
                  {SECTION_FIELDS[section].map((f) => (
                    <label key={f.key} className="block">
                      <span className="mb-1 block text-sm font-medium">{f.label}</span>
                      {f.long ? (
                        <textarea
                          rows={3}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={String(draft[section]?.[f.key] ?? "")}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [section]: { ...(d[section] ?? {}), [f.key]: e.target.value } }))
                          }
                        />
                      ) : (
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={String(draft[section]?.[f.key] ?? "")}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [section]: { ...(d[section] ?? {}), [f.key]: e.target.value } }))
                          }
                        />
                      )}
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveSection(section, false)}
                      className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                    >
                      Save for later
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveSection(section, true)}
                      className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                    >
                      Save and mark done
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {view.requiredAssets.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Files we need</h2>
          <div className="space-y-2">
            {view.requiredAssets.map((key) => {
              const have = view.uploadedAssetKeys.includes(key);
              return (
                <div key={key} className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                  <span className="text-sm">{key}</span>
                  {have ? (
                    <span className="text-sm text-emerald-600">Received</span>
                  ) : (
                    <label className="cursor-pointer text-sm text-primary underline">
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(file, key);
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view.platforms.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold">Give us access</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Invite <strong>{view.accessEmail}</strong> on each platform. We never ask for your
            password, and you can remove our access at any time.
          </p>
          <div className="space-y-3">
            {view.platforms.map((p) => (
              <div key={p.key} className="rounded-lg border px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{p.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.instructions}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Access level needed: {p.permissionLevel}
                    </p>
                  </div>
                  {p.verified ? (
                    <span className="shrink-0 text-sm text-emerald-600">Verified</span>
                  ) : p.state === "invited_by_client" ? (
                    <span className="shrink-0 text-sm text-muted-foreground">Checking</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void post({ action: "set_access", key: p.key, state: "invited_by_client" })}
                      className="shrink-0 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      I&apos;ve sent it
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-xl border p-5">
        {remaining.length === 0 ? (
          <>
            <p className="font-medium">That&apos;s everything. Thank you.</p>
            <button
              type="button"
              disabled={busy || view.submitted}
              onClick={() => void post({ action: "submit" })}
              className="mt-3 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {view.submitted ? "Submitted" : "Submit my onboarding"}
            </button>
          </>
        ) : (
          <>
            <p className="font-medium">Still to do</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {remaining.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
