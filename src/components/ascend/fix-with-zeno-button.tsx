"use client";

import { Wand2 } from "lucide-react";
import { askZeno } from "@/lib/divinex/ask-zeno";

/**
 * The edge that was missing: a recommendation you can ACT on.
 *
 * Ascend already diagnosed the problem and Zeno can already fix it — but the
 * two were never connected, so the customer read an instruction and was left
 * to translate it into a request themselves. This carries the diagnosis across
 * verbatim, phrased as the customer would say it.
 *
 * Clicking OPENS and PRE-FILLS. It does not generate, change or spend
 * anything: declining is closing the panel, and the account is untouched.
 */
export function FixWithZenoButton({
  fix,
  category,
  impact,
}: {
  fix: string;
  category?: string;
  impact?: string;
}) {
  // The recommendation's own words, not a summary — Zeno should reason about
  // what Ascend actually found, and the customer should recognise it as the
  // thing they just read.
  const prompt =
    `Ascend found this on my site${category ? ` (${category})` : ""}` +
    `${impact ? `, ${impact.toLowerCase()} impact` : ""}:\n\n` +
    `"${fix}"\n\n` +
    `Help me fix it. Tell me what you'd change before you change anything.`;

  return (
    <button
      type="button"
      onClick={() => askZeno({ prompt })}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--dx-surface-3,rgba(127,127,127,0.12))]"
      style={{ color: "var(--dx-primary)" }}
    >
      <Wand2 className="h-3 w-3" />
      Fix this with Zeno
    </button>
  );
}
