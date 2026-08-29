import type { Timestamp, FieldValue } from "firebase/firestore";
import type { DealPriority, PipelineStageId } from "./deals";

/**
 * Workflow Builder — the general automation engine that replaces the legacy
 * single-recipe `automations` engine. A workflow is a TRIGGER + a graph of
 * NODES (linear with if/else branches). A RUN is one contact's enrollment
 * walking that graph; the QStash step worker advances it node by node.
 */

export type WorkflowStatus = "draft" | "active" | "paused";

export type WorkflowTriggerType =
  | "contact.created"
  | "contact.tag.added"
  | "form.submitted"
  | "pipeline.stage.changed"
  | "booking.created"
  | "quote.accepted"
  | "quote.paid";

/* ------------------------------ Conditions ----------------------------- */

export type ConditionOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_set"
  | "not_set"
  | "has_tag"
  | "in_stage"
  | "source_is"
  // Numeric comparisons (Campaign Architect segmentation: "over $500k goes
  // to consulting"). Additive — string ops are untouched.
  | "greater_than"
  | "less_than"
  // Lifecycle State Engine (additive — tags/stage ops untouched). Value
  // format: "domain:state" (is/not) or "domain:stateA,stateB" (in); the
  // contact's LATEST lifecycle record in that domain is the authority.
  | "lifecycle_state_is"
  | "lifecycle_state_in"
  | "lifecycle_state_not";

export interface Condition {
  /** Contact field path (e.g. "email", "company", "customFields.x"). */
  field: string;
  op: ConditionOp;
  value?: string;
}

/** v1: a single AND list. OR/nested groups are a v2 add. */
export interface ConditionGroup {
  all: Condition[];
}

/* -------------------------------- Trigger ------------------------------ */

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  filters: ConditionGroup;
  /** Restrict `form.submitted` to one form. Null/absent = any form. */
  formId?: string | null;
  /** Restrict `pipeline.stage.changed` to one target stage. */
  toStage?: string | null;
}

/* --------------------------------- Nodes ------------------------------- */

export type WorkflowNodeType =
  | "wait_until"
  | "send_email"
  | "send_sms"
  | "whatsapp_template"
  | "wait"
  | "if_else"
  | "goal"
  | "add_tag"
  | "remove_tag"
  | "move_stage"
  | "update_field"
  | "create_task"
  | "create_deal"
  | "notify"
  | "webhook";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  /** Node-type-specific config (validated per type at execution). */
  config: Record<string, unknown>;
  /** Next node for a linear step. Null/absent ends the run. */
  next?: string | null;
  /** Branch targets for an `if_else` node. */
  branches?: { whenTrue: string | null; whenFalse: string | null };
}

export interface WorkflowDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  /** Entry node id. Null = empty workflow (won't enroll). */
  startNodeId: string | null;
  nodes: Record<string, WorkflowNode>;
  /** Automation Strategy Plan (Zeno-generated workflows) — the lifecycle
   *  reasoning this graph was composed from. See
   *  lib/workflows/compose-strategy.ts. Absent on hand-built workflows. */
  strategyPlan?: {
    conversionEvent: string;
    goalState: string;
    goalTag: string;
    handoffDays: number;
    cadenceRationale: string;
    synthesized?: boolean;
  };
  stats: { enrolled: number; completed: number };
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* --------------------------------- Runs -------------------------------- */

export type WorkflowRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "exited";

export interface WorkflowRunHistoryEntry {
  nodeId: string;
  type: WorkflowNodeType;
  at: Timestamp | FieldValue | null;
  /** "ok" | "skipped:<reason>" | "error:<msg>" | "branch:true|false". */
  result: string;
}

export interface WorkflowRunDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  workflowId: string;
  contactId: string;
  status: WorkflowRunStatus;
  currentNodeId: string | null;
  history: WorkflowRunHistoryEntry[];
  /** Trigger payload snapshot (e.g. { formId, dealId }). */
  context: Record<string, unknown>;
  qstashMessageId: string | null;
  enrolledAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* ------------------------ Node config (typed views) -------------------- */

export interface SendEmailConfig {
  subject: string;
  body: string;
}
export interface SendSmsConfig {
  body: string;
}
export interface WhatsappTemplateConfig {
  /** Approved WhatsApp template doc id (subAccounts/{id}/whatsappTemplates). */
  templateId: string;
  /**
   * Operator-set values for the template's MANUAL variables, keyed by position
   * (string keys for JSON). May contain merge tags; resolved at run time.
   * `merge_tag` variables auto-resolve from the contact and aren't stored here.
   */
  manualValues?: Record<string, string>;
}
export interface WaitConfig {
  seconds: number;
}
/** Event-anchored, self-correcting wait ("24h before the appointment",
 *  "1h before the webinar", "2h after it ends") — NOT a dumb duration. On
 *  every wake the executor re-reads the LIVE anchor, so a rescheduled
 *  appointment or an edited webinar date recalculates automatically; a
 *  cancelled/missing anchor routes down the whenFalse branch instead of
 *  firing a reminder for something that no longer exists. */
export interface WaitUntilConfig {
  /** "funnel_event" anchors to funnels/{funnelId}.eventStartAt (one shared
   *  time — a webinar); "contact_event" anchors to the CONTACT's next
   *  upcoming calendar event (their own appointment); "business_event"
   *  anchors to a named field on a business entity (v1: quote.sentAt). */
  anchorKind: "funnel_event" | "contact_event" | "business_event";
  /** Required for funnel_event. */
  funnelId?: string;
  /** business_event: which entity + doc field carries the anchor time. */
  entityType?: "quote";
  entityId?: string;
  /** Field to anchor on. contact_event: "startAt" (default) | "endAt" —
   *  "2h after the appointment ends" is endAt +120. business_event:
   *  e.g. "sentAt". funnel_event always reads eventStartAt. */
  anchorField?: string;
  /** Minutes relative to the anchor. Negative = before (-1440 = 24h
   *  before), positive = after (+120 = 2h after). */
  offsetMinutes: number;
  /** Roll the computed target FORWARD past weekends ("next business day
   *  after quote.sentAt" = offsetMinutes +1440 + businessDaysOnly), never
   *  a dumb +24h that lands on Saturday. */
  businessDaysOnly?: boolean;
  /** LIFECYCLE ELIGIBILITY: the anchored action only fires while the
   *  entity's CURRENT lifecycle state is one of these. A cancelled
   *  appointment must never receive a "see you tomorrow" reminder just
   *  because an old node is pending — ineligible routes whenFalse
   *  (skip/recovery), same as a missing anchor. */
  eligibility?: { domain: "appointment" | "webinar" | "lead"; states: string[] };
}

export interface IfElseConfig {
  conditions: ConditionGroup;
}
export interface TagConfig {
  tag: string;
}
export interface MoveStageConfig {
  stage: string;
}
export interface UpdateFieldConfig {
  field: string;
  value: string;
}
export interface CreateTaskConfig {
  title: string;
  dueInDays?: number;
}
export interface CreateDealConfig {
  /** Supports merge tags, same as CreateTaskConfig.title. */
  title: string;
  /** Dollars (not cents) — matches the Deal type's `value` field. */
  value?: number;
  currency?: string;
  stageId?: PipelineStageId;
  priority?: DealPriority;
}
/** Who an Internal notification step emails. Legacy configs predate this
 *  field — the engine treats a missing value like "custom" (use `to`, else
 *  fall back to the agency owner) for backward compatibility. */
export type NotifyRecipient = "owner" | "account_contact" | "custom";

export interface NotifyConfig {
  /** Recipient mode. Optional so pre-existing stored configs still parse. */
  recipient?: NotifyRecipient;
  /** Literal email — only used when `recipient` is "custom" (or absent). */
  to: string;
  subject: string;
  body: string;
}
export interface WebhookConfig {
  url: string;
}
