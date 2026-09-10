"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero's product demonstration: four beats showing what actually happens
 * after signup — a score resolves, a constraint is named, the fix gets built,
 * it goes live.
 *
 * Built in code rather than from screenshots (there are none in the repo) and
 * deliberately simplified: this is the shape of the product, not a pixel copy
 * of it. It explains behaviour; it is not decoration.
 *
 * Three rules it must keep:
 *  - Nothing here depicts traffic arriving. Ascend converts attention it did
 *    not create, and an animation implying otherwise would be a claim we
 *    cannot make.
 *  - The score and the constraint are illustrative, and the caption says so.
 *    No revenue, no lift, no fabricated result.
 *  - It plays ONCE and holds. A looping dashboard reads as a screensaver and
 *    stops explaining anything after the first pass.
 */

const BEATS = [
  { at: 0, label: "Scanning" },
  { at: 600, label: "Score" },
  { at: 1400, label: "Constraint" },
  { at: 2200, label: "Live" },
] as const;

const CATEGORIES = [
  { label: "Offer clarity", value: 51, flagged: true },
  { label: "Proof", value: 68, flagged: false },
  { label: "Capture", value: 74, flagged: false },
  { label: "Follow up", value: 62, flagged: false },
];

export function AscendHeroDemo() {
  const [beat, setBeat] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);
  const played = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion gets the final frame immediately. The last beat is
    // authored to be a complete story on its own precisely so this is a real
    // alternative rather than a degraded one.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setBeat(BEATS.length - 1);
      played.current = true;
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        BEATS.forEach((b, i) => timers.push(setTimeout(() => setBeat(i), b.at)));
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const shown = Math.max(beat, 0);
  const score = beat >= 1 ? 56 : 0;

  return (
    <div ref={ref} className="mx-auto mt-16 max-w-4xl">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="ml-2 text-xs font-medium text-muted-foreground">Ascend</span>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:p-8">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-muted" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  className="stroke-emerald-500 transition-[stroke-dashoffset] duration-1000 ease-out"
                  style={{
                    strokeDasharray: 264,
                    strokeDashoffset: 264 - (264 * score) / 100,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{score || "—"}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {shown === 0 ? "Reading your site…" : "Growth Score"}
            </span>
          </div>

          <div className="space-y-3">
            {CATEGORIES.map((c, i) => (
              <div key={c.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {beat >= 1 ? c.value : "—"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 ease-out",
                      c.flagged ? "bg-amber-500" : "bg-emerald-500/70",
                    )}
                    style={{
                      width: beat >= 1 ? `${c.value}%` : "0%",
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </div>
              </div>
            ))}

            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 transition-all duration-500",
                beat >= 2 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
            >
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed">
                <span className="font-semibold">Biggest constraint: Offer clarity.</span>{" "}
                <span className="text-muted-foreground">
                  Visitors cannot tell quickly whether this is for them.
                </span>
              </p>
            </div>

            <div
              className={cn(
                "flex flex-wrap items-center gap-2 transition-all duration-500",
                beat >= 3 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
            >
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Fix this
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-md border bg-background px-2.5 py-1.5 text-xs">
                Landing page drafted
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Live, capturing leads
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        Illustrative walkthrough of the Ascend workflow. Scores shown are an example, not a result.
      </p>
    </div>
  );
}
