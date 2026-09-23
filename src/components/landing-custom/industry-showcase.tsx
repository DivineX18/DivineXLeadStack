"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * WHO THIS IS FOR, SHOWN RATHER THAN LISTED.
 *
 * The Ascend landing page named no industries at all — the only route to them
 * was the "Industries" nav item, so a visitor deciding whether this is built
 * for their kind of business had to leave the page to find out. This puts the
 * answer in front of them and rotates through it.
 *
 * THIRD IN THE PAGE'S MOTION HIERARCHY, behind the hero scan and the lifecycle
 * strip. Long interval, cross-fade only — nothing that slides, bounces, or
 * competes with the hero for attention.
 *
 * MANUAL SELECTION WINS. Pointing at or focusing a segment previews it and
 * stops the timer, so the rotation never pulls away from what someone is
 * reading. Clicking follows the existing /industries/:slug link untouched —
 * this is presentation over routing that already exists, and it changes
 * nothing about those pages, their metadata or their SEO.
 */

export interface ShowcaseIndustry {
  slug: string;
  name: string;
  heroSubtitle: string;
}

const ROTATE_MS = 3600;

export function IndustryShowcase({ industries }: { industries: ShowcaseIndustry[] }) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || industries.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((i) => (i + 1) % industries.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [held, industries.length]);

  const current = industries[active];
  if (!current) return null;

  return (
    <section className="border-t py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for businesses that sell by talking to people.
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            The constraint is rarely the same twice. Here is what it usually looks like in yours.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-5xl">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="relative aspect-[21/9] w-full bg-muted">
              {industries.map((ind, i) => (
                <img
                  key={ind.slug}
                  src={`/industries/${ind.slug}.jpg`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
                    i === active ? "opacity-100" : "opacity-0",
                  )}
                />
              ))}
              {/* Keeps the caption legible over any frame, rather than hoping
                  every photograph happens to be dark in the same corner. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
                <p className="text-lg font-semibold text-white md:text-xl">{current.name}</p>
                <p className="mt-1 max-w-2xl text-sm text-white/75 md:text-base">
                  {current.heroSubtitle}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {industries.map((ind, i) => (
              <Link
                key={ind.slug}
                href={`/industries/${ind.slug}`}
                onMouseEnter={() => { setActive(i); setHeld(true); }}
                onMouseLeave={() => setHeld(false)}
                onFocus={() => { setActive(i); setHeld(true); }}
                onBlur={() => setHeld(false)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all",
                  i === active
                    ? "border-primary/60 bg-primary/5 text-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="font-medium leading-tight">{ind.name}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
