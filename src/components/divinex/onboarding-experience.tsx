"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Globe, Loader2, Sparkles } from "lucide-react";
import {
  MODE_PROMISE,
  VISUAL_PAIRS,
  resolveSteps,
  stepDisposition,
  readProfilePath,
  type OnboardingMode,
  type OnboardingStep,
} from "@/lib/divinex/onboarding-manifest";

/**
 * DIVINEX GUIDED ONBOARDING (Slice 4) — the unified customer experience,
 * built in Flow's /app (Amendment 2: no second frontend). One primary task
 * per screen, real progress, meaningful loading states, and progressive
 * enrichment (known answers are skipped; extracted ones are offered for
 * one-tap confirmation instead of being re-asked).
 *
 * Every canonical write goes through /api/app/onboarding → Ascend. This
 * component stores nothing authoritative.
 */

type Profile = Record<string, unknown> | null;

interface DiscoveryAsset {
  id?: number;
  url: string;
  alt: string | null;
  classification: string;
  confidence: number;
}

const DISCOVERY_STAGES = [
  "Connecting to your website",
  "Understanding your business",
  "Finding your brand identity",
  "Discovering your strongest assets",
  "Building your profile",
];

export function OnboardingExperience({
  subAccountId,
  mode = "complete",
}: {
  subAccountId: string;
  mode?: OnboardingMode;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [businessProfileId, setBusinessProfileId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Discovery state
  const [stage, setStage] = useState(-1);
  const [discovery, setDiscovery] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<DiscoveryAsset[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/app/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subAccountId, businessProfileId, ...payload }),
    });
    return (await res.json()) as Record<string, unknown>;
  };

  useEffect(() => {
    void (async () => {
      const data = await post({ action: "start" });
      if (typeof data.businessProfileId === "number") setBusinessProfileId(data.businessProfileId);
      setProfile((data.profile as Profile) ?? null);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo(() => resolveSteps(mode, profile, answers), [mode, profile, answers]);
  const step: OnboardingStep | undefined = steps[index];
  const progress = steps.length > 1 ? Math.round((index / (steps.length - 1)) * 100) : 0;

  // Prefill from the profile when the step changes (confirmation flow).
  useEffect(() => {
    if (!step) return;
    const disp = stepDisposition(step, profile);
    setValue(disp.value ? String(disp.value) : (answers[step.id] ?? ""));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step?.id, profile]);

  const advance = (recorded?: string) => {
    if (step) setAnswers((a) => ({ ...a, [step.id]: recorded ?? value }));
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  async function saveAndNext() {
    if (!step) return;
    if (!step.optional && step.kind === "question" && !value.trim()) {
      setError("Add an answer to continue");
      return;
    }
    setBusy(true);
    try {
      if (step.field && value.trim()) {
        await post({ action: "answer", field: step.field, value: value.trim() });
      }
      advance();
    } finally {
      setBusy(false);
    }
  }

  async function runDiscovery() {
    if (!value.trim()) {
      advance("");
      return;
    }
    setBusy(true);
    setStage(0);
    // Stage ticker reflects the real phases the server runs; it never
    // completes on its own — the final stage lands when the call returns.
    const ticker = setInterval(() => setStage((s) => (s < DISCOVERY_STAGES.length - 2 ? s + 1 : s)), 2600);
    try {
      const data = await post({ action: "discover", websiteUrl: value.trim() });
      clearInterval(ticker);
      setStage(DISCOVERY_STAGES.length - 1);
      if (data.ok && data.discovery) {
        const d = data.discovery as Record<string, unknown>;
        setDiscovery(d);
        const found = ((d.assets as DiscoveryAsset[]) ?? []).filter(
          (a) => !["decorative", "unknown"].includes(a.classification),
        );
        setAssets(found);
        setApproved(new Set(found.slice(0, 12).map((a) => a.url)));
        const fresh = await post({ action: "start" });
        setProfile((fresh.profile as Profile) ?? null);
        advance(value.trim());
      } else {
        setError("We couldn't read that site. You can continue and add details yourself.");
        advance(value.trim());
      }
    } catch {
      clearInterval(ticker);
      setError("That took too long. Continuing without the scan.");
      advance(value.trim());
    } finally {
      setBusy(false);
      setStage(-1);
    }
  }

  async function confirmBrand() {
    setBusy(true);
    try {
      const brand = readProfilePath(profile, "brand.visual") as Record<string, unknown> | null;
      await post({ action: "confirm_brand", brandVisual: brand ?? {} });
      advance("confirmed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssets() {
    setBusy(true);
    try {
      const profileAssets = (readProfilePath(profile, "assets") as { id: number; fileUrl: string }[]) ?? [];
      const decisions = profileAssets
        .filter((a) => assets.some((d) => d.url === a.fileUrl))
        .map((a) => ({
          id: a.id,
          status: (approved.has(a.fileUrl) ? "approved" : "rejected") as "approved" | "rejected",
        }));
      if (decisions.length > 0) await post({ action: "review_assets", decisions });
      advance("done");
    } finally {
      setBusy(false);
    }
  }

  async function savePrefsAndNext() {
    setBusy(true);
    try {
      await post({
        action: "answer",
        field: "brandVisual.personality",
        value: Object.values(prefs),
      });
      advance("prefs");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await post({ action: "complete" });
      router.push(`/app/onboarding/reveal?w=${encodeURIComponent(subAccountId)}`);
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-40" />
      </div>
    );
  }
  if (!step) return null;

  const promise = MODE_PROMISE[mode];
  const disp = stepDisposition(step, profile);

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-2xl flex-col px-5 py-10">
      {/* Progress */}
      <div className="mb-10">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] opacity-40">
          {promise.title} · step {index + 1} of {steps.length}
        </p>
      </div>

      <div className="flex-1">
        {/* ── INTRO ── */}
        {step.kind === "intro" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Sparkles className="mb-6 h-8 w-8 text-emerald-400" />
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">{step.prompt}</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed opacity-60">{step.helper}</p>
          </div>
        )}

        {/* ── WEBSITE CONNECT ── */}
        {step.kind === "website_connect" && stage < 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Globe className="mb-6 h-7 w-7 text-emerald-400" />
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{step.prompt}</h1>
            <p className="mt-4 max-w-lg leading-relaxed opacity-60">{step.helper}</p>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDiscovery()}
              placeholder={step.placeholder}
              className="mt-8 w-full rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-lg outline-none transition-colors focus:border-emerald-400/60"
            />
          </div>
        )}

        {/* ── DISCOVERY PROGRESS (real stages only) ── */}
        {stage >= 0 && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-3xl font-bold tracking-tight">Learning your brand</h1>
            <div className="mt-8 space-y-4">
              {DISCOVERY_STAGES.map((label, i) => (
                <div key={label} className="flex items-center gap-3">
                  {i < stage ? (
                    <Check className="h-5 w-5 text-emerald-400" />
                  ) : i === stage ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-white/15" />
                  )}
                  <span className={i <= stage ? "opacity-90" : "opacity-35"}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BRAND REVIEW ── */}
        {step.kind === "brand_review" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{step.prompt}</h1>
            <p className="mt-3 opacity-60">{step.helper}</p>
            <BrandSummary profile={profile} discovery={discovery} />
          </div>
        )}

        {/* ── ASSET REVIEW ── */}
        {step.kind === "asset_review" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {assets.length > 0 ? `We found ${assets.length} usable assets` : step.prompt}
            </h1>
            <p className="mt-3 opacity-60">{step.helper}</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {assets.slice(0, 18).map((a) => {
                const on = approved.has(a.url);
                return (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() =>
                      setApproved((s) => {
                        const next = new Set(s);
                        if (next.has(a.url)) next.delete(a.url);
                        else next.add(a.url);
                        return next;
                      })
                    }
                    className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                      on ? "border-emerald-400 ring-2 ring-emerald-400/30" : "border-white/10 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.alt ?? ""} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {a.classification}
                    </span>
                    {on && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400">
                        <Check className="h-3 w-3 text-black" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {assets.length === 0 && (
              <p className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 opacity-70">
                No usable imagery found on that site. You can upload your own later — your pages will be composed
                without placeholder images until then.
              </p>
            )}
          </div>
        )}

        {/* ── VISUAL PREFERENCE (no-website path) ── */}
        {step.kind === "visual_preference" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{step.prompt}</h1>
            <p className="mt-3 opacity-60">{step.helper}</p>
            <div className="mt-8 space-y-5">
              {VISUAL_PAIRS.map((pair) => (
                <div key={pair.id} className="grid grid-cols-2 gap-3">
                  {[pair.left, pair.right].map((opt) => {
                    const on = prefs[pair.id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPrefs((p) => ({ ...p, [pair.id]: opt.value }))}
                        className={`rounded-xl border px-4 py-5 text-left transition-all ${
                          on ? "border-emerald-400 bg-emerald-400/10" : "border-white/12 hover:border-white/25"
                        }`}
                      >
                        <span className="font-semibold">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── QUESTION ── */}
        {step.kind === "question" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{step.prompt}</h1>
            {step.helper && <p className="mt-3 max-w-lg leading-relaxed opacity-60">{step.helper}</p>}
            {disp.disposition === "confirm" && (
              <p className="mt-4 inline-block rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-300">
                We found this on your site. Confirm or change it.
              </p>
            )}

            {step.inputType === "choice" ? (
              <div className="mt-7 space-y-2.5">
                {step.options?.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setValue(opt.value);
                      void (async () => {
                        setBusy(true);
                        if (step.field) await post({ action: "answer", field: step.field, value: opt.value });
                        setBusy(false);
                        advance(opt.value);
                      })();
                    }}
                    className={`w-full rounded-xl border px-5 py-4 text-left transition-all ${
                      value === opt.value ? "border-emerald-400 bg-emerald-400/10" : "border-white/12 hover:border-white/25"
                    }`}
                  >
                    <span className="font-semibold">{opt.label}</span>
                    {opt.description && <span className="mt-0.5 block text-sm opacity-55">{opt.description}</span>}
                  </button>
                ))}
              </div>
            ) : step.inputType === "textarea" ? (
              <textarea
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={step.placeholder}
                rows={4}
                className="mt-7 w-full resize-none rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-lg outline-none transition-colors focus:border-emerald-400/60"
              />
            ) : (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveAndNext()}
                placeholder={step.placeholder}
                className="mt-7 w-full rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-lg outline-none transition-colors focus:border-emerald-400/60"
              />
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-amber-400">{error}</p>}
      </div>

      {/* Controls */}
      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0 || busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm opacity-50 transition-opacity hover:opacity-90 disabled:invisible"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {stage < 0 && (
          <div className="flex items-center gap-3">
            {step.optional && step.kind === "website_connect" && (
              <button type="button" onClick={() => advance("")} disabled={busy} className="text-sm opacity-50 hover:opacity-90">
                I don&apos;t have one
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (step.kind === "website_connect") return void runDiscovery();
                if (step.kind === "brand_review") return void confirmBrand();
                if (step.kind === "asset_review") return void saveAssets();
                if (step.kind === "visual_preference") return void savePrefsAndNext();
                if (step.kind === "reveal") return void finish();
                if (step.kind === "intro") return advance("start");
                return void saveAndNext();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 font-semibold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {step.kind === "intro"
                ? "Get started"
                : step.kind === "website_connect"
                  ? "Learn my brand"
                  : step.kind === "brand_review"
                    ? "Yes, that's right"
                    : step.kind === "asset_review"
                      ? `Use ${approved.size} assets`
                      : step.kind === "reveal"
                        ? "See my growth system"
                        : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandSummary({ profile, discovery }: { profile: Profile; discovery: Record<string, unknown> | null }) {
  const visual = (readProfilePath(profile, "brand.visual") ?? {}) as Record<string, unknown>;
  const tokens = (visual.tokens ?? {}) as { logoUrl?: string; palette?: string[]; fonts?: string[] };
  const name = readProfilePath(profile, "business.name") as string | null;
  const personality = (visual.personality as string[]) ?? [];
  const photography = (visual.photographyStyle as string[]) ?? [];
  const assetCount = ((discovery?.assets as unknown[]) ?? []).length;

  return (
    <div className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center gap-4">
        {tokens.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tokens.logoUrl} alt="" className="h-10 w-auto max-w-[140px] object-contain" />
        ) : null}
        {name && <p className="text-xl font-bold tracking-tight">{name}</p>}
      </div>

      {(tokens.palette?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-40">Colors</p>
          <div className="mt-2 flex gap-2">
            {tokens.palette!.slice(0, 6).map((c) => (
              <span key={c} className="h-8 w-8 rounded-lg border border-white/10" style={{ backgroundColor: c }} title={c} />
            ))}
          </div>
        </div>
      )}

      {personality.length > 0 && (
        <Row label="Visual personality" value={personality.join(" · ")} inferred />
      )}
      {photography.length > 0 && <Row label="Photography" value={photography.join(" · ")} inferred />}
      {(tokens.fonts?.length ?? 0) > 0 && <Row label="Typography" value={tokens.fonts!.slice(0, 3).join(" · ")} />}
      {assetCount > 0 && <Row label="Assets discovered" value={`${assetCount} images found on your site`} />}
    </div>
  );
}

function Row({ label, value, inferred }: { label: string; value: string; inferred?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-40">
        {label}
        {inferred && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[9px] tracking-normal">inferred</span>}
      </p>
      <p className="mt-1 opacity-85">{value}</p>
    </div>
  );
}
