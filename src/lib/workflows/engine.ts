import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendEmail, emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import {
  sendSmsForSubAccount,
  sendWhatsappTemplateForSubAccount,
  smsIsConfigured,
  subAccountTwilioIsConfigured,
  subAccountWhatsappIsConfigured,
} from "@/lib/comms/twilio";
import { agencyAllowsSharedSms } from "@/lib/agency/policy";
import { resolveTemplateVariables } from "@/lib/comms/whatsapp/resolve-template-variables";
import { createTaskServerSide } from "@/lib/server/tasks-service";
import {
  resolveMergeTags,
  type MergeTagSubject,
} from "@/lib/automations/merge-tags";
import { buildUnsubscribeUrl } from "@/lib/automations/unsubscribe-token";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { evalConditionGroup } from "./conditions";
import type { Contact } from "@/types/contacts";
import type { AgencyDoc, SubAccountDoc } from "@/types";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";
import { PIPELINE_STAGES, type DealPriority, type PipelineStageId } from "@/types/deals";
import type {
  CreateDealConfig,
  CreateTaskConfig,
  IfElseConfig,
  MoveStageConfig,
  NotifyConfig,
  SendEmailConfig,
  SendSmsConfig,
  TagConfig,
  WhatsappTemplateConfig,
  UpdateFieldConfig,
  WaitConfig,
  WebhookConfig,
  WorkflowDoc,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRunDoc,
  WorkflowRunHistoryEntry,
  WorkflowTriggerType,
} from "@/types/workflows";

const VALID_STAGE_IDS = PIPELINE_STAGES.map((s) => s.id);

const STEP_PATH = "/api/workflows/step";

/* --------------------------- Node executors ---------------------------- */

export type StepResult =
  | { kind: "next" }
  | { kind: "wait"; seconds: number }
  | { kind: "branch"; value: boolean }
  | { kind: "end" };

interface NodeContext {
  node: WorkflowNode;
  contact: Contact;
  subAccount: SubAccountDoc | null;
  owner: { displayName: string; email: string };
  subAccountId: string;
  agencyId: string;
  /** Workflow author — stamped on writes (tasks) for audit. */
  createdByUid: string;
  /**
   * The trigger context captured at enrollment (e.g. the submitted form's
   * answers under `formData`). Carried on the run doc; surfaced here so the
   * Webhook step can forward the form fields downstream.
   */
  triggerContext: Record<string, unknown>;
}

/** An executor returns the control-flow result + a short audit log string. */
type NodeExecutor = (
  ctx: NodeContext
) => Promise<{ result: StepResult; log: string }>;

function mergeSubject(
  ctx: NodeContext,
  unsubscribeLink: string
): MergeTagSubject {
  return {
    contact: {
      name: ctx.contact.name,
      email: ctx.contact.email,
      phone: ctx.contact.phone,
    },
    owner: ctx.owner,
    workspace: { name: ctx.subAccount?.name ?? "" },
    bookingLink: ctx.subAccount?.bookingLink ?? "",
    unsubscribeLink,
  };
}

/**
 * Split a resolved body into paragraph <p> tags. When `unsub` is given, a
 * paragraph that is JUST the unsubscribe token (the common case — every
 * seed template puts it on its own trailing line) renders as a small muted
 * footer with a top rule, instead of a bare link mid-paragraph; an inline
 * occurrence (atypical, but not unsupported) still gets a styled anchor.
 */
function bodyToHtml(
  resolved: string,
  unsub?: { token: string; href: string }
): string {
  const anchor = unsub
    ? `<a href="${unsub.href}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`
    : "";
  return resolved
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((raw) => {
      if (unsub && raw.trim() === unsub.token) {
        return `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">${anchor}</p>`;
      }
      const withLink = unsub ? raw.split(unsub.token).join(anchor) : raw;
      return `<p style="margin:0 0 16px;">${withLink.replace(/\r?\n/g, "<br>")}</p>`;
    })
    .join("");
}

/** Shared card wrapper for every workflow-sent email (customer sends AND
 *  internal notifications) — replaces the old bare-paragraph-on-white
 *  output with a bordered card + a light sender label, still simple/plain,
 *  no logo or imagery required. */
function wrapEmailHtml(senderName: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
${senderName ? `<p style="margin:0 0 20px;font-size:12px;font-weight:600;letter-spacing:0.04em;color:#6366f1;text-transform:uppercase;">${senderName}</p>` : ""}
<div style="font-size:15px;line-height:1.65;color:#1a1a1a;">${bodyHtml}</div>
</div>
</body></html>`;
}

const execSendEmail: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as SendEmailConfig;
  const contact = ctx.contact;
  if (contact.emailOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.email;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_email" };
  if (!emailIsConfigured()) {
    return { result: { kind: "next" }, log: "error:email_not_configured" };
  }

  const UNSUB_TOKEN = "@@UNSUBSCRIBE_LINK@@";
  const unsubscribeLink = buildUnsubscribeUrl(contact.id);
  const subject = resolveMergeTags(
    cfg.subject ?? "",
    mergeSubject(ctx, unsubscribeLink)
  );
  const text = resolveMergeTags(
    cfg.body ?? "",
    mergeSubject(ctx, unsubscribeLink)
  );
  const resolvedForHtml = resolveMergeTags(
    cfg.body ?? "",
    mergeSubject(ctx, UNSUB_TOKEN)
  );
  const html = wrapEmailHtml(
    ctx.subAccount?.name ?? "",
    bodyToHtml(resolvedForHtml, { token: UNSUB_TOKEN, href: unsubscribeLink })
  );

  try {
    await sendEmail({
      to,
      subject: subject || "(no subject)",
      text,
      html,
      replyTo: ctx.subAccount?.replyToEmail ?? undefined,
      from: tenantFrom(ctx.subAccount),
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch (err) {
    return {
      result: { kind: "next" },
      log: `error:${err instanceof Error ? err.message : "send_failed"}`,
    };
  }
};

const execSendSms: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as SendSmsConfig;
  const contact = ctx.contact;
  if (contact.smsOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.phone;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_phone" };
  // Send via the sub-account's dedicated Twilio when configured, else the
  // shared env creds — same resolution the contact-profile SMS uses. The shared
  // fallback only counts when the agency still permits it.
  const hasSms =
    subAccountTwilioIsConfigured(ctx.subAccount?.twilioConfig) ||
    (smsIsConfigured() &&
      (await agencyAllowsSharedSms(ctx.subAccount?.agencyId)));
  if (!hasSms) {
    return { result: { kind: "next" }, log: "error:sms_not_configured" };
  }
  const body = resolveMergeTags(cfg.body ?? "", mergeSubject(ctx, ""));
  try {
    await sendSmsForSubAccount({
      subAccountId: ctx.subAccountId,
      subAccount: ctx.subAccount,
      to,
      body,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch (err) {
    return {
      result: { kind: "next" },
      log: `error:${err instanceof Error ? err.message : "send_failed"}`,
    };
  }
};

const execWhatsappTemplate: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as WhatsappTemplateConfig;
  const contact = ctx.contact;
  if (contact.whatsappOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.phone;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_phone" };
  // Requires the agency WhatsApp gate AND a configured WhatsApp sender. The
  // builder surfaces this as a red node, but re-check here in case the gate
  // flipped off after the workflow was built.
  if (
    ctx.subAccount?.whatsappEnabledByAgency !== true ||
    !subAccountWhatsappIsConfigured(ctx.subAccount?.twilioConfig)
  ) {
    return { result: { kind: "next" }, log: "error:whatsapp_not_configured" };
  }
  if (!cfg.templateId)
    return { result: { kind: "next" }, log: "skipped:no_template" };

  const tplSnap = await getAdminDb()
    .doc(`subAccounts/${ctx.subAccountId}/whatsappTemplates/${cfg.templateId}`)
    .get();
  const tpl = tplSnap.exists ? (tplSnap.data() as WhatsappTemplateDoc) : null;
  if (!tpl || tpl.status !== "approved" || !tpl.contentSid) {
    // Template was deleted, never approved, or lost approval (paused/disabled).
    return { result: { kind: "next" }, log: "error:template_not_approved" };
  }

  const subject = mergeSubject(ctx, "");
  // Operator-set MANUAL variable values may contain merge tags — resolve them
  // against the contact before handing to the positional resolver.
  const manualValues: Record<number, string> = {};
  for (const [pos, val] of Object.entries(cfg.manualValues ?? {})) {
    manualValues[Number(pos)] = resolveMergeTags(val ?? "", subject);
  }
  const contentVariables = resolveTemplateVariables({
    variables: tpl.variables,
    subject,
    manualValues,
  });

  try {
    await sendWhatsappTemplateForSubAccount({
      subAccountId: ctx.subAccountId,
      subAccount: ctx.subAccount,
      to,
      contentSid: tpl.contentSid,
      contentVariables,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch (err) {
    return {
      result: { kind: "next" },
      log: `error:${err instanceof Error ? err.message : "send_failed"}`,
    };
  }
};

const execWait: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as WaitConfig;
  const seconds = Math.max(0, Math.floor(cfg.seconds ?? 0));
  return { result: { kind: "wait", seconds }, log: `wait:${seconds}s` };
};

const execIfElse: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as IfElseConfig;
  const pass = evalConditionGroup(cfg.conditions, ctx.contact);
  return { result: { kind: "branch", value: pass }, log: `branch:${pass}` };
};

const execGoal: NodeExecutor = async () => ({
  result: { kind: "end" },
  log: "goal",
});

const execAddTag: NodeExecutor = async (ctx) => {
  const tag = ((ctx.node.config as unknown as TagConfig).tag ?? "").trim();
  if (!tag) return { result: { kind: "next" }, log: "skipped:no_tag" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      tags: FieldValue.arrayUnion(tag),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `tag+:${tag}` };
};

const execRemoveTag: NodeExecutor = async (ctx) => {
  const tag = ((ctx.node.config as unknown as TagConfig).tag ?? "").trim();
  if (!tag) return { result: { kind: "next" }, log: "skipped:no_tag" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      tags: FieldValue.arrayRemove(tag),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `tag-:${tag}` };
};

const execMoveStage: NodeExecutor = async (ctx) => {
  const stage = (
    (ctx.node.config as unknown as MoveStageConfig).stage ?? ""
  ).trim();
  if (!stage) return { result: { kind: "next" }, log: "skipped:no_stage" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({ pipelineStage: stage, updatedAt: FieldValue.serverTimestamp() });
  return { result: { kind: "next" }, log: `stage:${stage}` };
};

// Only these top-level contact fields may be set by a workflow — prevents a
// crafted config from clobbering tenancy/system keys. customFields.* is open.
const WRITABLE_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "company",
  "source",
  "pipelineStage",
]);

const execUpdateField: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as UpdateFieldConfig;
  const field = (cfg.field ?? "").trim();
  if (!field) return { result: { kind: "next" }, log: "skipped:no_field" };
  if (!field.startsWith("customFields.") && !WRITABLE_FIELDS.has(field)) {
    return { result: { kind: "next" }, log: "skipped:field_not_writable" };
  }
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      [field]: cfg.value ?? "",
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `field:${field}` };
};

const execCreateTask: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CreateTaskConfig;
  const title =
    resolveMergeTags(cfg.title ?? "Follow up", mergeSubject(ctx, "")) ||
    "Follow up";
  const dueAt =
    cfg.dueInDays && cfg.dueInDays > 0
      ? new Date(Date.now() + cfg.dueInDays * 86_400_000)
      : null;
  await createTaskServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    createdByUid: ctx.createdByUid,
    mode: "live",
    title,
    notes: "Created by workflow",
    dueAt,
    contactId: ctx.contact.id,
    dealId: null,
    eventId: null,
  });
  return { result: { kind: "next" }, log: "task_created" };
};

const execCreateDeal: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CreateDealConfig;
  const title =
    resolveMergeTags(cfg.title ?? "New opportunity", mergeSubject(ctx, "")) ||
    "New opportunity";
  const stageId = VALID_STAGE_IDS.includes(cfg.stageId as PipelineStageId)
    ? (cfg.stageId as PipelineStageId)
    : "new";
  // Dynamic import (not a top-level one) deliberately: deals-service.ts
  // itself imports fireWorkflowTrigger from THIS module (to fire
  // pipeline.stage.changed / deal.won triggers on stage moves), so a
  // top-level import here would be circular. Both modules only touch each
  // other's exports inside async function bodies, never at module-eval
  // time, so resolving the import lazily at call time is safe and avoids
  // depending on bundler-specific circular-ESM behavior.
  const { createDealServerSide } = await import("@/lib/server/deals-service");
  await createDealServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    createdByUid: ctx.createdByUid,
    mode: "live",
    title,
    value: Math.max(0, Number(cfg.value ?? 0)),
    currency: cfg.currency || "usd",
    contactId: ctx.contact.id,
    stageId,
    priority: (cfg.priority as DealPriority) || "medium",
  });
  return { result: { kind: "next" }, log: `deal_created:${stageId}` };
};

/**
 * Resolve who an Internal notification emails. "account_contact" reads the
 * sub-account's primary contact (Settings → Admin → Account contact); a custom
 * email is used as typed. The agency owner is the ultimate fallback so a
 * notification is never silently dropped — including when "account_contact" is
 * chosen but that contact has no email set.
 */
function resolveNotifyTo(cfg: NotifyConfig, ctx: NodeContext): string {
  const owner = ctx.owner.email;
  switch (cfg.recipient) {
    case "owner":
      return owner;
    case "account_contact":
      return ctx.subAccount?.accountContact?.email?.trim() || owner;
    // "custom" and legacy (undefined) both use the typed email, else owner.
    default:
      return (cfg.to ?? "").trim() || owner;
  }
}

const execNotify: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as NotifyConfig;
  const to = resolveNotifyTo(cfg, ctx);
  if (!to) return { result: { kind: "next" }, log: "skipped:no_recipient" };
  if (!emailIsConfigured()) {
    return { result: { kind: "next" }, log: "error:email_not_configured" };
  }
  const subject = resolveMergeTags(
    cfg.subject ?? "Workflow notification",
    mergeSubject(ctx, "")
  );
  const text = resolveMergeTags(cfg.body ?? "", mergeSubject(ctx, ""));
  const html = wrapEmailHtml(ctx.subAccount?.name ?? "", bodyToHtml(text));
  try {
    await sendEmail({
      to,
      subject: subject || "Workflow notification",
      text,
      html,
      from: tenantFrom(ctx.subAccount),
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch (err) {
    return {
      result: { kind: "next" },
      log: `error:${err instanceof Error ? err.message : "send_failed"}`,
    };
  }
};

const execWebhook: NodeExecutor = async (ctx) => {
  const url = ((ctx.node.config as unknown as WebhookConfig).url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { result: { kind: "next" }, log: "skipped:bad_url" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  // The submitted form's answers (label → value), captured at enrollment.
  // Empty {} for triggers that don't carry a form (e.g. pipeline change, test).
  const tc = ctx.triggerContext ?? {};
  const formData =
    tc.formData && typeof tc.formData === "object"
      ? (tc.formData as Record<string, unknown>)
      : {};
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "workflow.webhook",
        contact: {
          id: ctx.contact.id,
          name: ctx.contact.name,
          email: ctx.contact.email,
          phone: ctx.contact.phone,
        },
        form: {
          id: typeof tc.formId === "string" ? tc.formId : null,
          name: typeof tc.formName === "string" ? tc.formName : null,
          fields: formData,
        },
      }),
      signal: controller.signal,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch (err) {
    return {
      result: { kind: "next" },
      log: `error:${err instanceof Error ? err.message : "webhook_failed"}`,
    };
  } finally {
    clearTimeout(timer);
  }
};

/** Unimplemented node types pass through (no stall) until their slice lands. */
const execPassThrough: NodeExecutor = async () => ({
  result: { kind: "next" },
  log: "unsupported_passthrough",
});

const REGISTRY: Partial<Record<WorkflowNodeType, NodeExecutor>> = {
  send_email: execSendEmail,
  send_sms: execSendSms,
  whatsapp_template: execWhatsappTemplate,
  wait: execWait,
  if_else: execIfElse,
  goal: execGoal,
  add_tag: execAddTag,
  remove_tag: execRemoveTag,
  move_stage: execMoveStage,
  update_field: execUpdateField,
  create_task: execCreateTask,
  create_deal: execCreateDeal,
  notify: execNotify,
  webhook: execWebhook,
};

/* ----------------------------- Dispatch -------------------------------- */

interface FireInput {
  subAccountId: string;
  agencyId: string;
  type: WorkflowTriggerType;
  contactId: string;
  context?: Record<string, unknown>;
}

/**
 * Find every ACTIVE workflow matching the trigger + filters and enroll the
 * contact. Server-only; never throws — a workflow problem must not break the
 * action that triggered it.
 */
export async function fireWorkflowTrigger(input: FireInput): Promise<void> {
  const db = getAdminDb();
  try {
    const subSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
    if (subSnap.data()?.automationsPaused === true) return;

    const matches = await db
      .collection("workflows")
      .where("subAccountId", "==", input.subAccountId)
      .where("status", "==", "active")
      .where("trigger.type", "==", input.type)
      .get();
    if (matches.empty) return;

    const contactSnap = await db.doc(`contacts/${input.contactId}`).get();
    if (!contactSnap.exists) return;
    const contact = {
      id: contactSnap.id,
      ...(contactSnap.data() as Omit<Contact, "id">),
    };

    for (const doc of matches.docs) {
      const wf = { id: doc.id, ...(doc.data() as Omit<WorkflowDoc, "id">) };
      if (!wf.startNodeId) continue;

      // Trigger-specific narrowing.
      if (
        wf.trigger.type === "form.submitted" &&
        wf.trigger.formId &&
        wf.trigger.formId !== input.context?.formId
      ) {
        continue;
      }
      if (
        wf.trigger.type === "pipeline.stage.changed" &&
        wf.trigger.toStage &&
        wf.trigger.toStage !== input.context?.toStage
      ) {
        continue;
      }
      if (!evalConditionGroup(wf.trigger.filters, contact)) continue;

      await enroll(wf, contact.id, input.context ?? {});
    }
  } catch (err) {
    console.error("[workflows] fireWorkflowTrigger failed", err);
  }
}

async function enroll(
  wf: WorkflowDoc,
  contactId: string,
  context: Record<string, unknown>
): Promise<void> {
  const db = getAdminDb();
  const runRef = db.collection("workflowRuns").doc();
  await runRef.set({
    id: runRef.id,
    subAccountId: wf.subAccountId,
    agencyId: wf.agencyId,
    workflowId: wf.id,
    contactId,
    status: "running",
    currentNodeId: wf.startNodeId,
    history: [],
    context,
    qstashMessageId: null,
    enrolledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db
    .doc(`workflows/${wf.id}`)
    .update({ "stats.enrolled": FieldValue.increment(1) })
    .catch(() => {});

  if (!qstashIsConfigured()) {
    await runRef.update({ status: "failed" });
    return;
  }
  await scheduleNode(runRef, wf.startNodeId!, 0);
}

/* ------------------------------ Run worker ----------------------------- */

async function scheduleNode(
  runRef: FirebaseFirestore.DocumentReference,
  nodeId: string,
  delaySeconds: number
): Promise<void> {
  const res = await publishCallback({
    pathname: STEP_PATH,
    body: { runId: runRef.id, nodeId },
    delaySeconds,
    deduplicationId: `wf_${runRef.id}_${nodeId}`,
  });
  if (!res) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  await runRef.update({
    currentNodeId: nodeId,
    status: delaySeconds > 0 ? "waiting" : "running",
    qstashMessageId: res.messageId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function completeRun(
  runRef: FirebaseFirestore.DocumentReference,
  workflowId: string
): Promise<void> {
  await runRef.update({
    status: "completed",
    currentNodeId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await getAdminDb()
    .doc(`workflows/${workflowId}`)
    .update({ "stats.completed": FieldValue.increment(1) })
    .catch(() => {});
}

/** Advance one node of a run. Idempotent on the run's history. */
export async function runStep(runId: string, nodeId: string): Promise<void> {
  const db = getAdminDb();
  const runRef = db.collection("workflowRuns").doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) return;
  const run = runSnap.data() as WorkflowRunDoc;

  if (run.status !== "running" && run.status !== "waiting") return;
  if (run.history.some((h) => h.nodeId === nodeId)) return; // QStash retry

  const wfSnap = await db.doc(`workflows/${run.workflowId}`).get();
  if (!wfSnap.exists) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const wf = wfSnap.data() as WorkflowDoc;
  // Test runs execute regardless of status so a draft can be dry-run; real
  // enrollments require the workflow to still be active.
  if (wf.status !== "active" && run.context?.test !== true) {
    await runRef.update({
      status: "exited",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const node = wf.nodes[nodeId];
  if (!node) {
    await completeRun(runRef, wf.id);
    return;
  }

  const contactSnap = await db.doc(`contacts/${run.contactId}`).get();
  if (!contactSnap.exists) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const contact = {
    id: contactSnap.id,
    ...(contactSnap.data() as Omit<Contact, "id">),
  };

  const [subSnap, agencySnap] = await Promise.all([
    db.doc(`subAccounts/${run.subAccountId}`).get(),
    db.doc(`agencies/${run.agencyId}`).get(),
  ]);
  const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const agency = agencySnap.exists ? (agencySnap.data() as AgencyDoc) : null;

  if (subAccount?.automationsPaused === true) {
    await runRef.update({
      status: "exited",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const owner = await loadOwner(agency);
  const exec = REGISTRY[node.type] ?? execPassThrough;
  const { result, log } = await exec({
    node,
    contact,
    subAccount,
    owner,
    subAccountId: run.subAccountId,
    agencyId: run.agencyId,
    createdByUid: wf.createdByUid,
    triggerContext: run.context ?? {},
  });

  const entry: WorkflowRunHistoryEntry = {
    nodeId,
    type: node.type,
    at: Timestamp.now(),
    result: log,
  };
  await runRef.update({
    history: FieldValue.arrayUnion(entry),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Advance control flow.
  let target: string | null = null;
  let delay = 0;
  if (result.kind === "end") {
    await completeRun(runRef, wf.id);
    return;
  } else if (result.kind === "branch") {
    const b = node.branches;
    target = (result.value ? b?.whenTrue : b?.whenFalse) ?? null;
  } else if (result.kind === "wait") {
    target = node.next ?? null;
    delay = result.seconds;
  } else {
    target = node.next ?? null;
  }

  if (!target) {
    await completeRun(runRef, wf.id);
    return;
  }
  await scheduleNode(runRef, target, delay);
}

/** Manually enroll one contact to dry-run a workflow (ignores trigger/filters;
 *  runs even on a draft via the `test` context flag). */
export async function enrollForTest(opts: {
  subAccountId: string;
  workflowId: string;
  contactId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getAdminDb();
  const wfSnap = await db.doc(`workflows/${opts.workflowId}`).get();
  if (!wfSnap.exists) return { ok: false, error: "Workflow not found" };
  const wf = { id: wfSnap.id, ...(wfSnap.data() as Omit<WorkflowDoc, "id">) };
  if (wf.subAccountId !== opts.subAccountId) {
    return { ok: false, error: "Workflow not found" };
  }
  if (!wf.startNodeId)
    return { ok: false, error: "Add at least one step first" };
  const cSnap = await db.doc(`contacts/${opts.contactId}`).get();
  if (!cSnap.exists || cSnap.data()!.subAccountId !== opts.subAccountId) {
    return { ok: false, error: "Contact not found" };
  }
  await enroll(wf, opts.contactId, { test: true });
  return { ok: true };
}

async function loadOwner(
  agency: AgencyDoc | null
): Promise<{ displayName: string; email: string }> {
  if (!agency?.ownerUid) return { displayName: "", email: "" };
  try {
    const snap = await getAdminDb().doc(`users/${agency.ownerUid}`).get();
    const d = snap.data();
    return {
      displayName: (d?.displayName as string) ?? "",
      email: (d?.email as string) ?? "",
    };
  } catch {
    return { displayName: "", email: "" };
  }
}
