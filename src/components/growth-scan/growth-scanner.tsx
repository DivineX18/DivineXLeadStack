"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The public Growth Scan experience: form, the wait, and the result.
 *
 * The scan is genuinely asynchronous — the API answers 202 with a share token
 * and the engine works in the background for one to three minutes — so the
 * whole point of this component is that the visitor never has to refresh or
 * wonder. It polls, it says what is happening, and it renders the moment the
 * report is readable.
 *
 * The result hierarchy is the product's actual argument, in order: the score,
 * then the ONE constraint, then why it matters, then what to fix first. The
 * six category scores come last. Leading with a grid of category cards would
 * bury the only answer the visitor came for.
 */

interface Report {
  overallScore: number | null;
  scoreLabel: string | null;
  primaryConstraint: string | null;
  categories: { key: string; label: string; score: number; finding: string | null }[];
  topOpportunities: { title: string; detail: string | null }[];
  recommendedLeadMagnet: string | null;
  websiteUrl: string | null;
}

type Phase =
  | { s: "idle" }
  | { s: "starting" }
  | { s: "running"; token: string; since: number }
  | { s: "ready"; report: Report }
  | { s: "error"; message: string };

const SCAN_DIMENSIONS = [
  "Offer clarity",
  "Conversion journey",
  "Trust & authority",
  "Lead capture",
  "Buyer experience",
  "SEO foundation",
];

/** What the visitor sees while the engine works. Honest about the stage. */
const WAIT_STAGES = [
  "Reading your website…",
  "Mapping your conversion journey…",
  "Scoring six growth dimensions…",
  "Identifying your biggest constraint…",
  "Writing your prioritized actions…",
];

export function GrowthScanner() {
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [stage, setStage] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Advance the waiting copy so a two-minute scan never looks frozen.
  useEffect(() => {
    if (phase.s !== "running") return;
    const t = setInterval(() => setStage((i) => Math.min(i + 1, WAIT_STAGES.length - 1)), 18_000);
    return () => clearInterval(t);
  }, [phase.s]);

  useEffect(() => {
    if (phase.s !== "running") return;
    const token = phase.token;
    stopPolling();
    pollRef.current = setInterval(async () => {
      // Give up rather than poll forever; the engine is minutes, not tens.
      if (Date.now() - phase.since > 9 * 60_000) {
        stopPolling();
        setPhase({
          s: "error",
          message:
            "Your scan is taking longer than usual. We'll email your results when it finishes, so you don't need to keep this page open.",
        });
        return;
      }
      const res = await fetch(`/api/public/growth-scan/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
      if (!res || !res.ok) return; // a blip mid-scan is not a failure
      const data = (await res.json().catch(() => null)) as { state?: string; report?: Report; error?: string } | null;
      if (data?.state === "ready" && data.report) {
        stopPolling();
        setPhase({ s: "ready", report: data.report });
      } else if (data?.state === "failed") {
        stopPolling();
        setPhase({ s: "error", message: data.error ?? "We couldn't complete that scan." });
      }
    }, 6_000);
    return () => stopPolling();
  }, [phase, stopPolling]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStage(0);
    setPhase({ s: "starting" });
    const res = await fetch("/api/public/growth-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, websiteUrl: website, businessType: "unknown" }),
    }).catch(() => null);

    if (!res) {
      setPhase({ s: "error", message: "We couldn't reach the scanner. Check your connection and try again." });
      return;
    }
    const data = (await res.json().catch(() => null)) as { shareToken?: string; error?: string } | null;
    if (!res.ok || !data?.shareToken) {
      setPhase({ s: "error", message: data?.error ?? "We couldn't start that scan. Please try again." });
      return;
    }
    setPhase({ s: "running", token: data.shareToken, since: Date.now() });
  }

  return (
    <main className="min-h-dvh bg-[#0b0d12] text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
        {phase.s === "ready" ? (
          <Results report={phase.report} />
        ) : (
          <>
            <header className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Ascend</p>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
                Find what&apos;s costing you leads.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65">
                Enter your website and Ascend will analyze your marketing, identify your biggest growth
                constraint, and show you what to fix first.
              </p>
            </header>

            {phase.s === "running" || phase.s === "starting" ? (
              <Waiting stage={phase.s === "starting" ? 0 : stage} />
            ) : (
              <form onSubmit={onSubmit} className="mx-auto mt-10 max-w-md space-y-3">
                <Field label="Your website" value={website} onChange={setWebsite} placeholder="yourbusiness.com" autoFocus required />
                <Field label="Email" value={email} onChange={setEmail} placeholder="you@yourbusiness.com" type="email" required />
                <Field label="Your name" value={name} onChange={setName} placeholder="Jane" />
                <button
                  type="submit"
                  className="mt-2 w-full rounded-xl bg-white px-6 py-4 text-base font-bold text-[#0b0d12] transition hover:bg-white/90"
                >
                  Run My Free Growth Scan
                </button>
                <p className="pt-1 text-center text-xs text-white/45">
                  Free growth assessment. No software setup required.
                </p>
                {phase.s === "error" && (
                  <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {phase.message}
                  </p>
                )}
              </form>
            )}

            <section className="mt-16 border-t border-white/10 pt-10">
              <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                What Ascend looks for
              </h2>
              <ul className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                {SCAN_DIMENSIONS.map((d) => (
                  <li key={d} className="rounded-full border border-white/12 px-3.5 py-1.5 text-sm text-white/70">
                    {d}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-14 rounded-2xl border border-white/10 bg-white/[0.03] p-7 text-center">
              <p className="text-lg font-bold leading-snug">
                Most marketing platforms start with what you want to build.
              </p>
              <p className="mt-1.5 text-lg font-bold leading-snug text-white/55">
                Ascend starts with what you actually need to fix.
              </p>
              <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wider text-white/40">
                {["Diagnose", "Prioritize", "Create", "Execute", "Measure"].map((s, i) => (
                  <span key={s}>
                    {i > 0 && <span className="mr-2 text-white/20">→</span>}
                    {s}
                  </span>
                ))}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", required, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-medium text-white/55">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder:text-white/30 focus:border-white/35 focus:outline-none"
      />
    </label>
  );
}

function Waiting({ stage }: { stage: number }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center" aria-live="polite">
      <div className="mx-auto h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-[scan_1.6s_ease-in-out_infinite] rounded-full bg-white/70" />
      </div>
      <p className="mt-6 text-base font-semibold">{WAIT_STAGES[stage]}</p>
      <p className="mt-2 text-sm text-white/50">
        This usually takes one to three minutes. You can leave this page open.
      </p>
      <style>{`@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

/** The diagnosis, in the order it actually argues. */
function Results({ report }: { report: Report }) {
  const TRIAL_DISCLOSURE = "$0 today. Card required. $197/mo after 14 days. Cancel anytime during the trial.";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Ascend Growth Scan</p>
      {report.websiteUrl && <p className="mt-2 text-sm text-white/50">{report.websiteUrl}</p>}

      {report.overallScore !== null && (
        <div className="mt-7 flex items-baseline gap-3">
          <span className="text-6xl font-extrabold tracking-tight">{report.overallScore}</span>
          <span className="text-xl text-white/40">/ 100</span>
          {report.scoreLabel && <span className="ml-1 text-sm font-semibold text-white/60">{report.scoreLabel}</span>}
        </div>
      )}

      {report.primaryConstraint && (
        <section className="mt-9 rounded-2xl border border-white/12 bg-white/[0.04] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Your #1 constraint</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">{report.primaryConstraint}</p>
          {/* Why it matters comes from the constraint's own finding — the
              engine's words, never a label invented here. */}
          {(() => {
            const c = report.categories.find(
              (x) => x.label.toLowerCase() === report.primaryConstraint!.toLowerCase(),
            );
            return c?.finding ? <p className="mt-4 text-[15px] leading-relaxed text-white/70">{c.finding}</p> : null;
          })()}
        </section>
      )}

      {report.topOpportunities.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">What to fix first</h2>
          <ol className="mt-4 space-y-4">
            {report.topOpportunities.map((o, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold leading-snug">{o.title}</p>
                  {o.detail && <p className="mt-1 text-sm leading-relaxed text-white/60">{o.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.categories.length > 0 && (
        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Every dimension scored</h2>
          <ul className="mt-4 space-y-2.5">
            {report.categories.map((c) => (
              <li key={c.key || c.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-white/70">{c.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-white/55" style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
                </span>
                <span className="w-9 shrink-0 text-right text-sm tabular-nums text-white/50">{c.score}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14 rounded-2xl border border-white/12 bg-white/[0.05] p-7">
        <h2 className="text-2xl font-extrabold tracking-tight">Put this recommendation into action with Ascend</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/65">
          Ascend helps you create the fix, publish it, capture the leads it brings in, follow up
          automatically, and measure what changed.
        </p>
        {/* /start, not /pricing. After a personalized diagnosis, a full pricing
            table asks the visitor to re-choose something the scan has already
            earned the right to assume. /start is the EXISTING certified first
            step of the trial: host-aware (resolveProductSurface picks Ascend
            Solo on this host, Flow's plan on crm), and it hands off to the
            same Stripe Checkout that has always been the only thing able to
            create a customer. No new checkout architecture. */}
        <a
          href="/start"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-4 text-base font-bold text-[#0b0d12] transition hover:bg-white/90 sm:w-auto"
        >
          Start My 14-Day Free Trial
        </a>
        {/* Stated in full, every time. The scan is free and needs no card; the
            trial is a different decision and does. Those never blur. */}
        <p className="mt-3 text-xs text-white/45">{TRIAL_DISCLOSURE}</p>
      </section>
    </div>
  );
}
