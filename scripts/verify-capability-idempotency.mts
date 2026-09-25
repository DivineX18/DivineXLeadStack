/**
 * validate() must be idempotent, for every capability.
 *
 * The chat route puts validate's OUTPUT in the proposal; the confirm route
 * re-validates that same object before executing, deliberately, because the
 * client's payload is never trusted. So validate(validate(x).args) has to
 * succeed. apply_workflow_plan broke it by reading snake_case and returning
 * camelCase, which made the capability impossible to confirm: it could be
 * proposed forever and never run.
 *
 * This holds the property for the whole registry rather than the one that
 * broke. Capabilities whose schema cannot be synthesised into valid args are
 * reported, not silently counted as passing.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-capability-idempotency.mts
 */
import { AI_SUITE_CAPABILITIES } from "../src/lib/ai-suite/capabilities";

/** Build a plausible payload from a capability's own JSON schema. */
function synth(schema: any, depth = 0): any {
  if (!schema || depth > 4) return "x";
  const t = schema.type;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (t === "string") return "x";
  if (t === "number" || t === "integer") return 1;
  if (t === "boolean") return true;
  if (t === "array") return [synth(schema.items, depth + 1)];
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = synth(v, depth + 1);
    return out;
  }
  return "x";
}

let unsynth = 0;
const broken: string[] = [];
const ok: string[] = [];
for (const cap of AI_SUITE_CAPABILITIES) {
  if (cap.readonly) continue;
  let first: any;
  try { first = cap.validate(synth(cap.parameters)); } catch (e) { unsynth++; continue; }
  if (!first?.ok) { unsynth++; continue; }
  let second: any;
  try { second = cap.validate(first.args); } catch (e) { broken.push(`${cap.name} (threw: ${String(e).slice(0, 50)})`); continue; }
  if (!second?.ok) broken.push(`${cap.name} -> ${String(second?.error).slice(0, 70)}`);
  else ok.push(cap.name);
}
console.log(`idempotent: ${ok.length}   NOT idempotent: ${broken.length}   not synthesizable: ${unsynth}`);
for (const b of broken) console.log("  BROKEN  " + b);
if (ok.length === 0) {
  console.log("\nNo capability could be exercised, which is a broken harness, not a pass.");
  process.exit(1);
}
console.log(broken.length === 0 ? "\nALL PASS" : `\n${broken.length} FAILED`);
process.exit(broken.length ? 1 : 0);
