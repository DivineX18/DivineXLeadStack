"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero's demonstration: the Growth Scan, doing the thing the headline
 * promises.
 *
 * It previously showed a generic automation feed — page published, lead
 * captured, follow-up sent, booking made. True of the product, but it sold the
 * same four rows every marketing tool sells, and it illustrated the half of
 * Ascend that is NOT the differentiator. The headline says "find what's costing
 * you leads"; the picture underneath it showed things being built.
 *
 * So this simulates the scan instead, and it is a faithful simulation: the
 * beats, the structure and the vocabulary are lifted from what
 * `components/growth-scan/growth-scanner.tsx` actually renders for a real
 * report — a score out of 100 with a band label, ONE named primary constraint
 * with the finding underneath it, the six dimensions scored, and a ranked list
 * of what to fix first. Someone who watches this and then runs a scan sees the
 * same shape.
 *
 * HONESTY RULES, unchanged from the version it replaces:
 *  - The site is `yourbusiness.com` and the caption says the walkthrough is
 *    illustrative, so nothing here reads as a real customer's result.
 *  - No revenue, no lift, no counts, no testimonial. The only number is a
 *    score, which is the product's own output, on an obviously fictional site.
 *  - It plays ONCE and holds on the finished frame. A looping dashboard stops
 *    explaining after the first pass and becomes a screensaver.
 *  - Reduced motion jumps to that finished frame, which is authored to carry
 *    the whole story on its own.
 */

const SITE = "yourbusiness.com";
const SCORE = 61;
const BAND = "Needs work";

/** The six dimensions the real scan scores, in the real engine's order. */
const DIMENSIONS: { label: string; score: number }[] = [
  { label: "Offer clarity", score: 38 },
  { label: "Lead capture", score: 52 },
  { label: "Trust & authority", score: 64 },
  { label: "Conversion journey", score: 71 },
  { label: "Buyer experience", score: 76 },
  { label: "SEO foundation", score: 83 },
];

/** The ranked fixes, the way the report orders them. */
const FIXES = [
  "Say who it's for and what changes, above the fold",
  "Cut the capture form to the two fields you act on",
  "Put one real outcome where the decision happens",
];

/** Score bands match the report's own tiers: red under 50, amber under 70. */
function toneFor(score: number) {
  if (score < 50) return { ring: "#f87171", bar: "bg-red-400", text: "text-red-400" };
  if (score < 70) return { ring: "#fbbf24", bar: "bg-amber-400", text: "text-amber-400" };
  return { ring: "#34d399", bar: "bg-emerald-400", text: "text-emerald-400" };
}

type Beat = 0 | 1 | 2 | 3 | 4; // idle → scanning → score → constraint → fixes

export function AscendHeroDemo() {
  const [beat, setBeat] = useState<Beat>(0);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const played = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setBeat(4);
      setCount(SCORE);
      played.current = true;
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();

        timers.push(setTimeout(() => setBeat(1), 250)); // scanning
        timers.push(
          setTimeout(() => {
            setBeat(2); // the score lands, and counts up to it
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / 900);
              // Ease-out so it decelerates into the number rather than stopping dead.
              setCount(Math.round(SCORE * (1 - Math.pow(1 - p, 3))));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }, 1800),
        );
        timers.push(setTimeout(() => setBeat(3), 3000)); // the constraint is named
        timers.push(setTimeout(() => setBeat(4), 4000)); // what to fix first
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const scanning = beat === 1;
  const tone = toneFor(SCORE);
  const R = 52;
  const CIRC = 2 * Math.PI * R;

  return (
    <div ref={ref} className="mx-auto mt-16 max-w-4xl">
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
        {/* Depth behind the content, so the panel reads as a surface rather
            than a flat rectangle. */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,oklch(0.72_0.16_165)_/_10%,transparent_60%)]" />

        {/* The address bar: the one input the visitor is about to fill in. */}
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3.5 md:px-5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-muted-foreground">{SITE}</span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              beat >= 2 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
            )}
          >
            {beat === 0 ? "Ready" : scanning ? "Scanning" : "Scan complete"}
          </span>
        </div>

        {/* The sweep only exists while it is actually scanning. */}
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          {scanning && (
            <div className="h-full w-1/3 animate-[heroscan_1.3s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
          )}
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr] md:gap-8 md:p-7">
          {/* ── The score, as a ring that fills to it ── */}
          <div className="flex items-center gap-5 md:flex-col md:items-start md:gap-3">
            <div className="relative h-[128px] w-[128px] shrink-0">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={R} fill="none" strokeWidth="9" className="stroke-muted" />
                <circle
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="round"
                  stroke={tone.ring}
                  strokeDasharray={CIRC}
                  strokeDashoffset={beat >= 2 ? CIRC * (1 - SCORE / 100) : CIRC}
                  style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-extrabold tabular-nums tracking-tight">{beat >= 2 ? count : "--"}</span>
                <span className="text-[11px] font-medium text-muted-foreground">out of 100</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Growth Score</p>
              <p className={cn("mt-1 text-sm font-bold transition-opacity duration-500", tone.text, beat >= 2 ? "opacity-100" : "opacity-0")}>
                {BAND}
              </p>
            </div>
          </div>

          {/* ── The diagnosis, then the prescription ── */}
          <div className="min-w-0">
            {/* ONE constraint, named. This is the product's whole argument. */}
            <div
              className={cn(
                "rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 transition-all duration-700",
                beat >= 3 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Your #1 constraint
              </p>
              <p className="mt-1.5 text-lg font-extrabold leading-tight">Offer clarity</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Your homepage describes what you do, but never says who it&apos;s for or what changes for
                them. Visitors who fit leave without recognising themselves.
              </p>
            </div>

            {/* The six dimensions, so the score is legible rather than asserted. */}
            <ul className="mt-4 space-y-1.5">
              {DIMENSIONS.map((d, i) => {
                const t = toneFor(d.score);
                return (
                  <li key={d.label} className="flex items-center gap-3">
                    <span className="w-[104px] shrink-0 truncate text-[11px] text-muted-foreground">{d.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("block h-full rounded-full", t.bar)}
                        style={{
                          width: beat >= 2 ? `${d.score}%` : "0%",
                          transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${180 + i * 90}ms`,
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {beat >= 2 ? d.score : ""}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* What to fix first, ranked — and the action that builds it. */}
            <div
              className={cn(
                "mt-5 border-t pt-4 transition-all duration-700",
                beat >= 4 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What to fix first
              </p>
              <ol className="mt-2.5 space-y-1.5">
                {FIXES.map((f, i) => (
                  <li key={f} className="flex gap-2.5 text-[13px] leading-snug">
                    <span
                      className={cn(
                        "mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        i === 0 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{f}</span>
                  </li>
                ))}
              </ol>
              {/* The bridge the product actually offers, shown as the next step
                  rather than claimed in prose. Non-interactive on purpose: this
                  is a picture, and the real button is the CTA above. */}
              <div
                aria-hidden
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Fix this with Zeno
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        <style>{`@keyframes heroscan{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        Illustrative walkthrough. Your scan reads your own site.
      </p>
    </div>
  );
}
