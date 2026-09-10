"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  FileText,
  Mail,
  MousePointerClick,
  Search,
  Timer,
  UserPlus,
} from "lucide-react";
import { StepFlow } from "./step-flow";
import { cn } from "@/lib/utils";

/**
 * The three mechanism sections: find, create, follow up. One idea, one visual
 * and one takeaway each, in the order the product actually works.
 *
 * Product names appear here and not in the hero. By this point the visitor
 * knows what Ascend does, so "Zeno finds and creates, Flow captures and
 * follows up" reads as useful structure rather than homework.
 *
 * Every visual explains behaviour. None of them depict traffic arriving,
 * revenue, or a measured result, because none of those are things we can
 * honestly claim.
 */

/** Fires a one-shot reveal when the section scrolls into view. Reduced motion
 *  resolves immediately to the finished state, which is authored to stand on
 *  its own rather than being a lesser version of the animation. */
function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

const FINDINGS = [
  { label: "Your offer reads as a description, not a promise", flagged: true },
  { label: "No proof above the fold", flagged: true },
  { label: "Capture form asks for six fields", flagged: false },
  { label: "No follow-up after a form submission", flagged: false },
];

export function AscendFind() {
  const { ref, shown } = useRevealOnce<HTMLDivElement>();

  return (
    <section className="border-t py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="mx-auto max-w-lg lg:mx-0">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Find what&rsquo;s costing you leads.
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">
              Ascend reads your business the way a buyer would. It scores what&rsquo;s working, names
              the single biggest thing holding you back, and ranks what to fix first.
            </p>
            <p className="mt-4 text-muted-foreground">
              Every finding points at something real on your site. No generic advice.
            </p>
          </div>

          <div ref={ref} className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">yourbusiness.com</span>
            </div>

            <ul className="mt-5 space-y-2.5">
              {FINDINGS.map((f, i) => (
                <li
                  key={f.label}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 transition-all duration-500",
                    f.flagged ? "border-amber-500/30 bg-amber-500/5" : "bg-background",
                    shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
                  )}
                  style={{ transitionDelay: `${i * 140}ms` }}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      f.flagged ? "bg-amber-500" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="text-sm leading-relaxed">{f.label}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-muted-foreground/70">
              Example findings. Your scan reads your own site.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const ASSETS = [
  { icon: FileText, label: "Landing page" },
  { icon: Mail, label: "Email sequence" },
  { icon: UserPlus, label: "Capture form" },
];

export function AscendCreate() {
  const { ref, shown } = useRevealOnce<HTMLDivElement>();

  return (
    <section className="border-t bg-muted/20 py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div ref={ref} className="order-2 lg:order-1">
            <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Constraint
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">
                  Your offer reads as a description, not a promise.
                </p>
              </div>

              <ArrowRight
                className={cn(
                  "mx-auto hidden h-5 w-5 text-primary/50 transition-all duration-700 sm:block",
                  shown ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
                )}
                aria-hidden="true"
              />

              <div className="space-y-2">
                {ASSETS.map((a, i) => (
                  <div
                    key={a.label}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border bg-card p-3 shadow-sm transition-all duration-500",
                      shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
                    )}
                    style={{ transitionDelay: `${300 + i * 150}ms` }}
                  >
                    <a.icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-medium">{a.label}</span>
                    <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground/70">
              Drafted for review. Nothing publishes without you.
            </p>
          </div>

          <div className="order-1 mx-auto max-w-lg lg:order-2 lg:mx-0">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Then help create the fix.
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">
              Landing pages, funnels, emails, lead magnets, ads and documents. Written for your
              business, not filled in from a template.
            </p>
            <p className="mt-4 text-muted-foreground">
              You review everything before it goes anywhere.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const WORKFLOW = [
  { icon: MousePointerClick, label: "Form submitted", detail: "" },
  { icon: UserPlus, label: "Added to CRM", detail: "" },
  { icon: Mail, label: "Email sent", detail: "" },
  { icon: Timer, label: "Wait 2 days", detail: "" },
  { icon: Mail, label: "Follow up", detail: "" },
  { icon: CalendarCheck, label: "Booked", detail: "" },
];

export function AscendFollowUp() {
  return (
    <section className="border-t py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Nothing waits on someone remembering.
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            A form submission starts the sequence. The email goes out, the wait runs, the follow-up
            sends, the booking lands on the calendar.
          </p>
        </div>

        <div className="mt-14">
          <StepFlow steps={WORKFLOW} />
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-xl border bg-card p-5 text-center">
          <p className="text-sm font-medium">
            Ascend finds and creates. Flow captures and follows up.
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            One system, so the thing that spotted the problem is the thing that fixes it.
          </p>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-muted-foreground/70">
          Text messaging runs on your own Twilio account, which you connect in settings.
        </p>
      </div>
    </section>
  );
}
