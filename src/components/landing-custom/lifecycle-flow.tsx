"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Search, PenLine, Inbox, Repeat, CircleCheck, ArrowDown, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE LIFECYCLE STRIP, AND ONLY THIS ONE.
 *
 * A deliberate near-copy of StepFlow rather than a flag on it. StepFlow is a
 * SERVER component shared by four callers, two of them statically prerendered
 * pages; marking it `"use client"` to hold animation state broke the build
 * outright, because its `steps` carry `icon` as a component FUNCTION and a
 * Server Component cannot hand a function to a Client Component. Defining the
 * icons here, inside the client boundary, avoids that entirely.
 *
 * It also enforces the thing that was asked for: three strips on this page
 * share StepFlow's styling, and only this one is supposed to move. Keeping the
 * animation out of the shared component makes that structural rather than a
 * prop somebody could copy onto the others by accident.
 *
 * MOTION: the active treatment walks one step at a time, ~1.1s each, then
 * rests on the final outcome for 2.6s before starting again — a process
 * completing, not a chase light. Second in the page's motion hierarchy, behind
 * the hero scan.
 */

const STEPS = [
  { icon: Users, label: "Traffic", detail: "You already have it" },
  { icon: Search, label: "Understand", detail: "What's costing you leads" },
  { icon: PenLine, label: "Create", detail: "Build the fix" },
  { icon: Inbox, label: "Capture", detail: "Pages, forms, booking" },
  { icon: Repeat, label: "Follow up", detail: "Automatically" },
  { icon: CircleCheck, label: "Customer", detail: "" },
];

/** The step the static render emphasises: "Understand" is the beat other tools
 *  skip, and it is the whole positioning argument. It stays lit until the
 *  sequence takes over, and is what reduced-motion visitors keep. */
const EMPHASIS = 1;

export function LifecycleFlow() {
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      setActive(i);
      const last = i === STEPS.length - 1;
      i = last ? 0 : i + 1;
      timer = setTimeout(step, last ? 2600 : 1100);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        step();
      },
      { threshold: 0.25 },
    );
    io.observe(node);

    return () => {
      cancelled = true;
      io.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const running = active >= 0;

  return (
    <div
      ref={ref}
      className="flex flex-col items-stretch gap-0 md:flex-row md:items-center md:justify-center md:gap-0"
    >
      {STEPS.map((step, i) => {
        const isLast = i === STEPS.length - 1;
        // While the sequence runs it OWNS the highlight, so the static
        // emphasis does not sit lit alongside the travelling one.
        const lit = running ? active === i : EMPHASIS === i && !isLast;
        return (
          <div key={step.label} className="flex flex-col items-center md:flex-row">
            <div
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-xl border bg-card px-4 py-4 text-center shadow-sm transition-all duration-500 hover:-translate-y-0.5 hover:shadow-md md:w-36",
                lit && "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/20",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors duration-500",
                  isLast
                    ? "border-primary bg-primary text-primary-foreground"
                    : lit
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-primary/30 bg-primary/5 text-primary",
                )}
              >
                {isLast ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </span>
              <div>
                <p className="text-xs font-semibold leading-tight text-foreground sm:text-sm">{step.label}</p>
                {step.detail && (
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{step.detail}</p>
                )}
              </div>
            </div>
            {!isLast && (
              <>
                <ArrowDown className="my-1 h-4 w-4 shrink-0 text-primary/40 md:hidden" aria-hidden="true" />
                <ArrowRight className="mx-1 hidden h-4 w-4 shrink-0 text-primary/40 md:block" aria-hidden="true" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
