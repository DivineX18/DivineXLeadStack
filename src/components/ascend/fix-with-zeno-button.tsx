"use client";

import { Wand2 } from "lucide-react";
import { askZeno } from "@/lib/divinex/ask-zeno";

/**
 * The edge that was missing: a recommendation you can ACT on.
 *
 * HONEST ABOUT WHAT CAN ACTUALLY BE CHANGED. A Growth Scan reads the
 * business's own website, which usually lives outside Unified — WordPress,
 * Shopify, Webflow, a custom build. Zeno can write the replacement copy and say
 * exactly where it goes, but it cannot publish to a site it does not host, and
 * a button promising otherwise would be a lie the customer discovers only after
 * clicking.
 *
 * So the action reads differently by where the fix has to land, using the
 * `source` the recommendation already carries — no capability registry, no
 * integration detection, no new service. Scan-derived findings describe the
 * scanned site and are external by definition; anything Unified owns keeps the
 * original wording.
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
  source,
}: {
  fix: string;
  category?: string;
  impact?: string;
  /** Where the finding came from. "growth_scan" means it describes the
   *  business's own website, which Unified does not host. */
  source?: "growth_scan" | "cro_audit";
}) {
  // Nothing actionable, no action. Better silence than a button that leads
  // nowhere useful.
  if (!fix.trim()) return null;

  const external = source === "growth_scan";
  // The recommendation's own words, not a summary — Zeno should reason about
  // what Ascend actually found, and the customer should recognise it as the
  // thing they just read. What is ASKED FOR differs: for a page Unified hosts,
  // a change; for the customer's own website, the finished copy plus where it
  // goes, since applying it is their step.
  const found =
    `Ascend found this on my website${category ? ` (${category})` : ""}` +
    `${impact ? `, ${impact.toLowerCase()} impact` : ""}:\n\n"${fix}"\n\n`;
  const prompt = external
    ? found +
      `My website isn't hosted in DivineX, so write me the exact replacement copy I can hand to whoever updates the site. ` +
      `Give me the finished wording, and say which page and which section it goes in. Don't ask me to write it.`
    : found + `Help me fix it. Tell me what you'd change before you change anything.`;

  return (
    <>
      <button
        type="button"
        onClick={() => askZeno({ prompt })}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--dx-surface-3,rgba(127,127,127,0.12))]"
        style={{ color: "var(--dx-primary)" }}
      >
        <Wand2 className="h-3 w-3" />
        {external ? "Get the fix from Zeno" : "Fix this with Zeno"}
      </button>
      {external && (
        // Said before the click, not discovered after it.
        <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--dx-text-muted)" }}>
          Zeno writes the change. Your website is hosted outside DivineX, so you or your web team apply it.
        </p>
      )}
    </>
  );
}
