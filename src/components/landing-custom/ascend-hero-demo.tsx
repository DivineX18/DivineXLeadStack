"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Check, FileText, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero's product demonstration: the path that makes money.
 *
 * This deliberately does NOT show the Growth Scan. The hero's primary action
 * is the trial, and a scan report under a trial button sells the wrong thing
 * twice — once against the CTA, and once against the scan's own section
 * further down the page, which is where the diagnosis belongs.
 *
 * So the copy carries the diagnosis ("finds what's costing you leads") and the
 * visual carries the payoff: a page goes live, a lead lands, follow-up sends
 * itself, a booking appears. Four beats, in the order a customer experiences
 * them.
 *
 * Three rules it keeps:
 *  - Nothing depicts traffic arriving. The lead comes from a form the business
 *    already has. Ascend converts attention it did not create.
 *  - No revenue, no counts, no lift. A number here would be a claim we cannot
 *    make, and the caption says the walkthrough is illustrative.
 *  - It plays ONCE and holds. A looping dashboard stops explaining anything
 *    after the first pass and starts reading as a screensaver.
 */

interface DemoRow {
  icon: typeof FileText;
  title: string;
  detail: string;
  at: number;
  /** The last beat: the thing the customer actually wanted. */
  outcome?: boolean;
}

const ROWS: DemoRow[] = [
  {
    icon: FileText,
    title: "Landing page published",
    detail: "Built from what your business actually needs",
    at: 0,
  },
  {
    icon: UserPlus,
    title: "New lead captured",
    detail: "Straight into your CRM, with the full history",
    at: 700,
  },
  {
    icon: Mail,
    title: "Follow-up sent automatically",
    detail: "No one had to remember",
    at: 1500,
  },
  {
    icon: CalendarCheck,
    title: "Consultation booked",
    detail: "On the calendar, confirmed",
    at: 2300,
    outcome: true,
  },
];

export function AscendHeroDemo() {
  const [shown, setShown] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);
  const played = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion gets the finished state at once. The final frame is
    // authored to be the whole story, so this is a real alternative rather
    // than a degraded one.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(ROWS.length - 1);
      played.current = true;
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        ROWS.forEach((r, i) => timers.push(setTimeout(() => setShown(i), r.at)));
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={ref} className="mx-auto mt-16 max-w-3xl">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="ml-2 text-xs font-medium text-muted-foreground">Ascend</span>
        </div>

        <div className="divide-y">
          {ROWS.map((row, i) => {
            const visible = shown >= i;
            return (
              <div
                key={row.title}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 transition-all duration-500 md:px-6",
                  visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  row.outcome && visible && "bg-emerald-500/5",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                    row.outcome
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-primary/30 bg-primary/5 text-primary",
                  )}
                >
                  {row.outcome ? <Check className="h-5 w-5" /> : <row.icon className="h-5 w-5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
                </div>

                <span
                  className={cn(
                    "hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-block",
                    row.outcome
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {row.outcome ? "Done" : "Automatic"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground/70">
        Illustrative walkthrough of the Ascend workflow.
      </p>
    </div>
  );
}
