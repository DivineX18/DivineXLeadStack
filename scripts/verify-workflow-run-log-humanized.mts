/**
 * Bitrupt QA — BUG-026, "Cryptic and Unactionable Error Triggered When
 * Saving Without Configured Email Automation" (High).
 *
 * Investigation (background agent, 2026-10-28) found the complaint's
 * premise was half right: saving/activating a workflow is never blocked by
 * missing email config -- `PATCH .../workflows/[workflowId]` only validates
 * node shape. The builder's PRE-FLIGHT warning (on the step itself, before
 * activation) was already excellent, clear, and actionable.
 *
 * The real defect was downstream, in the Runs tab: the engine's internal
 * log codes (e.g. the literal string "error:email_not_configured") were
 * rendered to the operator completely verbatim, with zero humanization --
 * right next to a feature (the builder's own warning) that proves the app
 * already knows how to phrase this well. Fix: a shared humanizeRunLog()
 * in lib/workflows/catalog.ts, reusing REQUIREMENT_WARNING's existing
 * copy for the "not configured" codes (also moved there, out of
 * workflow-builder.tsx, so the pre-flight warning and the post-hoc Runs
 * explanation can never drift apart), wired into workflow-runs.tsx.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 *
 * Run: npx tsx scripts/verify-workflow-run-log-humanized.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const catalog = read("src/lib/workflows/catalog.ts");
const builder = read("src/components/workflows/workflow-builder.tsx");
const runs = read("src/components/workflows/workflow-runs.tsx");

check("1. REQUIREMENT_WARNING now lives in the shared catalog (single source of truth)", /export const REQUIREMENT_WARNING: Record<NodeRequirement, string>/.test(catalog));
check("2. the builder no longer defines its own copy of it (would drift from the shared one)", !/const REQUIREMENT_WARNING: Record<string, string> = \{/.test(builder));
check("3. the builder imports the shared map instead", /REQUIREMENT_WARNING,?\n/.test(builder) && /from "@\/lib\/workflows\/catalog"/.test(builder));

check("4. humanizeRunLog is exported from the catalog", /export function humanizeRunLog\(log: string\): string/.test(catalog));
check(
  "5. the three 'not configured' codes reuse REQUIREMENT_WARNING's exact wording, not new copy",
  /"error:email_not_configured": REQUIREMENT_WARNING\.email/.test(catalog) &&
    /"error:sms_not_configured": REQUIREMENT_WARNING\.sms/.test(catalog) &&
    /"error:whatsapp_not_configured": REQUIREMENT_WARNING\.whatsapp/.test(catalog),
);
check("6. an unmapped error: code still gets de-sluggified rather than shown raw (no bare enum reaches the UI)", /log\.startsWith\("error:"\)\) return `Didn't run/.test(catalog));

check("7. workflow-runs.tsx imports humanizeRunLog", /import \{ NODE_LABELS, humanizeRunLog \} from "@\/lib\/workflows\/catalog"/.test(runs));
check("8. the history row renders the humanized text, not the raw h.result code directly", /\{humanizeRunLog\(h\.result\)\}/.test(runs) && !/\{h\.result\}/.test(runs));

// Direct execution against the real function — confirms the exact reported
// symptom ("error:email_not_configured" shown verbatim) is actually fixed,
// not just structurally plausible.
const mod = await import("../src/lib/workflows/catalog.ts");
check(
  "9. humanizeRunLog('error:email_not_configured') no longer returns the raw code",
  mod.humanizeRunLog("error:email_not_configured") !== "error:email_not_configured" &&
    /RESEND_API_KEY/.test(mod.humanizeRunLog("error:email_not_configured")),
);
check("10. humanizeRunLog('ok') reads as a plain human word", mod.humanizeRunLog("ok") === "Sent");
check(
  "11. a never-seen code still de-slugifies instead of leaking raw punctuation",
  !mod.humanizeRunLog("error:some_future_code").includes(":") && !mod.humanizeRunLog("error:some_future_code").includes("_"),
);

console.log(
  failures === 0
    ? `\nverify-workflow-run-log-humanized: all checks passed`
    : `\nverify-workflow-run-log-humanized: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
