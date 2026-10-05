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
 * "Reported" used to mean a single count, and 29 capabilities sat inside it
 * unchecked. edit_workflow_steps was one of them: it read `operation` and
 * wrote `op`, so every confirm answered "that request is missing something I
 * need" and no automated check saw it. The unexercised ones are now NAMED,
 * and EXAMPLES below carries hand-written args for the ones whose schema a
 * generic synthesiser cannot satisfy (cross-field rules, real ids, enums
 * that imply other required fields).
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

/**
 * Hand-written valid args for capabilities the synthesiser cannot satisfy.
 * Several entries per capability where the operation enum changes which
 * other fields are required, because only one branch would otherwise run.
 */
const EXAMPLES: Record<string, Record<string, unknown>[]> = {
  edit_workflow_steps: [
    { workflow_id: "w1", operation: "set_wait", step_id: "s1", days: 1 },
    { workflow_id: "w1", operation: "insert_email", after_step_id: "s1", subject: "Hi", body: "Body" },
    { workflow_id: "w1", operation: "insert_wait", after_step_id: "s1", hours: 6 },
    { workflow_id: "w1", operation: "remove_step", step_id: "s1" },
  ],
  edit_funnel_structure: [
    { funnel_id: "f1", operation: "add_media_placeholder", section_id: "hero", brief: "A real photo of the team at work, natural light, on site." },
    { funnel_id: "f1", operation: "add_section", section_type: "faq", items: ["How long? | About an hour."], after_section_id: "hero" },
    { funnel_id: "f1", operation: "add_section", section_type: "cta_banner", headline: "Ready?", cta_label: "Book", cta_href: "/b/x/y" },
    { funnel_id: "f1", operation: "move_section", section_id: "s2", after_section_id: "hero" },
    { funnel_id: "f1", operation: "remove_section", section_id: "s2" },
  ],
  update_form: [
    { form_id: "fm1", add_question: { label: "Company", type: "company", after_question_id: "f_email" } },
    { form_id: "fm1", reorder_question_ids: ["a", "b"] },
    { form_id: "fm1", update_question: { field_id: "f1", label: "Your name" } },
    { form_id: "fm1", remove_question_id: "f1" },
  ],
  revise_workflow_email: [{ workflow_id: "w1", email_number: 2, body: "New body {{unsubscribeLink}}" }],
  edit_workflow_logic: [
    { workflow_id: "w1", operation: "set_trigger", trigger_type: "form.submitted", form_id: "fm1" },
    { workflow_id: "w1", operation: "set_trigger", trigger_type: "contact.created" },
    { workflow_id: "w1", operation: "set_trigger_filters", conditions: [{ field: "source", op: "source_is", value: "get-leads" }] },
    { workflow_id: "w1", operation: "set_trigger_filters", conditions: [] },
    { workflow_id: "w1", operation: "set_branch_conditions", step_id: "b1", conditions: [{ field: "tags", op: "has_tag", value: "quote" }] },
  ],
  update_booking_page: [
    { booking_page_id: "consult", duration_minutes: 45, buffer_minutes: 15 },
    { booking_page_id: "consult", add_question: { label: "What brings you in?", type: "textarea", required: true } },
    { booking_page_id: "consult", add_question: { label: "Budget?", type: "select", options: ["Under 5k", "Over 5k"] } },
    { booking_page_id: "consult", update_question: { question_id: "q_1", required: false } },
    { booking_page_id: "consult", remove_question_id: "q_1" },
    { booking_page_id: "consult", reorder_question_ids: ["q_1", "q_2"] },
    { booking_page_id: "consult", day: "monday", start_time: "09:00", end_time: "17:00" },
  ],
};

const unexercised: string[] = [];
let unsynth = 0;
const broken: string[] = [];
const ok: string[] = [];
for (const cap of AI_SUITE_CAPABILITIES) {
  if (cap.readonly) continue;
  const payloads = EXAMPLES[cap.name] ?? [synth(cap.parameters)];
  let exercised = false;
  for (const payload of payloads) {
    let first: any;
    try { first = cap.validate(payload); } catch { continue; }
    if (!first?.ok) continue;
    exercised = true;
    let second: any;
    try { second = cap.validate(first.args); } catch (e) {
      broken.push(`${cap.name} (threw: ${String(e).slice(0, 50)})`); continue;
    }
    if (!second?.ok) {
      broken.push(`${cap.name} [${String(payload.operation ?? Object.keys(payload)[1] ?? "")}] -> ${String(second?.error).slice(0, 70)}`);
    } else if (JSON.stringify(first.args) !== JSON.stringify(second.args)) {
      // Succeeding twice is not enough: the second pass must reach the SAME
      // args, or confirm executes something other than what was approved.
      broken.push(`${cap.name} [${String(payload.operation ?? "")}] -> re-validation changed the args`);
    }
  }
  if (exercised) ok.push(cap.name);
  else { unsynth++; unexercised.push(cap.name); }
}
console.log(`idempotent: ${ok.length}   NOT idempotent: ${broken.length}   not exercised: ${unsynth}`);
for (const b of broken) console.log("  BROKEN  " + b);
// Named, not just counted. A capability in this list is UNCHECKED, which is
// how the last one of these shipped. Add it to EXAMPLES when it matters.
for (const u of unexercised) console.log("  unchecked  " + u);
if (ok.length === 0) {
  console.log("\nNo capability could be exercised, which is a broken harness, not a pass.");
  process.exit(1);
}
console.log(broken.length === 0 ? "\nALL PASS" : `\n${broken.length} FAILED`);
process.exit(broken.length ? 1 : 0);
