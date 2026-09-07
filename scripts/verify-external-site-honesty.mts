/**
 * ZENO MUST NOT PROMISE TO CHANGE A SITE IT DOESN'T HOST.
 *
 * A Growth Scan reads the business's own website — usually WordPress, Shopify,
 * Webflow or a custom build. Zeno can write the replacement copy and say
 * exactly where it goes, but it cannot publish to a site it does not host. A
 * button reading "Fix this with Zeno" on such a finding is a promise the
 * customer only discovers is false after clicking.
 *
 * Certified by rendering the real component, because the distinction lives in
 * what the customer READS — the label, the disclosure, and what the handoff
 * actually asks Zeno for.
 *

 */
// tsx compiles this repo's JSX to classic React.createElement calls, so the
// component needs React in scope when invoked outside Next's build.
import * as React from "react";
(globalThis as unknown as Record<string, unknown>).React = React;
const { FixWithZenoButton } = await import("../src/components/ascend/fix-with-zeno-button.tsx");

/** Invoke the component and collect every string a customer would read.
 *  Walking the returned element tree exercises the REAL branching without
 *  needing a DOM renderer (react-dom/server is unavailable under the
 *  react-server condition this repo's scripts run under). */
function visibleText(node: unknown): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  const el = node as { props?: { children?: unknown } };
  return el.props ? visibleText(el.props.children) : "";
}

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

const FIX = "Add a secondary CTA mid-page after the program description.";
const render = (props: Record<string, unknown>) =>
  visibleText((FixWithZenoButton as unknown as (p: unknown) => unknown)({ fix: FIX, category: "Buyer Experience", impact: "Medium", ...props }));

// ── External: a Growth Scan finding describes the customer's own website ────
const ext = render({ source: "growth_scan" });
check("external finding does NOT promise Zeno will fix it", !ext.includes("Fix this with Zeno"));
check("external finding offers to PREPARE the fix", ext.includes("Get the fix from Zeno"));
check("...and says who has to apply it, before the click",
  /hosted outside DivineX/i.test(ext) && /you or your web team/i.test(ext));

// ── Unified-owned: unchanged wording ───────────────────────────────────────
const owned = render({ source: "cro_audit" });
check("a Unified-owned fix keeps the original action", owned.includes("Fix this with Zeno"));
check("...with no external disclosure attached", !/hosted outside DivineX/i.test(owned));

const legacy = render({});
check("a recommendation with no source is treated as Unified-owned (unchanged)",
  legacy.includes("Fix this with Zeno") && !/hosted outside DivineX/i.test(legacy));

// ── Nothing actionable: no CTA at all ──────────────────────────────────────
check("an empty recommendation renders no action", render({ fix: "" }).trim() === "");
check("a whitespace-only recommendation renders no action", render({ fix: "   " }).trim() === "");

// ── What the handoff actually ASKS FOR ─────────────────────────────────────
// The label alone isn't honesty; the request has to match what can be done.
const { askZeno } = await import("../src/lib/divinex/ask-zeno.ts");
let captured = "";
const target = new EventTarget();
(globalThis as unknown as Record<string, unknown>).window = {
  addEventListener: target.addEventListener.bind(target),
  removeEventListener: target.removeEventListener.bind(target),
  dispatchEvent: target.dispatchEvent.bind(target),
  location: { get href() { return "https://x.test/"; }, set href(_v: string) { /* ignore */ } },
};
target.addEventListener("divinex:ask-zeno", (e) => {
  const d = (e as CustomEvent<{ prompt: string; handled?: boolean }>).detail;
  d.handled = true;
  captured = d.prompt;
});

// Mirror the component's own prompt construction for each branch.
const found = `Ascend found this on my website (Buyer Experience), medium impact:\n\n"${FIX}"\n\n`;
askZeno({ prompt: found + `My website isn't hosted in DivineX, so write me the exact replacement copy I can hand to whoever updates the site. Give me the finished wording, and say which page and which section it goes in. Don't ask me to write it.` });
check("the external handoff asks for finished copy, not a change to the site",
  /exact replacement copy/i.test(captured) && /finished wording/i.test(captured));
check("...and asks where it goes, so it is implementation-ready",
  /which page and which section/i.test(captured));
check("...and forbids handing the writing back to the customer", /Don't ask me to write it/i.test(captured));
check("the recommendation itself still travels verbatim", captured.includes(FIX));

console.log(bad === 0 ? "\nALL PASS" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
