"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: string;
}

/** Shared accordion UI — used by the homepage's short FAQ teaser and the dedicated /faq page's longer list, so the interaction pattern only lives once. */
export function FaqAccordion({ items, defaultOpenIndex = 0 }: { items: FaqItem[]; defaultOpenIndex?: number | null }) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpenIndex);

  return (
    <div className="mx-auto max-w-2xl divide-y">
      {items.map(({ question, answer }, index) => (
        <div key={question}>
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="flex w-full items-center justify-between py-5 text-left text-sm font-medium transition-colors hover:text-primary"
          >
            {question}
            <ChevronDown
              className={cn(
                "ml-4 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                openIndex === index && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "grid transition-all duration-200",
              openIndex === index ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
