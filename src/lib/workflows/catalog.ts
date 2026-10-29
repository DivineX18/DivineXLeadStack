import type {
  BuilderStep,
} from "@/lib/workflows/builder-tree";
import type {
  ConditionOp,
  WorkflowNodeType,
  WorkflowTriggerType,
} from "@/types/workflows";

export const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  "form.submitted": "Form submitted",
  "contact.created": "Contact created",
  "contact.tag.added": "Tag added to contact",
  "pipeline.stage.changed": "Pipeline stage changed",
  "booking.created": "Booking created",
  "quote.accepted": "Quote accepted",
  "quote.paid": "Quote/invoice paid",
  "onboarding.created": "Client onboarding started",
};

export const NODE_LABELS: Record<WorkflowNodeType, string> = {
  send_email: "Send email",
  send_sms: "Send SMS",
  whatsapp_template: "Send WhatsApp",
  wait: "Wait",
  wait_until: "Wait until event time",
  if_else: "If / else",
  goal: "End workflow",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  move_stage: "Move pipeline stage",
  update_field: "Update field",
  create_task: "Create task",
  create_deal: "Create opportunity",
  notify: "Internal notification",
  webhook: "Webhook",
};

/**
 * Integration a node needs to actually run. The builder flags nodes whose
 * requirement isn't configured (deployment env or, for SMS, a sub-account's
 * dedicated Twilio) so the operator sees a doomed step before activating.
 * Node types not listed have no external dependency.
 */
export type NodeRequirement = "email" | "sms" | "whatsapp";
export const NODE_REQUIREMENT: Partial<Record<WorkflowNodeType, NodeRequirement>> =
  {
    send_email: "email",
    notify: "email",
    send_sms: "sms",
    whatsapp_template: "whatsapp",
  };

/**
 * Pre-flight copy for a node whose requirement isn't configured yet. Shown
 * on the step itself in the builder, BEFORE activation. Also the source of
 * truth for humanizeRunLog() below, so the one-time warning the operator
 * sees while building and the after-the-fact explanation in Runs can never
 * say two different things about the same cause.
 */
export const REQUIREMENT_WARNING: Record<NodeRequirement, string> = {
  email:
    "Email isn't configured on this deployment, so this step will be skipped when the workflow runs. Add RESEND_API_KEY + EMAIL_FROM to fix it.",
  sms: "SMS can't run for this sub-account, so this step will be skipped. Give this sub-account a dedicated Twilio number in Settings → SMS, or have your agency enable the shared SMS sender. (See the sub/agency indicators below.)",
  whatsapp:
    "WhatsApp isn't ready for this sub-account, so this step will be skipped. It needs all three: your agency to enable WhatsApp, a WhatsApp sender configured in Settings → SMS, and at least one Meta-approved template.",
};

/**
 * BUG-026 (Bitrupt QA, 2026-10-28): the builder's own pre-flight warning
 * above is clear, but the Runs tab — where the operator actually looks
 * after a test run or a live enrollment to see what happened — rendered
 * the engine's raw internal log code verbatim (e.g. literally the text
 * "error:email_not_configured"), with zero humanization. The step ran, the
 * app knew exactly why it skipped, and the operator saw an unexplained
 * code where that explanation belonged.
 *
 * Reuses REQUIREMENT_WARNING's exact wording for the "not configured"
 * codes rather than writing new copy, so the two surfaces never drift.
 * Not every log code the engine can emit gets bespoke copy here — codes
 * outside this map (e.g. "ok", "tag+:vip") are either already
 * self-explanatory short labels or rare enough that a light generic
 * cleanup (replacing ":"/"_" and capitalizing) beats a hand-written line
 * per code. What matters for this bug is that the common, config-shaped
 * failures a non-technical operator will actually hit never show a bare
 * enum.
 */
const RUN_LOG_LABELS: Record<string, string> = {
  "error:email_not_configured": REQUIREMENT_WARNING.email,
  "error:sms_not_configured": REQUIREMENT_WARNING.sms,
  "error:whatsapp_not_configured": REQUIREMENT_WARNING.whatsapp,
  "skipped:opt_out": "Skipped — this contact has opted out of this channel.",
  "skipped:no_email": "Skipped — this contact has no email address on file.",
  "skipped:no_phone": "Skipped — this contact has no phone number on file.",
  "skipped:no_recipient": "Skipped — no recipient could be resolved for this step.",
  "skipped:no_template": "Skipped — no WhatsApp template is attached to this step yet.",
  "error:template_not_approved": "Didn't send — the WhatsApp template attached to this step isn't approved by Meta yet.",
  "skipped:no_tag": "Skipped — this step has no tag configured yet.",
  "skipped:no_stage": "Skipped — this step has no pipeline stage configured yet.",
  "skipped:no_field": "Skipped — this step has no field configured yet.",
  "skipped:field_not_writable": "Skipped — that field can't be updated by a workflow.",
  "skipped:bad_url": "Skipped — the webhook URL on this step isn't valid.",
  ok: "Sent",
};

/** Humanizes an engine run-log code for display in the Runs tab. */
export function humanizeRunLog(log: string): string {
  const known = RUN_LOG_LABELS[log];
  if (known) return known;
  if (log.startsWith("error:send_failed")) return "Didn't send — the provider rejected this message.";
  if (log.startsWith("error:")) return `Didn't run — ${log.slice("error:".length).replace(/[:_]/g, " ")}.`;
  if (log.startsWith("wait:")) return `Waiting ${log.slice("wait:".length)}`;
  // Fallback for anything not explicitly covered above (branch:/tag+:/
  // stage:/field:/deal_created:/webhook, etc.): these already read as short,
  // self-explanatory labels once de-slugged, so a generic cleanup is enough
  // rather than a hand-written line for every one.
  return log.replace(/[:_]/g, " ");
}

/** Step types offerable from the "add step" menu, in display order. */
export const ADDABLE_TYPES: WorkflowNodeType[] = [
  "send_email",
  "send_sms",
  "whatsapp_template",
  "wait",
  "wait_until",
  "add_tag",
  "remove_tag",
  "move_stage",
  "update_field",
  "create_task",
  "create_deal",
  "notify",
  "webhook",
  "if_else",
  "goal",
];

export const CONDITION_OPS: { value: ConditionOp; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "is_set", label: "is set" },
  { value: "not_set", label: "is empty" },
  { value: "has_tag", label: "has tag" },
  { value: "in_stage", label: "is in stage" },
  { value: "source_is", label: "source is" },
  { value: "greater_than", label: "is greater than" },
  { value: "less_than", label: "is less than" },
  { value: "lifecycle_state_is", label: "lifecycle state is (domain:state)" },
  { value: "lifecycle_state_in", label: "lifecycle state in (domain:a,b)" },
  { value: "lifecycle_state_not", label: "lifecycle state is not (domain:state)" },
];

export function defaultConfig(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case "send_email":
      return { subject: "", body: "" };
    case "send_sms":
      return { body: "" };
    case "whatsapp_template":
      return { templateId: "", manualValues: {} };
    case "wait":
      return { seconds: 86_400 };
    case "wait_until":
      return { anchorKind: "contact_event", offsetMinutes: -1440 };
    case "if_else":
      return { conditions: { all: [] } };
    case "add_tag":
    case "remove_tag":
      return { tag: "" };
    case "move_stage":
      return { stage: "new" };
    case "update_field":
      return { field: "", value: "" };
    case "create_task":
      return { title: "", dueInDays: 1 };
    case "create_deal":
      return { title: "", value: 0, currency: "usd", stageId: "new", priority: "medium" };
    case "notify":
      return { recipient: "owner", to: "", subject: "", body: "" };
    case "webhook":
      return { url: "" };
    default:
      return {};
  }
}

/** Short human summary shown on a collapsed step card. */
export function nodeSummary(step: BuilderStep): string {
  const c = step.config;
  switch (step.type) {
    case "send_email":
      return (c.subject as string) || "No subject yet";
    case "send_sms":
      return (c.body as string)?.slice(0, 60) || "No message yet";
    case "whatsapp_template":
      return (c.templateId as string) ? "WhatsApp template" : "Choose a template";
    case "wait": {
      const s = Number(c.seconds ?? 0);
      if (s % 86_400 === 0) return `Wait ${s / 86_400} day(s)`;
      if (s % 3_600 === 0) return `Wait ${s / 3_600} hour(s)`;
      return `Wait ${Math.round(s / 60)} min`;
    }
    case "if_else": {
      const n = ((c.conditions as { all?: unknown[] })?.all ?? []).length;
      return n ? `${n} condition(s)` : "No conditions yet";
    }
    case "add_tag":
    case "remove_tag":
      return (c.tag as string) || "No tag yet";
    case "move_stage":
      return `→ ${(c.stage as string) || "?"}`;
    case "update_field":
      return c.field ? `${c.field} = ${c.value ?? ""}` : "No field yet";
    case "create_task":
      return (c.title as string) || "Untitled task";
    case "create_deal":
      return (c.title as string) || "Untitled opportunity";
    case "notify":
      return (c.subject as string) || (c.to as string) || "Notification";
    case "webhook":
      return (c.url as string) || "No URL yet";
    case "goal":
      return "Ends the workflow here";
    default:
      return "";
  }
}
