"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "HOW IT HELPS", MADE SELECTABLE.
 *
 * It was four equal cards, which is a list wearing a grid's clothes: a reader
 * scanning it gets four titles and stops. Picking one and reading its answer
 * is the behaviour the section actually wants, so the titles become the
 * control and the body gets room to be read.
 *
 * DELIBERATELY NOT PAIRED TO THE PAIN POINTS ABOVE. There are three problems
 * and four capabilities, and no mapping between them exists in the data —
 * inventing one would put claims on the page that nobody wrote.
 *
 * No timer. This is a reading aid, not motion: the page's moving parts are the
 * hero and the industry rotation on the landing page, and an industry page is
 * somewhere a visitor has arrived deliberately to read.
 */
export function IndustryHelps({ items }: { items: { title: string; body: string }[] }) {
  const [active, setActive] = useState(0);
  const current = items[active];
  if (!current) return null;

  return (
    <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:gap-6">
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            aria-current={i === active}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition-all",
              i === active
                ? "border-primary/60 bg-primary/5 shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                i === active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {i === active && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className="font-medium leading-snug">{item.title}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-6 md:p-8">
        <h3 className="text-base font-semibold">{current.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">{current.body}</p>
      </div>
    </div>
  );
}
