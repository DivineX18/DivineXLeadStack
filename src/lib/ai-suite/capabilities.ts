import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { metaAppConfigured } from "@/lib/comms/meta";
import { GET_LEADS_PARKED } from "@/lib/get-leads/business-types";
import { generateSigningSecret } from "@/lib/api/webhooks/signing";
import {
  createSubscription,
  listSubscriptions,
} from "@/lib/firestore/webhook-subscriptions";
import { sendDirectTestDelivery } from "@/lib/webhooks/direct-test";
import {
  detectAutomationUrl,
  n8nProductionUrl,
  validateWebhookUrl,
} from "@/lib/webhooks/validate-url";
import {
  categoryOf,
  eventsAreSingleCategory,
} from "@/lib/webhooks/event-categories";
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@/types/webhooks";
import { createSubAccountForAgency } from "@/lib/server/sub-accounts-service";
import {
  createInviteServerSide,
  MemberAddBlockedError,
} from "@/lib/server/members-service";
import { createGroupServerSide } from "@/lib/server/community-service";
import {
  createCourseServerSide,
  createLessonServerSide,
  createSectionServerSide,
  updateLessonServerSide,
} from "@/lib/server/community-classroom-service";
import {
  createContactServerSide,
  updateContactServerSide,
} from "@/lib/server/contacts-service";
import {
  createDealServerSide,
  updateDealServerSide,
} from "@/lib/server/deals-service";
import {
  createTaskServerSide,
  setTaskCompletedServerSide,
} from "@/lib/server/tasks-service";
import { createEventServerSide } from "@/lib/server/events-service";
import { utcFromWallClock } from "@/lib/booking/availability";
import {
  getStage,
  PIPELINE_STAGES,
  type DealPriority,
  type PipelineStageId,
} from "@/types/deals";
import {
  createWorkflowServerSide,
  type WorkflowTemplate,
} from "@/lib/server/workflows-service";
import {
  createWebsiteForSubAccount,
  submitWebsiteBuildForSubAccount,
  WebsiteServiceError,
} from "@/lib/server/websites-service";
import { gitpageIsConfigured } from "@/lib/gitpage/client";
import { effectiveWebsiteCap } from "@/lib/website/limits";
import {
  createFunnelServerSide,
  getFunnel,
  listFunnels,
  updateFunnelServerSide,
  FunnelValidationError,
} from "@/lib/server/funnels-service";
import { scoreFunnelDesign } from "@/lib/design-intelligence/scoring";
import { reviewFunnelCopy, type FunnelCopyReview } from "@/lib/conversion/funnel-copy-review";
import type { FunnelSection, FunnelSectionType, HeroConfig, PhotoGalleryConfig, TicketTiersConfig } from "@/types/funnels";
import type { DesignPackId } from "@/lib/funnels/design-packs";
import { FUNNEL_FRAMEWORKS } from "@/lib/funnels/frameworks";
import {
  VISUAL_ARCHETYPE_IDS,
  VISUAL_ARCHETYPES,
  TYPOGRAPHY_PAIRINGS,
  resolveDesignStrategy,
  type VisualArchetype,
  type MediaStrategyId,
  type ColorMode,
  type TypographyPairingId,
  type HeroLayoutId,
  type AnimationLevel,
  type VisualDensity,
  type CtaStrategyId,
} from "@/lib/funnels/design-strategy";
import { createFormServerSide } from "@/lib/server/forms-service";
import {
  createMessageTemplateServerSide,
  MessageTemplateValidationError,
} from "@/lib/server/message-templates-service";
import { updateWorkflowServerSide } from "@/lib/server/workflows-service";
import {
  FirecrawlError,
  firecrawlIsConfigured,
  scrapeUrl,
} from "@/lib/firecrawl/client";
import {
  GITPAGE_COLOR_SCHEMES,
  GITPAGE_DESIGN_BUTTONS,
  GITPAGE_DESIGN_COLOR_PALETTES,
  GITPAGE_DESIGN_COMPONENTS,
  GITPAGE_DESIGN_CONTACT_FORM,
  GITPAGE_DESIGN_ICONS,
  GITPAGE_DESIGN_INTERACTIONS,
  GITPAGE_DESIGN_LAYOUT,
  GITPAGE_DESIGN_TYPOGRAPHY,
  GITPAGE_LANGUAGES,
} from "@/lib/website/gitpage-values";
import {
  blankBusinessDetails,
  blankVslConfig,
  blankWebsiteConfig,
  type Niche,
  type WebsiteConfig,
} from "@/types/website";
import type { AiSuiteLevel } from "@/types/ai-suite";

/**
 * The AI Suite capability registry — the ENTIRE set of things the assistant
 * can do. This list is the contract: the model can only ever invoke a
 * capability named here, every capability wraps an existing guarded write
 * path, and the confirm endpoint re-checks the caller's permission and
 * re-validates args before `execute` runs. Anything not in this registry is
 * impossible for the agent to do.
 *
 * Two classes of capability:
 *   - **writes** (default) — surfaced as a proposal the user must confirm
 *     before the confirm route executes them.
 *   - **lookups** (`readonly: true`) — non-destructive reads the chat route
 *     executes immediately (no confirm card) and feeds back to the model, so
 *     it can answer state questions and resolve names to ids before
 *     proposing a write. A lookup must never mutate anything.
 *
 * Adding a capability = one entry here (schema + validate + summarize +
 * execute) plus its required role. No other surface grants the agent power.
 */

/**
 * An execute-time failure whose message is safe (and useful) to show the
 * user verbatim — a gate that's off, a record that doesn't belong to this
 * tenant, etc. The confirm + chat routes surface `message` directly;
 * any other thrown error stays a generic "the action failed".
 */
export class CapabilityUserError extends Error {}

/** Role a capability requires. Enforced server-side in the confirm route. */
export type RequiredRole =
  | "agencyOwner"
  | "subAccountAdmin"
  | "subAccountMember";

/**
 * Everything a capability needs to run, resolved from the AUTHENTICATED
 * caller — never from anything the model produced. `subAccountId`/`agencyId`
 * come from the session, so the model cannot target a different tenant.
 */
export interface AiSuiteActionContext {
  uid: string;
  email: string;
  displayName: string;
  agencyId: string;
  subAccountId?: string;
  subAccountRole?: string;
}

export interface ExecuteResult {
  /** Human-readable confirmation appended to the chat (or, for readonly
   *  lookups, the tool result fed back to the model). */
  resultText: string;
  /** Optional pointer to the created resource, for the audit trail. */
  ref?: { kind: string; id: string };
  /**
   * Lookup-only: a same-origin destination the chat UI renders as an
   * "Open …" button (the chat route short-circuits with `resultText` as the
   * user-facing message). Built server-side from the caller's own
   * memberships — never from a model-composed URL.
   */
  navigate?: { href: string; label: string };
}

type ValidateResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

export interface AiSuiteCapability {
  name: string;
  level: AiSuiteLevel;
  requiredRole: RequiredRole;
  /** Read-only lookup — executes immediately in the chat route, no confirm
   *  card. MUST NOT mutate anything. Absent/false = confirm-gated write. */
  readonly?: boolean;
  /** Short human-readable menu line, used when the assistant answers
   *  "what can you do?" — plain language, no tool-name jargon. */
  menuLabel: string;
  /** Shown to the model as the tool description. */
  description: string;
  /** JSON Schema for the tool parameters (OpenAI/OpenRouter shape). */
  parameters: Record<string, unknown>;
  /** Re-validate + normalize args. Runs BEFORE proposing and again before
   *  executing — the model's output is never trusted directly. */
  validate: (raw: unknown) => ValidateResult;
  /** One-line human summary shown on the confirm card. */
  summarize: (args: Record<string, unknown>) => string;
  /** Perform the action via an existing service. */
  execute: (
    ctx: AiSuiteActionContext,
    args: Record<string, unknown>,
  ) => Promise<ExecuteResult>;
}

// ── validation helpers ───────────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(raw: unknown, key: string): string {
  const v = (raw as Record<string, unknown>)?.[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Some model responses write the literal two-character sequence "\n" as
 * TEXT inside a multi-paragraph string (rather than a real newline
 * character) — found live 2026-08-02: a generated confirmation email's
 * numbered list rendered as "...next:\n\n1. We'll review...\n2. We'll
 * reach out..." with the backslash-n visible as literal text in the send
 * dialog. This isn't something a tool description can reliably prevent —
 * it's a JSON-escaping slip on the model's side — so normalize
 * defensively wherever free text can contain intended line breaks. A
 * literal "\n"/"\r\n" substring has no legitimate reason to appear in
 * real prose, so this can't misfire on genuine content.
 */
function fixLiteralNewlines(text: string): string {
  return text.replace(/\\r\\n|\\n/g, "\n");
}

/**
 * Length-caps a single-line copy field WITHOUT cutting mid-word — found
 * live during the LC 1.0 launch-candidate review (2026-08-03): a plain
 * `.slice(0, 140)` on subheadline/cta_banner_subtext regularly produced
 * text ending mid-word ("...every morn", "...keep it go") whenever the
 * model's sentence ran a few characters past the cap, which reads as a
 * broken/buggy page rather than a design choice. Falls back to the hard
 * slice only if there's no whitespace to back off to at all (an
 * unrealistically long single "word"), so this can never silently return
 * an empty string.
 */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** Escape model/user-supplied text before it lands in a bodyHtml field. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → minimal safe HTML (paragraphs on blank lines). */
function textToBodyHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

const STAGE_IDS = PIPELINE_STAGES.map((s) => s.id);

function fmtMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US")}`;
}

const TIME_24H_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** The sub-account's IANA timezone, falling back to UTC. */
async function subAccountTimezone(subAccountId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const tz = snap.data()?.timezone;
  return typeof tz === "string" && tz ? tz : "UTC";
}

/** YYYY-MM-DD of an instant in a named timezone (en-CA renders ISO shape). */
function ymdInTz(instant: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Human date-time of an instant in a named timezone, for result text. */
function fmtInTz(instant: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

/** Firestore Timestamp / Date / null → Date | null. */
function toDate(raw: unknown): Date | null {
  if (raw instanceof Date) return raw;
  if (
    raw &&
    typeof (raw as { toDate?: unknown }).toDate === "function"
  ) {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Resolve contact display names for listing lines (id → name), anchored to
 * one sub-account. Contacts whose `subAccountId` doesn't match are silently
 * dropped — defense-in-depth so this helper stays safe even if a future
 * caller feeds it ids that didn't come from a tenant-scoped query (today's
 * callers pass ids off already-tenant-filtered task/event docs).
 */
async function contactNamesById(
  subAccountId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const db = getAdminDb();
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && !!id)),
  ].slice(0, 30);
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const snaps = await db.getAll(...unique.map((id) => db.doc(`contacts/${id}`)));
  for (const s of snaps) {
    if (
      s.exists &&
      s.data()?.subAccountId === subAccountId &&
      typeof s.data()?.name === "string"
    ) {
      names.set(s.id, s.data()!.name as string);
    }
  }
  return names;
}

const WORKFLOW_TEMPLATES: Record<WorkflowTemplate, string> = {
  blank: "Blank",
  "speed-to-lead": "Speed-to-Lead",
  "appointment-confirmation": "Appointment Confirmation",
  "lead-nurture": "Lead Nurture",
  "stage-change-followup": "Stage-Change Follow-up",
  "post-purchase-nurture": "Post-Purchase Nurture",
};

/**
 * Feature gates the assistant may flip, keyed by the friendly name the model
 * uses. Mirrors the agency feature-gates PATCH route — with one deliberate
 * omission: `emailDomainEnabled` is excluded because disabling it TEARS DOWN
 * the sub-account's live Resend sending domain; that destructive path stays
 * in the Manage dialog where its warning UI lives.
 */
const FEATURE_GATES: Record<
  string,
  { field: string; label: string; metaRequired?: boolean }
> = {
  "api-access": { field: "apiAccessEnabledByAgency", label: "Public API access" },
  broadcasts: { field: "broadcastsEnabledByAgency", label: "Broadcasts (bulk email)" },
  whatsapp: { field: "whatsappEnabledByAgency", label: "WhatsApp" },
  "outbound-voice": {
    field: "outboundVoiceEnabledByAgency",
    label: "Outbound Voice",
  },
  "meta-inbox": {
    field: "metaInboxEnabledByAgency",
    label: "Facebook + Instagram inbox",
    metaRequired: true,
  },
  "social-planner": {
    field: "socialPlannerEnabledByAgency",
    label: "Social Planner",
    metaRequired: true,
  },
  website: { field: "websiteEnabledByAgency", label: "Website builder" },
  community: { field: "communityEnabledByAgency", label: "Community & Courses" },
  "missed-call-text-back": {
    field: "missedCallTextBackEnabledByAgency",
    label: "Missed-Call Text-Back",
  },
  "ai-suite": { field: "aiSuiteEnabledByAgency", label: "AI Suite" },
  funnels: { field: "funnelsEnabledByAgency", label: "Funnels" },
  "custom-domains": {
    field: "customDomainsEnabledByAgency",
    label: "Custom domains",
  },
  "funnel-checkout": {
    field: "funnelCheckoutEnabledByAgency",
    label: "Funnel checkout (Stripe)",
  },
  // Unlike every other gate here, this one also feeds
  // evaluate-workspace-entitlements.ts's effectiveTier computation — it's
  // one of two conditions (alongside an active Ascend<->Flow workspace
  // mapping) required before a sub-account reaches full_ascend. Enabling
  // it here alone won't activate the Full Ascend shell without that
  // mapping already existing.
  "ascend-intelligence": {
    field: "ascendIntelligenceEnabledByAgency",
    label: "Ascend Intelligence (Full Ascend shell)",
  },
  // Get Leads is PARKED — while the flag is on the assistant can't flip (or
  // report) its gate, matching the hidden Manage-dialog toggle. When
  // un-parked, enabling doesn't require OUTSCRAPER_API_KEY to be set —
  // searches just 503 with a friendly message until the key exists.
  ...(GET_LEADS_PARKED
    ? {}
    : {
        "get-leads": {
          field: "getLeadsEnabledByAgency",
          label: "Get Leads (prospecting)",
        },
      }),
};

/** Enabled-gate labels for one sub-account doc (every gate is opt-in). */
function enabledGateLabels(data: Record<string, unknown>): string[] {
  return Object.entries(FEATURE_GATES)
    .filter(([, g]) => data[g.field] === true)
    .map(([, g]) => g.label);
}

// ── the registry ───────────────────────────────────────────────────────────
export const AI_SUITE_CAPABILITIES: AiSuiteCapability[] = [
  // ═══ Agency level ════════════════════════════════════════════════════════
  {
    name: "list_sub_accounts",
    level: "agency",
    requiredRole: "agencyOwner",
    readonly: true,
    menuLabel:
      "Look up your sub-accounts and which feature gates each has enabled",
    description:
      "List this agency's sub-accounts with their ids and which feature gates are enabled. Use it to answer questions about sub-accounts or gates, and ALWAYS use it to resolve a sub-account's name to its id before set_feature_gate.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "List the sub-accounts in this agency.",
    execute: async (ctx) => {
      const snap = await getAdminDb()
        .collection("subAccounts")
        .where("agencyId", "==", ctx.agencyId)
        .limit(50)
        .get();
      if (snap.empty) {
        return { resultText: "This agency has no sub-accounts yet." };
      }
      const lines = snap.docs.map((d) => {
        const data = d.data();
        const gates = enabledGateLabels(data);
        return `- ${data.name ?? "(unnamed)"} — id: ${d.id}${
          data.accountNumber ? `, account #${data.accountNumber}` : ""
        }. Enabled gates: ${gates.length ? gates.join(", ") : "none"}.`;
      });
      return {
        resultText: `Sub-accounts in this agency (${snap.size}):\n${lines.join("\n")}`,
      };
    },
  },
  {
    name: "sub_account_stats",
    level: "agency",
    requiredRole: "agencyOwner",
    readonly: true,
    menuLabel:
      "Get record counts (contacts, deals, tasks, events, quotes) for one sub-account",
    description:
      "Count the records inside one of your sub-accounts — contacts, deals, tasks, calendar events, and quotes. Use for questions like 'how many contacts does Acme have?'. Resolve the sub-account's id with list_sub_accounts first — never guess ids.",
    parameters: {
      type: "object",
      properties: {
        subAccountId: {
          type: "string",
          description: "The sub-account's id, exactly as returned by list_sub_accounts.",
        },
        subAccountName: {
          type: "string",
          description: "The sub-account's display name, for the reply.",
        },
      },
      required: ["subAccountId", "subAccountName"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const subAccountId = str(raw, "subAccountId");
      if (!subAccountId) {
        return {
          ok: false,
          error:
            "the sub-account id is required — I need to look it up first (list_sub_accounts)",
        };
      }
      return {
        ok: true,
        args: { subAccountId, subAccountName: str(raw, "subAccountName") },
      };
    },
    summarize: (args) => `Count records in “${args.subAccountName || args.subAccountId}”.`,
    execute: async (ctx, args) => {
      const db = getAdminDb();
      const targetId = args.subAccountId as string;
      const snap = await db.doc(`subAccounts/${targetId}`).get();
      // Re-anchor the model-supplied id to the caller's own agency.
      if (!snap.exists || snap.data()?.agencyId !== ctx.agencyId) {
        throw new CapabilityUserError("That sub-account wasn't found in this agency.");
      }
      const count = async (collection: string) =>
        (
          await db
            .collection(collection)
            .where("subAccountId", "==", targetId)
            .count()
            .get()
        ).data().count;
      const [contacts, deals, tasks, events, quotes] = await Promise.all([
        count("contacts"),
        count("deals"),
        count("tasks"),
        count("events"),
        count("quotes"),
      ]);
      const name = (snap.data()?.name as string) || targetId;
      return {
        resultText: `“${name}” record counts: ${contacts} contacts, ${deals} deals, ${tasks} tasks, ${events} calendar events, ${quotes} quotes.`,
      };
    },
  },
  {
    name: "set_feature_gate",
    level: "agency",
    requiredRole: "agencyOwner",
    menuLabel:
      "Enable or disable a feature (broadcasts, API access, WhatsApp, Community, …) for one of your sub-accounts",
    description:
      "Enable or disable one feature gate on one sub-account in this agency. Resolve the sub-account's id with list_sub_accounts first — never guess ids. The dedicated email sending domain gate can't be changed here (it has a destructive tear-down); point the user at the sub-account's Manage dialog for that one.",
    parameters: {
      type: "object",
      properties: {
        subAccountId: {
          type: "string",
          description:
            "The sub-account's id, exactly as returned by list_sub_accounts.",
        },
        subAccountName: {
          type: "string",
          description: "The sub-account's display name, for the confirmation card.",
        },
        gate: {
          type: "string",
          enum: Object.keys(FEATURE_GATES),
          description: "Which feature gate to change.",
        },
        enabled: {
          type: "boolean",
          description: "true to enable the feature, false to disable it.",
        },
      },
      required: ["subAccountId", "subAccountName", "gate", "enabled"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const subAccountId = str(raw, "subAccountId");
      if (!subAccountId) {
        return {
          ok: false,
          error:
            "the sub-account id is required — I need to look it up first (list_sub_accounts)",
        };
      }
      const gate = str(raw, "gate");
      const gateDef = FEATURE_GATES[gate];
      if (!gateDef) {
        return {
          ok: false,
          error: `pick a gate: ${Object.keys(FEATURE_GATES).join(", ")}`,
        };
      }
      const enabled = (raw as Record<string, unknown>)?.enabled;
      if (typeof enabled !== "boolean") {
        return {
          ok: false,
          error: "whether to enable or disable the feature is required",
        };
      }
      if (enabled && gateDef.metaRequired && !metaAppConfigured()) {
        return {
          ok: false,
          error:
            "Facebook/Instagram isn't configured on this deployment (META_APP_ID / META_APP_SECRET must be set before this gate can be enabled)",
        };
      }
      return {
        ok: true,
        args: {
          subAccountId,
          subAccountName: str(raw, "subAccountName"),
          gate,
          enabled,
        },
      };
    },
    summarize: (args) => {
      const g = FEATURE_GATES[args.gate as string];
      return `${args.enabled ? "Enable" : "Disable"} ${g?.label ?? args.gate} for “${
        args.subAccountName || args.subAccountId
      }”.`;
    },
    execute: async (ctx, args) => {
      const g = FEATURE_GATES[args.gate as string];
      const ref = getAdminDb().doc(`subAccounts/${args.subAccountId as string}`);
      const snap = await ref.get();
      // The id came from the model — re-anchor it to the caller's own agency
      // so a wrong/crafted id can never reach another tenant.
      if (!snap.exists || snap.data()?.agencyId !== ctx.agencyId) {
        throw new CapabilityUserError("That sub-account wasn't found in this agency.");
      }
      await ref.update({
        [g.field]: args.enabled,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const name = (snap.data()?.name as string) || (args.subAccountName as string);
      return {
        resultText: `${args.enabled ? "Enabled" : "Disabled"} ${g.label} for “${name}”. The change applies immediately.`,
        ref: { kind: "subAccount", id: snap.id },
      };
    },
  },
  {
    name: "create_sub_account",
    level: "agency",
    requiredRole: "agencyOwner",
    menuLabel: "Create a new sub-account (client workspace)",
    description:
      "Create a new sub-account (an isolated client workspace) in this agency. Use when the user asks to create/add/set up a new sub-account or client.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the new sub-account / client workspace.",
        },
        slug: {
          type: "string",
          description:
            "Optional URL slug — lowercase letters, numbers, and dashes only. Omit to auto-derive.",
        },
        timezone: {
          type: "string",
          description: "Optional IANA timezone, e.g. Australia/Sydney. Defaults to UTC.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const name = str(raw, "name");
      if (!name) return { ok: false, error: "a name for the sub-account is required" };
      const slug = str(raw, "slug").toLowerCase();
      if (slug && !SLUG_RE.test(slug)) {
        return {
          ok: false,
          error: "the slug may only contain lowercase letters, numbers, and dashes",
        };
      }
      const timezone = str(raw, "timezone") || "UTC";
      return { ok: true, args: { name, slug, timezone } };
    },
    summarize: (args) =>
      `Create a new sub-account named “${args.name}”${
        args.slug ? ` (slug: ${args.slug})` : ""
      }.`,
    execute: async (ctx, args) => {
      const res = await createSubAccountForAgency({
        agencyId: ctx.agencyId,
        uid: ctx.uid,
        email: ctx.email,
        displayName: ctx.displayName,
        name: args.name as string,
        slug: (args.slug as string) ?? "",
        timezone: (args.timezone as string) ?? "UTC",
        accountContact: null,
      });
      const billingNote =
        res.billingStatus === "pending" && res.checkoutUrl
          ? ` This agency's default plan was auto-assigned — the workspace is locked until the client pays: ${res.checkoutUrl}`
          : "";
      return {
        resultText: `Created sub-account “${res.name}” (#${res.accountNumber}). You'll find it under Agency → Sub-accounts.${billingNote}`,
        ref: { kind: "subAccount", id: res.subAccountId },
      };
    },
  },

  // ═══ Sub-account level ═══════════════════════════════════════════════════
  {
    name: "my_access",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Check which workspaces you can access and your role in each",
    description:
      "Look up which workspaces (sub-accounts) the signed-in user can access and their role in each, plus whether they have agency-level access. Use for questions like 'do I have access to X?', 'what workspaces can I switch to?', or anything about the user's own permissions. It only ever reflects the current user — it cannot look up anyone else, and it cannot change anything.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "Check your workspace access.",
    execute: async (ctx) => {
      // The caller's OWN membership index — the same list their workspace
      // switcher shows. Keyed by the session uid; the model has no way to
      // point this at another user.
      const snap = await getAdminDb()
        .collection(`userMemberships/${ctx.uid}/subAccounts`)
        .limit(100)
        .get();
      const isAgencyOwner = ctx.subAccountRole === "agencyOwner";
      const lines = snap.docs.map((d) => {
        const data = d.data();
        const marker = d.id === ctx.subAccountId ? " ← this workspace" : "";
        return `- ${data.name ?? d.id}${
          data.accountNumber ? ` (#${data.accountNumber})` : ""
        } — role: ${data.role ?? "member"}${marker}`;
      });
      const agencyLine = isAgencyOwner
        ? "The user is the AGENCY OWNER — full access to every sub-account in the agency (even any not listed above) plus the Agency area (feature gates, creating sub-accounts, agency settings)."
        : "The user does NOT have agency-level access. Only their agency owner can see agency-wide data (e.g. the full list or count of sub-accounts) or change feature gates. To reach another workspace not listed above, they'd need the agency owner to invite them.";
      return {
        resultText: `Workspaces this user can access (${snap.size}):\n${
          lines.length ? lines.join("\n") : "(none listed)"
        }\n\n${agencyLine}\n\nSwitching: the workspace picker in the top header moves between workspaces they belong to.`,
      };
    },
  },
  {
    name: "open_workspace",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Switch you to another workspace you belong to (via an open button)",
    description:
      "Give the user a button to open another workspace (sub-account) they already have access to — use when they ask to switch/go/move to a different workspace. This never grants access: it only resolves against workspaces the user is already a member of. You cannot switch them yourself; the button does it.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The target workspace's name (or #account-number) as the user said it.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const query = str(raw, "query");
      if (!query) return { ok: false, error: "which workspace to open is required" };
      return { ok: true, args: { query: query.slice(0, 120) } };
    },
    summarize: (args) => `Open the “${args.query}” workspace.`,
    execute: async (ctx, args) => {
      const q = (args.query as string).toLowerCase().replace(/^#/, "");
      // The caller's OWN membership index — a link can only ever be built to
      // a workspace they already belong to.
      const snap = await getAdminDb()
        .collection(`userMemberships/${ctx.uid}/subAccounts`)
        .limit(100)
        .get();
      const rows = snap.docs.map((d) => ({
        id: d.id,
        name: typeof d.data().name === "string" ? (d.data().name as string) : d.id,
        accountNumber: d.data().accountNumber as number | undefined,
      }));
      const matches = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.accountNumber != null && String(r.accountNumber) === q),
      );
      if (matches.length === 0) {
        return {
          resultText: `None of the workspaces the user can access match “${args.query}”. They can access: ${
            rows.map((r) => r.name).join(", ") || "(none)"
          }. If they need access to another workspace, their agency owner must invite them.`,
        };
      }
      if (matches.length > 1) {
        return {
          resultText: `Multiple accessible workspaces match “${args.query}”: ${matches
            .map((r) => `${r.name}${r.accountNumber ? ` (#${r.accountNumber})` : ""}`)
            .join(", ")}. Ask the user which one they mean.`,
        };
      }
      const target = matches[0];
      if (target.id === ctx.subAccountId) {
        return {
          resultText: `“${target.name}” is the workspace the user is already in — no switch needed.`,
        };
      }
      // This resultText is USER-facing: the chat route short-circuits on
      // `navigate` and shows it directly with the button.
      return {
        resultText: `You have access to “${target.name}” — click below to switch. You'll land in that workspace's own assistant, which only sees that client's data.`,
        navigate: {
          href: `/sa/${target.id}/ai-suite`,
          label: `Open ${target.name} →`,
        },
      };
    },
  },
  {
    name: "find_contacts",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Search this workspace's contacts (name, email, phone, company)",
    description:
      "Search this sub-account's contacts by name, email, phone, or company. Use it to answer 'do I have…' questions, to check for an existing contact before proposing create_contact (avoid duplicates), and to resolve a contact's id before linking a task to them.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name, email, phone, or company fragment to search for.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const query = str(raw, "query");
      if (!query) return { ok: false, error: "a search term is required" };
      return { ok: true, args: { query: query.slice(0, 120) } };
    },
    summarize: (args) => `Search contacts for “${args.query}”.`,
    execute: async (ctx, args) => {
      const q = (args.query as string).toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      const snap = await getAdminDb()
        .collection("contacts")
        .where("subAccountId", "==", ctx.subAccountId!)
        .limit(500)
        .get();
      const matches = snap.docs
        .filter((d) => {
          const data = d.data();
          const text = [data.name, data.email, data.company]
            .filter((v): v is string => typeof v === "string")
            .join(" ")
            .toLowerCase();
          if (text.includes(q)) return true;
          const phone =
            typeof data.phone === "string" ? data.phone.replace(/\D/g, "") : "";
          return qDigits.length >= 4 && phone.includes(qDigits);
        })
        .slice(0, 8);
      if (matches.length === 0) {
        return {
          resultText: `No contacts matched “${args.query}”${
            snap.size === 500 ? " (searched the 500 most recently indexed contacts)" : ""
          }.`,
        };
      }
      const lines = matches.map((d) => {
        const data = d.data();
        const bits = [
          data.email && `email: ${data.email}`,
          data.phone && `phone: ${data.phone}`,
          data.company && `company: ${data.company}`,
        ].filter(Boolean);
        return `- ${data.name ?? "(unnamed)"} — id: ${d.id}${
          bits.length ? ` (${bits.join(", ")})` : ""
        }`;
      });
      return {
        resultText: `Contacts matching “${args.query}” (${matches.length}):\n${lines.join("\n")}`,
      };
    },
  },
  {
    name: "workspace_stats",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel:
      "Get a workspace snapshot — pipeline by stage with values, contacts, open/overdue tasks, upcoming events",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    description:
      "Get a snapshot of this workspace: deal counts + values per pipeline stage, total contacts, open and overdue tasks, upcoming calendar events, and quotes. Use for questions like 'how's my pipeline?', 'how many leads do I have?', or 'what's overdue?'.",
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "Get a snapshot of this workspace.",
    execute: async (ctx) => {
      const db = getAdminDb();
      const said = ctx.subAccountId!;
      const now = new Date();

      const [contactsCount, quotesCount, upcomingEvents, dealsSnap, openTasksSnap] =
        await Promise.all([
          db.collection("contacts").where("subAccountId", "==", said).count().get(),
          db.collection("quotes").where("subAccountId", "==", said).count().get(),
          db
            .collection("events")
            .where("subAccountId", "==", said)
            .where("startAt", ">=", now)
            .count()
            .get(),
          db.collection("deals").where("subAccountId", "==", said).limit(1000).get(),
          db
            .collection("tasks")
            .where("subAccountId", "==", said)
            .where("completed", "==", false)
            .limit(500)
            .get(),
        ]);

      // Pipeline rollup in memory (bounded by the 1000-deal cap above).
      const byStage = new Map<string, { count: number; value: number }>();
      let currency = "USD";
      for (const d of dealsSnap.docs) {
        const data = d.data();
        const stage = (data.stageId as string) ?? "new";
        const row = byStage.get(stage) ?? { count: 0, value: 0 };
        row.count += 1;
        row.value += typeof data.value === "number" ? data.value : 0;
        byStage.set(stage, row);
        if (typeof data.currency === "string" && data.currency) currency = data.currency;
      }
      const stageLines = PIPELINE_STAGES.map((s) => {
        const row = byStage.get(s.id);
        return `  - ${s.label}: ${row?.count ?? 0}${
          row?.value ? ` (${fmtMoney(row.value, currency)})` : ""
        }`;
      });
      const openValue = PIPELINE_STAGES.filter(
        (s) => s.id !== "won" && s.id !== "lost",
      ).reduce((sum, s) => sum + (byStage.get(s.id)?.value ?? 0), 0);

      let overdue = 0;
      for (const t of openTasksSnap.docs) {
        const dueAt = t.data().dueAt;
        const due =
          dueAt && typeof dueAt.toDate === "function" ? (dueAt.toDate() as Date) : null;
        if (due && due < now) overdue += 1;
      }

      return {
        resultText: [
          `Workspace snapshot:`,
          `- Contacts: ${contactsCount.data().count}`,
          `- Pipeline (${dealsSnap.size} deals${
            dealsSnap.size === 1000 ? ", capped at 1000" : ""
          }, open value ${fmtMoney(openValue, currency)}):`,
          ...stageLines,
          `- Open tasks: ${openTasksSnap.size}${overdue ? ` (${overdue} overdue)` : ""}`,
          `- Upcoming calendar events: ${upcomingEvents.data().count}`,
          `- Quotes: ${quotesCount.data().count}`,
        ].join("\n"),
      };
    },
  },
  {
    name: "find_deals",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Search this workspace's deals (by title or pipeline stage)",
    description:
      "Search this sub-account's deals by title fragment and/or pipeline stage. Use to answer questions about deals and ALWAYS use it to resolve a deal's id before move_deal_stage — never guess ids.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional title fragment to match.",
        },
        stage: {
          type: "string",
          enum: STAGE_IDS,
          description: "Optional pipeline stage to filter by.",
        },
      },
      additionalProperties: false,
    },
    validate: (raw) => {
      const query = str(raw, "query").slice(0, 120);
      const stage = str(raw, "stage");
      if (stage && !STAGE_IDS.includes(stage as PipelineStageId)) {
        return { ok: false, error: `stage must be one of: ${STAGE_IDS.join(", ")}` };
      }
      if (!query && !stage) {
        return { ok: false, error: "a title fragment or a stage is required" };
      }
      return { ok: true, args: { query, stage } };
    },
    summarize: (args) =>
      `Search deals${args.query ? ` matching “${args.query}”` : ""}${
        args.stage ? ` in ${getStage(args.stage as PipelineStageId).label}` : ""
      }.`,
    execute: async (ctx, args) => {
      const q = ((args.query as string) || "").toLowerCase();
      const stage = (args.stage as string) || "";
      const snap = await getAdminDb()
        .collection("deals")
        .where("subAccountId", "==", ctx.subAccountId!)
        .limit(500)
        .get();
      const matches = snap.docs
        .filter((d) => {
          const data = d.data();
          if (stage && data.stageId !== stage) return false;
          if (q && !String(data.title ?? "").toLowerCase().includes(q)) return false;
          return true;
        })
        .slice(0, 10);
      if (matches.length === 0) {
        return { resultText: "No deals matched." };
      }
      const lines = matches.map((d) => {
        const data = d.data();
        return `- ${data.title} — id: ${d.id}, stage: ${
          getStage(data.stageId as PipelineStageId).label
        }, value: ${fmtMoney(
          typeof data.value === "number" ? data.value : 0,
          (data.currency as string) || "USD",
        )}, contactId: ${data.contactId ?? "none"}`;
      });
      return { resultText: `Deals (${matches.length}):\n${lines.join("\n")}` };
    },
  },
  {
    name: "create_deal",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Create a deal for a contact (title, value, pipeline stage)",
    description:
      "Create a deal on the pipeline for an existing contact. Resolve the contact's id with find_contacts first — never guess ids. Ask for the deal value if the user didn't give one.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Deal title, e.g. 'Kitchen renovation'." },
        value: { type: "number", description: "Deal value (0 if unknown)." },
        currency: {
          type: "string",
          description: "Optional 3-letter currency code. Defaults to USD.",
        },
        contactId: {
          type: "string",
          description: "The contact's id, exactly as returned by find_contacts.",
        },
        contactName: {
          type: "string",
          description: "The contact's name, for the confirmation card.",
        },
        stage: {
          type: "string",
          enum: STAGE_IDS,
          description: "Optional starting stage. Defaults to 'new'.",
        },
      },
      required: ["title", "value", "contactId", "contactName"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const title = str(raw, "title");
      if (!title) return { ok: false, error: "a deal title is required" };
      const rawValue = (raw as Record<string, unknown>)?.value;
      const value =
        typeof rawValue === "number"
          ? rawValue
          : typeof rawValue === "string"
            ? Number(rawValue)
            : NaN;
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
        return { ok: false, error: "the deal value must be a number (0 if unknown)" };
      }
      const contactId = str(raw, "contactId");
      if (!contactId) {
        return {
          ok: false,
          error: "the contact is required — I need to find them first (find_contacts)",
        };
      }
      const currency = (str(raw, "currency") || "USD").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return { ok: false, error: "the currency must be a 3-letter code like USD" };
      }
      const stage = str(raw, "stage") || "new";
      if (!STAGE_IDS.includes(stage as PipelineStageId)) {
        return { ok: false, error: `stage must be one of: ${STAGE_IDS.join(", ")}` };
      }
      return {
        ok: true,
        args: {
          title,
          value,
          currency,
          contactId,
          contactName: str(raw, "contactName"),
          stage,
        },
      };
    },
    summarize: (args) =>
      `Create a deal “${args.title}” (${fmtMoney(
        args.value as number,
        args.currency as string,
      )}) for ${args.contactName} in ${getStage(args.stage as PipelineStageId).label}.`,
    execute: async (ctx, args) => {
      // The contact id came from the model — verify it's in THIS workspace.
      const c = await getAdminDb().doc(`contacts/${args.contactId as string}`).get();
      if (!c.exists || c.data()?.subAccountId !== ctx.subAccountId) {
        throw new CapabilityUserError("That contact wasn't found in this workspace.");
      }
      const res = await createDealServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        createdByUid: ctx.uid,
        mode: "live",
        title: args.title as string,
        value: args.value as number,
        currency: args.currency as string,
        contactId: args.contactId as string,
        stageId: args.stage as PipelineStageId,
        priority: "medium" as DealPriority,
      });
      return {
        resultText: `Created the deal “${args.title}” (${fmtMoney(
          args.value as number,
          args.currency as string,
        )}) for ${args.contactName} in ${
          getStage(args.stage as PipelineStageId).label
        }. You'll see it on the Pipeline board.`,
        ref: { kind: "deal", id: res.id },
      };
    },
  },
  {
    name: "move_deal_stage",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Move a deal to another pipeline stage (including Won / Lost)",
    description:
      "Move an existing deal to a different pipeline stage. Resolve the deal's id with find_deals first — never guess ids. When moving to 'lost', ask the user for a short lost reason.",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "string",
          description: "The deal's id, exactly as returned by find_deals.",
        },
        dealTitle: {
          type: "string",
          description: "The deal's title, for the confirmation card.",
        },
        stage: {
          type: "string",
          enum: STAGE_IDS,
          description: "The stage to move the deal to.",
        },
        lostReason: {
          type: "string",
          description: "Short reason, only when moving to 'lost'.",
        },
      },
      required: ["dealId", "dealTitle", "stage"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const dealId = str(raw, "dealId");
      if (!dealId) {
        return {
          ok: false,
          error: "the deal id is required — I need to find it first (find_deals)",
        };
      }
      const stage = str(raw, "stage");
      if (!STAGE_IDS.includes(stage as PipelineStageId)) {
        return { ok: false, error: `stage must be one of: ${STAGE_IDS.join(", ")}` };
      }
      return {
        ok: true,
        args: {
          dealId,
          dealTitle: str(raw, "dealTitle"),
          stage,
          lostReason: str(raw, "lostReason").slice(0, 300),
        },
      };
    },
    summarize: (args) =>
      `Move the deal “${args.dealTitle || args.dealId}” to ${
        getStage(args.stage as PipelineStageId).label
      }${args.lostReason ? ` (reason: ${args.lostReason})` : ""}.`,
    execute: async (ctx, args) => {
      // The deal id came from the model — verify it's in THIS workspace.
      const snap = await getAdminDb().doc(`deals/${args.dealId as string}`).get();
      if (!snap.exists || snap.data()?.subAccountId !== ctx.subAccountId) {
        throw new CapabilityUserError("That deal wasn't found in this workspace.");
      }
      const stage = args.stage as PipelineStageId;
      await updateDealServerSide({
        dealId: snap.id,
        userId: ctx.uid,
        expectedSubAccountId: ctx.subAccountId!,
        patch: {
          stageId: stage,
          ...(stage === "lost"
            ? { lostReason: (args.lostReason as string) || null }
            : {}),
        },
      });
      const title = (snap.data()?.title as string) || (args.dealTitle as string);
      return {
        resultText: `Moved “${title}” to ${getStage(stage).label}.`,
        ref: { kind: "deal", id: snap.id },
      };
    },
  },
  {
    name: "update_deal",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Edit an existing deal's title, value, or priority",
    description:
      "Update an existing deal's title, value, currency, or priority. Resolve the deal's id with find_deals first — never guess ids. To move a deal to a different pipeline stage, use move_deal_stage instead — this tool does not change stage.",
    parameters: {
      type: "object",
      properties: {
        dealId: {
          type: "string",
          description: "The deal's id, exactly as returned by find_deals.",
        },
        dealTitle: {
          type: "string",
          description: "The deal's current title, for the confirmation card.",
        },
        title: { type: "string", description: "New title, if changing." },
        value: { type: "number", description: "New value, if changing." },
        currency: { type: "string", description: "New 3-letter currency code, if changing." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority, if changing." },
      },
      required: ["dealId", "dealTitle"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const dealId = str(raw, "dealId");
      if (!dealId) {
        return {
          ok: false,
          error: "the deal id is required — I need to find it first (find_deals)",
        };
      }
      const rawValue = (raw as Record<string, unknown>)?.value;
      let value: number | undefined;
      if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
        const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
          return { ok: false, error: "the deal value must be a non-negative number" };
        }
        value = n;
      }
      const currencyRaw = str(raw, "currency");
      const currency = currencyRaw ? currencyRaw.toUpperCase() : "";
      if (currency && !/^[A-Z]{3}$/.test(currency)) {
        return { ok: false, error: "the currency must be a 3-letter code like USD" };
      }
      const priorityRaw = str(raw, "priority");
      const priority = ["low", "medium", "high"].includes(priorityRaw) ? priorityRaw : "";
      return {
        ok: true,
        args: {
          dealId,
          dealTitle: str(raw, "dealTitle"),
          title: str(raw, "title"),
          value,
          currency,
          priority,
        },
      };
    },
    summarize: (args) => {
      const changes: string[] = [];
      if (args.title) changes.push(`title → "${args.title}"`);
      if (args.value !== undefined)
        changes.push(`value → ${fmtMoney(args.value as number, (args.currency as string) || "USD")}`);
      if (args.priority) changes.push(`priority → ${args.priority}`);
      return `Update “${args.dealTitle || args.dealId}”: ${changes.join(", ") || "no changes"}.`;
    },
    execute: async (ctx, args) => {
      const snap = await getAdminDb().doc(`deals/${args.dealId as string}`).get();
      if (!snap.exists || snap.data()?.subAccountId !== ctx.subAccountId) {
        throw new CapabilityUserError("That deal wasn't found in this workspace.");
      }
      const patch: Record<string, unknown> = {};
      if (args.title) patch.title = args.title;
      if (args.value !== undefined) patch.value = args.value;
      if (args.currency) patch.currency = args.currency;
      if (args.priority) patch.priority = args.priority as DealPriority;
      if (Object.keys(patch).length === 0) {
        return {
          resultText: `Nothing to change on “${args.dealTitle || args.dealId}”.`,
          ref: { kind: "deal", id: snap.id },
        };
      }
      await updateDealServerSide({
        dealId: snap.id,
        userId: ctx.uid,
        expectedSubAccountId: ctx.subAccountId!,
        patch,
      });
      const title = (snap.data()?.title as string) || (args.dealTitle as string);
      return {
        resultText: `Updated “${title}”. Open the deal in Pipeline to see the change.`,
        ref: { kind: "deal", id: snap.id },
      };
    },
  },
  {
    name: "list_webhooks",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    readonly: true,
    menuLabel: "List this workspace's outbound webhooks and their delivery status",
    description:
      "List this sub-account's outbound webhook subscriptions (URL, events, status, last delivery). Use to answer questions about existing webhooks and to check for duplicates before proposing create_webhook.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "List this workspace's webhooks.",
    execute: async (ctx) => {
      const docs = await listSubscriptions(ctx.subAccountId!);
      if (docs.length === 0) {
        return { resultText: "This workspace has no webhook subscriptions yet." };
      }
      const lines = docs.map((d) => {
        const events = d.events.length ? d.events.join(", ") : "all events";
        const last =
          d.lastDeliveryStatus != null
            ? `last delivery HTTP ${d.lastDeliveryStatus}`
            : "no deliveries yet";
        return `- ${d.url} — ${d.mode}, ${d.status}${
          d.pausedReason ? ` (${d.pausedReason})` : ""
        }. Events: ${events}. ${last}.${
          d.description ? ` Label: ${d.description}.` : ""
        }`;
      });
      return {
        resultText: `Webhook subscriptions (${docs.length}):\n${lines.join("\n")}`,
      };
    },
  },
  {
    name: "create_webhook",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel:
      "Set up an outbound webhook to n8n / Make / Zapier (with a live test to verify it)",
    description:
      "Create an outbound webhook subscription in this sub-account: events here get POSTed to the user's endpoint (n8n, Make, Zapier, custom). Gather two things conversationally before calling: (1) the trigger — which event(s), all from ONE category (contacts, deals, tasks & events, forms, quotes, bookings, AI agents, conversations); offer the closest event types when they describe a goal like 'when a new lead comes in' → contact.created. (2) the destination URL from their automation tool. n8n gotcha — n8n shows TWO URLs per webhook node: a Test URL containing /webhook-test/ (only works while the n8n editor is listening) and a Production URL containing /webhook/ (only works when the workflow is Active). If the user pastes a /webhook-test/ URL, point this out and ask whether they want the Production URL for a permanent hook (same address with /webhook/ instead) — only proceed with the test URL if they say they're just testing right now. After the user confirms, the webhook is created AND a signed test event is sent immediately to verify the endpoint is live.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The destination endpoint URL (e.g. an n8n/Make/Zapier webhook URL). Must be exactly what the user provided.",
        },
        events: {
          type: "array",
          items: { type: "string", enum: [...WEBHOOK_EVENT_TYPES] },
          description:
            "Event types to subscribe to — at least one, all from the same category.",
        },
        description: {
          type: "string",
          description: "Optional short label, e.g. 'n8n new-lead flow'.",
        },
        mode: {
          type: "string",
          enum: ["live", "test"],
          description:
            "Default 'live'. Only use 'test' if the user explicitly wants test-mode API traffic.",
        },
      },
      required: ["url", "events"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const urlCheck = validateWebhookUrl(str(raw, "url"));
      if (!urlCheck.ok) return { ok: false, error: urlCheck.error.toLowerCase().replace(/\.$/, "") };
      const rawEvents = (raw as Record<string, unknown>)?.events;
      const events = Array.isArray(rawEvents)
        ? rawEvents.filter((e): e is WebhookEventType =>
            (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e as string),
          )
        : [];
      if (events.length === 0) {
        return {
          ok: false,
          error: "at least one valid trigger event is required",
        };
      }
      if (!eventsAreSingleCategory(events)) {
        return {
          ok: false,
          error: `all events must be from one category (these span ${[
            ...new Set(events.map((e) => categoryOf(e))),
          ].join(" + ")}) — create one webhook per category`,
        };
      }
      const mode = str(raw, "mode") || "live";
      if (mode !== "live" && mode !== "test") {
        return { ok: false, error: "mode must be 'live' or 'test'" };
      }
      return {
        ok: true,
        args: {
          url: urlCheck.url,
          events,
          description: str(raw, "description").slice(0, 120),
          mode,
        },
      };
    },
    summarize: (args) => {
      const base = `Create a ${args.mode} webhook to ${args.url} for: ${(
        args.events as string[]
      ).join(", ")}. A test event will be sent to verify it.`;
      const info = detectAutomationUrl(args.url as string);
      return info.tool === "n8n" && info.n8nKind === "test"
        ? `${base} ⚠️ This is an n8n TEST URL — it only receives events while the n8n editor is listening. For an always-on hook, use the Production URL instead (same address with /webhook/ instead of /webhook-test/).`
        : base;
    },
    execute: async (ctx, args) => {
      // Same agency gate as the dashboard's webhook mint route — webhooks
      // are part of the public-API surface, so they share the kill switch.
      const subSnap = await getAdminDb()
        .doc(`subAccounts/${ctx.subAccountId!}`)
        .get();
      if (subSnap.data()?.apiAccessEnabledByAgency !== true) {
        throw new CapabilityUserError(
          "API access (which includes webhooks) is disabled for this workspace. Your agency owner can enable it from the agency's sub-account Manage dialog.",
        );
      }

      const signingSecret = generateSigningSecret();
      const doc = await createSubscription({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        mode: args.mode as "live" | "test",
        url: args.url as string,
        description: (args.description as string) || null,
        events: args.events as WebhookEventType[],
        signingSecret,
        createdByUid: ctx.uid,
      });

      // Liveness check: one synchronous signed test delivery, so the user
      // hears "created AND your endpoint answered" in one breath. The
      // messaging is tool-aware — n8n's test-vs-production URL trap is the
      // top real-world failure mode, so call it out specifically.
      const test = await sendDirectTestDelivery(doc);
      const urlInfo = detectAutomationUrl(doc.url);
      const isN8nTestUrl = urlInfo.tool === "n8n" && urlInfo.n8nKind === "test";
      let verification: string;
      if (test.ok) {
        verification = `✅ Verified live — a test “${test.type}” event was delivered and your endpoint responded ${test.httpStatus}.`;
        if (isN8nTestUrl) {
          verification += ` ⚠️ Heads-up: this is n8n's TEST URL, so it only responded because the n8n editor is listening right now. Once you stop listening, deliveries will silently fail. For a permanent hook: activate the workflow in n8n, then create a webhook to the Production URL (${n8nProductionUrl(
            doc.url,
          )}) and delete this one under Settings → Webhooks.`;
        }
      } else {
        verification = `⚠️ The webhook was created, but the test delivery failed (${
          test.error ?? `HTTP ${test.httpStatus}`
        }). Real events will still be attempted with retries.`;
        if (isN8nTestUrl) {
          verification += ` This is n8n's TEST URL — it only responds while the n8n editor is in “Listen for test event” mode. Click “Execute workflow” in n8n and send another test from Settings → Webhooks, or (better, for an always-on hook) use the Production URL instead: ${n8nProductionUrl(
            doc.url,
          )} — the workflow must be set to Active.`;
        } else if (urlInfo.tool === "n8n") {
          verification += ` This looks like an n8n Production URL — those only respond once the workflow's Active toggle is ON in n8n. Activate it, then send another test from Settings → Webhooks.`;
        } else {
          verification += ` Check the URL is correct and your workflow is listening, then send another test from Settings → Webhooks.`;
        }
      }

      return {
        resultText: `Created the webhook to ${doc.url} for ${(
          args.events as string[]
        ).join(", ")}.\n${verification}\nSigning secret (shown once — copy it now if you want to verify signatures; n8n/Make work fine without it): ${signingSecret}\nManage it anytime under Settings → Webhooks.`,
        ref: { kind: "webhookSubscription", id: doc.id },
      };
    },
  },
  {
    name: "create_community",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel:
      "Set up a new community with its first course and lesson (returns the live URLs)",
    description:
      "Set up a new community (a Skool-style group with a feed + classroom) in this sub-account, including its first course and first lesson, and return the live URLs. Gather conversationally before calling: the community's name, who can join (open, or approval-required), an optional one-line tagline, the first lesson's title, and optionally a YouTube/Vimeo video URL and/or lesson text. Everything is created PUBLISHED and live on confirm. Free-to-join communities only — for a paid community, point the user at Sidebar → Community (pricing needs PayPal setup).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The community's name." },
        tagline: {
          type: "string",
          description: "Optional one-line tagline shown on the community card.",
        },
        about: {
          type: "string",
          description: "Optional longer description for the About panel.",
        },
        joinPolicy: {
          type: "string",
          enum: ["open", "approval"],
          description:
            "'open' = anyone with the link joins instantly (default); 'approval' = join requests need admin approval.",
        },
        courseTitle: {
          type: "string",
          description: "Optional first-course title. Defaults to 'Getting started'.",
        },
        lessonTitle: {
          type: "string",
          description: "The first lesson's title.",
        },
        lessonVideoUrl: {
          type: "string",
          description: "Optional YouTube or Vimeo URL for the first lesson.",
        },
        lessonText: {
          type: "string",
          description: "Optional written content for the first lesson (plain text).",
        },
      },
      required: ["name", "lessonTitle"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const name = str(raw, "name");
      if (!name) return { ok: false, error: "a name for the community is required" };
      const lessonTitle = str(raw, "lessonTitle");
      if (!lessonTitle) {
        return { ok: false, error: "a title for the first lesson is required" };
      }
      const joinPolicy = str(raw, "joinPolicy") || "open";
      if (joinPolicy !== "open" && joinPolicy !== "approval") {
        return { ok: false, error: "the join policy must be 'open' or 'approval'" };
      }
      return {
        ok: true,
        args: {
          name,
          tagline: str(raw, "tagline"),
          about: str(raw, "about"),
          joinPolicy,
          courseTitle: str(raw, "courseTitle") || "Getting started",
          lessonTitle,
          lessonVideoUrl: str(raw, "lessonVideoUrl"),
          lessonText: str(raw, "lessonText").slice(0, 8000),
        },
      };
    },
    summarize: (args) =>
      `Create the community “${args.name}” (${
        args.joinPolicy === "approval" ? "join requests need approval" : "open to join"
      }, free) with a published “${args.courseTitle}” course and first lesson “${
        args.lessonTitle
      }”${args.lessonVideoUrl ? " (with video)" : ""} — live immediately.`,
    execute: async (ctx, args) => {
      const subSnap = await getAdminDb()
        .doc(`subAccounts/${ctx.subAccountId!}`)
        .get();
      if (subSnap.data()?.communityEnabledByAgency !== true) {
        throw new CapabilityUserError(
          "Community & Courses is disabled for this workspace. Your agency owner can enable it from the agency's sub-account Manage dialog.",
        );
      }

      // Group → course → section → lesson, all published so the URLs work
      // the moment the user clicks them.
      const group = await createGroupServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        createdByUid: ctx.uid,
        name: args.name as string,
        tagline: (args.tagline as string) || undefined,
        about: (args.about as string) || undefined,
        access: "free",
        joinPolicy: args.joinPolicy as "open" | "approval",
        status: "published",
      });
      const course = await createCourseServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        groupId: group.id,
        title: args.courseTitle as string,
        published: true,
      });
      const section = await createSectionServerSide({
        subAccountId: ctx.subAccountId!,
        groupId: group.id,
        courseId: course.id,
        title: "Getting started",
      });
      const lesson = await createLessonServerSide({
        subAccountId: ctx.subAccountId!,
        groupId: group.id,
        courseId: course.id,
        sectionId: section.id,
        title: args.lessonTitle as string,
      });
      const { videoError } = await updateLessonServerSide({
        subAccountId: ctx.subAccountId!,
        groupId: group.id,
        courseId: course.id,
        lessonId: lesson.id,
        patch: {
          published: true,
          videoUrl: (args.lessonVideoUrl as string) || null,
          bodyHtml: args.lessonText ? textToBodyHtml(args.lessonText as string) : "",
        },
      });

      const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const communityUrl = `${base}/c/${ctx.subAccountId}/${group.slug}/community`;
      const lessonUrl = `${base}/c/${ctx.subAccountId}/${group.slug}/classroom/${course.id}/${lesson.id}`;
      const videoNote = videoError
        ? " (⚠️ the video URL wasn't recognized — YouTube/Vimeo links only; add it in the classroom editor)"
        : args.lessonVideoUrl
          ? " with video"
          : "";
      return {
        resultText: `Your community “${group.name}” is live.\nCommunity feed: ${communityUrl}\nFirst lesson “${lesson.title}”${videoNote}: ${lessonUrl}\nMembers sign in via a magic link (tied to their contact record) — share the community URL to invite them${
          args.joinPolicy === "approval" ? "; join requests will wait for your approval" : ""
        }. Manage everything under Sidebar → Community.`,
        ref: { kind: "communityGroup", id: group.id },
      };
    },
  },
  {
    name: "create_workflow",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel: "Create an automation workflow from a starter template (as a draft)",
    description:
      "Create a new automation workflow (as a draft) from a starter template in this sub-account. Use when the user asks to create/build/add a workflow or automation.",
    parameters: {
      type: "object",
      properties: {
        template: {
          type: "string",
          enum: [
            "blank",
            "speed-to-lead",
            "appointment-confirmation",
            "lead-nurture",
            "stage-change-followup",
            "post-purchase-nurture",
          ],
          description:
            "Which starter to use. 'blank' for an empty workflow. Named templates: " +
            "'speed-to-lead' (form submitted -> instant SMS + email + notify), " +
            "'appointment-confirmation' (booking created -> confirm + prep task), " +
            "'lead-nurture' (form submitted -> multi-day email/SMS drip), " +
            "'stage-change-followup' (deal moves pipeline stage -> follow-up task), " +
            "'post-purchase-nurture' (a quote OR invoice is marked paid -> thank-you email, " +
            "a 2-day wait, a check-in email, notify the owner of the sale). Use " +
            "'post-purchase-nurture' whenever the user asks for something like a " +
            "thank-you, nurture, or follow-up sequence for after someone buys/pays " +
            "(including PayPal-paid invoices, which have no 'accepted' step of their own).",
        },
        name: {
          type: "string",
          description: "Optional name. Defaults to the template's name.",
        },
      },
      required: ["template"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const template = str(raw, "template");
      if (!(template in WORKFLOW_TEMPLATES)) {
        return {
          ok: false,
          error:
            "pick a template: blank, speed-to-lead, appointment-confirmation, lead-nurture, stage-change-followup, or post-purchase-nurture",
        };
      }
      const name = str(raw, "name");
      return { ok: true, args: { template, name } };
    },
    summarize: (args) => {
      const label = WORKFLOW_TEMPLATES[args.template as WorkflowTemplate];
      return `Create a “${label}” workflow (draft)${
        args.name ? ` named “${args.name}”` : ""
      }.`;
    },
    execute: async (ctx, args) => {
      const template = args.template as WorkflowTemplate;
      const label = WORKFLOW_TEMPLATES[template];
      const id = await createWorkflowServerSide({
        subAccountId: ctx.subAccountId!,
        createdByUid: ctx.uid,
        name: (args.name as string) || label,
        template,
      });
      return {
        resultText: `Created the “${label}” workflow as a draft. Open Workflows to review and publish it.`,
        ref: { kind: "workflow", id },
      };
    },
  },
  {
    name: "create_contact",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Add a new contact (with optional tags)",
    description:
      "Add a new contact to this sub-account. Use when the user asks to add/create a contact, lead, or person. Check for an existing contact with find_contacts first so you don't create a duplicate.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact's full name." },
        email: { type: "string", description: "Optional email address." },
        phone: { type: "string", description: "Optional phone number." },
        company: { type: "string", description: "Optional company name." },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags to apply, e.g. [\"vip\", \"referral\"].",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const name = str(raw, "name");
      if (!name) return { ok: false, error: "a contact name is required" };
      const email = str(raw, "email").toLowerCase();
      if (email && !EMAIL_RE.test(email)) {
        return { ok: false, error: "that email address doesn't look valid" };
      }
      const rawTags = (raw as Record<string, unknown>)?.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 10)
        : [];
      return {
        ok: true,
        args: {
          name,
          email,
          phone: str(raw, "phone"),
          company: str(raw, "company"),
          tags,
        },
      };
    },
    summarize: (args) => {
      const tags = args.tags as string[] | undefined;
      return `Add a new contact “${args.name}”${args.email ? ` (${args.email})` : ""}${
        tags && tags.length ? ` tagged ${tags.join(", ")}` : ""
      }.`;
    },
    execute: async (ctx, args) => {
      const res = await createContactServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        createdByUid: ctx.uid,
        mode: "live",
        name: args.name as string,
        email: (args.email as string) ?? "",
        phone: (args.phone as string) ?? "",
        company: (args.company as string) ?? "",
        address: "",
        source: "ai-suite",
        tags: (args.tags as string[]) ?? [],
      });
      return {
        resultText: `Added contact “${args.name}”. Open Contacts to see the full profile.`,
        ref: { kind: "contact", id: res.id },
      };
    },
  },
  {
    name: "update_contact",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Edit an existing contact's details or tags",
    description:
      "Update an existing contact's name, email, phone, company, or tags. Resolve the contact's id with find_contacts first — never guess ids. Only send the fields that are actually changing; omitted fields are left as-is. Setting tags REPLACES the full tag list — if the user says 'add a tag', combine it with the contact's existing tags from find_contacts rather than sending just the new one.",
    parameters: {
      type: "object",
      properties: {
        contactId: {
          type: "string",
          description: "The contact's id, exactly as returned by find_contacts.",
        },
        contactName: {
          type: "string",
          description: "The contact's current name, for the confirmation card.",
        },
        name: { type: "string", description: "New name, if changing." },
        email: { type: "string", description: "New email, if changing." },
        phone: { type: "string", description: "New phone, if changing." },
        company: { type: "string", description: "New company, if changing." },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Full replacement tag list, if changing tags at all.",
        },
      },
      required: ["contactId", "contactName"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const contactId = str(raw, "contactId");
      if (!contactId) {
        return {
          ok: false,
          error: "the contact id is required — I need to find it first (find_contacts)",
        };
      }
      const email = str(raw, "email").toLowerCase();
      if (email && !EMAIL_RE.test(email)) {
        return { ok: false, error: "that email address doesn't look valid" };
      }
      const rawTags = (raw as Record<string, unknown>)?.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 10)
        : undefined;
      return {
        ok: true,
        args: {
          contactId,
          contactName: str(raw, "contactName"),
          name: str(raw, "name"),
          email,
          phone: str(raw, "phone"),
          company: str(raw, "company"),
          tags,
        },
      };
    },
    summarize: (args) => {
      const changes: string[] = [];
      if (args.name) changes.push(`name → "${args.name}"`);
      if (args.email) changes.push(`email → ${args.email}`);
      if (args.phone) changes.push(`phone → ${args.phone}`);
      if (args.company) changes.push(`company → "${args.company}"`);
      if (args.tags) changes.push(`tags → ${(args.tags as string[]).join(", ") || "(none)"}`);
      return `Update “${args.contactName || args.contactId}”: ${changes.join(", ") || "no changes"}.`;
    },
    execute: async (ctx, args) => {
      // The contact id came from the model — verify it's in THIS workspace
      // before writing (same guard move_deal_stage uses for deals).
      const snap = await getAdminDb().doc(`contacts/${args.contactId as string}`).get();
      if (!snap.exists || snap.data()?.subAccountId !== ctx.subAccountId) {
        throw new CapabilityUserError("That contact wasn't found in this workspace.");
      }
      const patch: Record<string, unknown> = {};
      if (args.name) patch.name = args.name;
      if (args.email) patch.email = args.email;
      if (args.phone) patch.phone = args.phone;
      if (args.company) patch.company = args.company;
      if (args.tags !== undefined) patch.tags = args.tags;
      if (Object.keys(patch).length === 0) {
        return {
          resultText: `Nothing to change on “${args.contactName || args.contactId}”.`,
          ref: { kind: "contact", id: snap.id },
        };
      }
      await updateContactServerSide({ contactId: snap.id, patch });
      const title = (snap.data()?.name as string) || (args.contactName as string);
      return {
        resultText: `Updated “${title}”. Open the contact profile to see the change.`,
        ref: { kind: "contact", id: snap.id },
      };
    },
  },
  {
    name: "create_task",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Create a task, with an optional due date and linked contact",
    description:
      "Create a task (to-do) in this sub-account, optionally with a due date and linked to a contact. Use when the user asks to add/create a task or reminder. To link a contact, resolve their id with find_contacts first — never guess ids.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the task is." },
        notes: { type: "string", description: "Optional extra detail." },
        dueAt: {
          type: "string",
          description:
            "Optional due date as YYYY-MM-DD. Convert relative dates ('tomorrow', 'next Friday') using today's date from the system prompt.",
        },
        contactId: {
          type: "string",
          description:
            "Optional id of an existing contact to link, exactly as returned by find_contacts.",
        },
        contactName: {
          type: "string",
          description: "The linked contact's name (required when contactId is set).",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const title = str(raw, "title");
      if (!title) return { ok: false, error: "a task title is required" };
      const dueAt = str(raw, "dueAt");
      if (dueAt && (!ISO_DATE_RE.test(dueAt) || isNaN(Date.parse(dueAt)))) {
        return {
          ok: false,
          error: "the due date must be a valid ISO date like 2026-07-10",
        };
      }
      const contactId = str(raw, "contactId");
      return {
        ok: true,
        args: {
          title,
          notes: str(raw, "notes"),
          dueAt,
          contactId,
          contactName: str(raw, "contactName"),
        },
      };
    },
    summarize: (args) =>
      `Create a task “${args.title}”${args.dueAt ? ` due ${args.dueAt}` : ""}${
        args.contactName ? ` linked to ${args.contactName}` : ""
      }.`,
    execute: async (ctx, args) => {
      const contactId = (args.contactId as string) || null;
      if (contactId) {
        // The id came from the model — verify it's a real contact in THIS
        // sub-account before linking, so a wrong/crafted id can't attach the
        // task to another tenant's record.
        const c = await getAdminDb().doc(`contacts/${contactId}`).get();
        if (!c.exists || c.data()?.subAccountId !== ctx.subAccountId) {
          throw new CapabilityUserError(
            "The linked contact wasn't found in this workspace.",
          );
        }
      }
      const dueAtStr = (args.dueAt as string) || "";
      const res = await createTaskServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        createdByUid: ctx.uid,
        mode: "live",
        title: args.title as string,
        notes: (args.notes as string) ?? "",
        // Date-only input → midday UTC, so it lands on the right day in every
        // timezone the operator is likely working from.
        dueAt: dueAtStr ? new Date(`${dueAtStr}T12:00:00Z`) : null,
        contactId,
        dealId: null,
        eventId: null,
      });
      return {
        resultText: `Created task “${args.title}”${
          dueAtStr ? ` due ${dueAtStr}` : ""
        }${args.contactName ? ` linked to ${args.contactName}` : ""}. You'll find it under Tasks.`,
        ref: { kind: "task", id: res.id },
      };
    },
  },
  {
    name: "find_tasks",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "See your open tasks — today, overdue, or upcoming",
    description:
      "List this workspace's open (incomplete) tasks, filtered to today / overdue / upcoming, or everything open. Dates are evaluated in the workspace's timezone. Use for questions like 'what's on today?', 'anything overdue?', and ALWAYS use it to resolve a task's id before complete_task — never guess ids. For today's calendar, also call find_events.",
    parameters: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["today", "overdue", "upcoming", "all-open"],
          description:
            "'today' = due today; 'overdue' = past due; 'upcoming' = due later; 'all-open' (default) = every incomplete task, grouped.",
        },
      },
      additionalProperties: false,
    },
    validate: (raw) => {
      const filter = str(raw, "filter") || "all-open";
      if (!["today", "overdue", "upcoming", "all-open"].includes(filter)) {
        return {
          ok: false,
          error: "filter must be today, overdue, upcoming, or all-open",
        };
      }
      return { ok: true, args: { filter } };
    },
    summarize: (args) =>
      args.filter === "all-open"
        ? "List all open tasks."
        : `List ${args.filter} tasks.`,
    execute: async (ctx, args) => {
      const tz = await subAccountTimezone(ctx.subAccountId!);
      const today = ymdInTz(new Date(), tz);
      const snap = await getAdminDb()
        .collection("tasks")
        .where("subAccountId", "==", ctx.subAccountId!)
        .where("completed", "==", false)
        .limit(300)
        .get();

      type Row = {
        id: string;
        title: string;
        due: string | null; // YYYY-MM-DD in the workspace tz
        contactId: string | null;
      };
      const rows: Row[] = snap.docs.map((d) => {
        const data = d.data();
        const dueAt = toDate(data.dueAt);
        return {
          id: d.id,
          title: (data.title as string) ?? "(untitled)",
          due: dueAt ? ymdInTz(dueAt, tz) : null,
          contactId:
            typeof data.contactId === "string" ? data.contactId : null,
        };
      });

      const bucketOf = (r: Row) =>
        r.due === null
          ? "no-date"
          : r.due < today
            ? "overdue"
            : r.due === today
              ? "today"
              : "upcoming";
      const wanted =
        args.filter === "all-open"
          ? rows
          : rows.filter((r) => bucketOf(r) === args.filter);
      if (wanted.length === 0) {
        return {
          resultText:
            args.filter === "all-open"
              ? "No open tasks — all clear."
              : `No ${args.filter} tasks.`,
        };
      }

      // Oldest due date first; undated last.
      wanted.sort((a, b) =>
        (a.due ?? "9999-99-99") < (b.due ?? "9999-99-99") ? -1 : 1,
      );
      const shown = wanted.slice(0, 15);
      const names = await contactNamesById(
        ctx.subAccountId!,
        shown.map((r) => r.contactId),
      );
      const line = (r: Row) =>
        `- ${r.title} — id: ${r.id}${
          r.due
            ? `, due ${r.due}${bucketOf(r) === "overdue" ? " (OVERDUE)" : ""}`
            : ", no due date"
        }${
          r.contactId
            ? `, contact: ${names.get(r.contactId) ?? r.contactId}`
            : ""
        }`;

      let body: string;
      if (args.filter === "all-open") {
        const sections = (["overdue", "today", "upcoming", "no-date"] as const)
          .map((bucket) => {
            const items = shown.filter((r) => bucketOf(r) === bucket);
            if (!items.length) return null;
            const label = {
              overdue: "Overdue",
              today: "Due today",
              upcoming: "Upcoming",
              "no-date": "No due date",
            }[bucket];
            return `${label}:\n${items.map(line).join("\n")}`;
          })
          .filter(Boolean);
        body = sections.join("\n");
      } else {
        body = shown.map(line).join("\n");
      }
      const more =
        wanted.length > shown.length
          ? `\n(+${wanted.length - shown.length} more — see the Tasks page)`
          : "";
      return {
        resultText: `Open tasks (${wanted.length}, dates in ${tz}):\n${body}${more}`,
      };
    },
  },
  {
    name: "complete_task",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel: "Mark a task as done",
    description:
      "Mark one of this workspace's tasks as completed. Resolve the task's id with find_tasks first — never guess ids. This fires the same task.completed webhook + contact-timeline activity as ticking it off on the Tasks page.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task's id, exactly as returned by find_tasks.",
        },
        taskTitle: {
          type: "string",
          description: "The task's title, for the confirmation card.",
        },
      },
      required: ["taskId", "taskTitle"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const taskId = str(raw, "taskId");
      if (!taskId) {
        return {
          ok: false,
          error: "the task id is required — I need to find it first (find_tasks)",
        };
      }
      return { ok: true, args: { taskId, taskTitle: str(raw, "taskTitle") } };
    },
    summarize: (args) =>
      `Mark the task “${args.taskTitle || args.taskId}” as done.`,
    execute: async (ctx, args) => {
      // The id came from the model — verify it's in THIS workspace.
      const snap = await getAdminDb().doc(`tasks/${args.taskId as string}`).get();
      if (!snap.exists || snap.data()?.subAccountId !== ctx.subAccountId) {
        throw new CapabilityUserError("That task wasn't found in this workspace.");
      }
      const title = (snap.data()?.title as string) || (args.taskTitle as string);
      if (snap.data()?.completed === true) {
        return {
          resultText: `“${title}” is already marked done — nothing to change.`,
          ref: { kind: "task", id: snap.id },
        };
      }
      await setTaskCompletedServerSide({
        taskId: snap.id,
        completed: true,
        userId: ctx.uid,
        expectedSubAccountId: ctx.subAccountId!,
      });
      return {
        resultText: `Marked “${title}” as done.`,
        ref: { kind: "task", id: snap.id },
      };
    },
  },
  {
    name: "find_events",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "See what's on the calendar — today, this week, or upcoming",
    description:
      "List this workspace's upcoming calendar events (today / next 7 days / everything upcoming), in the workspace's timezone. Use for questions like 'what's on today?' or 'what does my week look like?'. Pair with find_tasks for a full daily agenda.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["today", "week", "all-upcoming"],
          description:
            "'today' = rest of today; 'week' (default) = the next 7 days; 'all-upcoming' = everything from now on.",
        },
      },
      additionalProperties: false,
    },
    validate: (raw) => {
      const range = str(raw, "range") || "week";
      if (!["today", "week", "all-upcoming"].includes(range)) {
        return { ok: false, error: "range must be today, week, or all-upcoming" };
      }
      return { ok: true, args: { range } };
    },
    summarize: (args) =>
      args.range === "today"
        ? "List today's calendar events."
        : args.range === "week"
          ? "List this week's calendar events."
          : "List all upcoming calendar events.",
    execute: async (ctx, args) => {
      const tz = await subAccountTimezone(ctx.subAccountId!);
      const now = new Date();
      // Window end: midnight (workspace tz) after today / after day 7.
      // Calendar day arithmetic runs through Date.UTC so month/year roll over.
      const [y, m, d] = ymdInTz(now, tz).split("-").map(Number);
      const endOf = (daysAhead: number) => {
        const rolled = new Date(Date.UTC(y, m - 1, d + daysAhead + 1));
        return utcFromWallClock(
          rolled.getUTCFullYear(),
          rolled.getUTCMonth() + 1,
          rolled.getUTCDate(),
          0,
          tz,
        );
      };
      const windowEnd =
        args.range === "today"
          ? endOf(0)
          : args.range === "week"
            ? endOf(6)
            : null;

      // Uses the existing events(subAccountId, startAt) composite index.
      let q = getAdminDb()
        .collection("events")
        .where("subAccountId", "==", ctx.subAccountId!)
        .where("startAt", ">=", now);
      if (windowEnd) q = q.where("startAt", "<", windowEnd);
      const snap = await q.orderBy("startAt", "asc").limit(50).get();

      const rows = snap.docs.filter((doc) => doc.data().status !== "cancelled");
      if (rows.length === 0) {
        return {
          resultText:
            args.range === "today"
              ? "Nothing (left) on the calendar today."
              : args.range === "week"
                ? "Nothing on the calendar in the next 7 days."
                : "No upcoming calendar events.",
        };
      }
      const shown = rows.slice(0, 15);
      const names = await contactNamesById(
        ctx.subAccountId!,
        shown.map((doc) =>
          typeof doc.data().contactId === "string"
            ? (doc.data().contactId as string)
            : null,
        ),
      );
      const lines = shown.map((doc) => {
        const data = doc.data();
        const startAt = toDate(data.startAt);
        const contactId =
          typeof data.contactId === "string" ? data.contactId : null;
        return `- ${data.title ?? "(untitled)"} — ${
          startAt ? fmtInTz(startAt, tz) : "(no time)"
        }${data.location ? `, at ${data.location}` : ""}${
          contactId ? `, contact: ${names.get(contactId) ?? contactId}` : ""
        }`;
      });
      const more =
        rows.length > shown.length
          ? `\n(+${rows.length - shown.length} more — see the Calendar page)`
          : "";
      return {
        resultText: `Upcoming events (${rows.length}, times in ${tz}):\n${lines.join("\n")}${more}`,
      };
    },
  },
  {
    name: "create_event",
    level: "sub-account",
    requiredRole: "subAccountMember",
    menuLabel:
      "Book a calendar event (date + time, optionally linked to a contact)",
    description:
      "Create a calendar event in this workspace. The date and time are interpreted in the WORKSPACE's timezone. Convert relative dates ('tomorrow', 'next Friday') using today's date from the system prompt, and ask for a time if the user didn't give one. To link a contact, resolve their id with find_contacts first — never guess ids.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the event is, e.g. 'Call with Jane'." },
        date: { type: "string", description: "Event date as YYYY-MM-DD." },
        time: {
          type: "string",
          description: "Start time as 24-hour HH:MM in the workspace timezone, e.g. 14:00.",
        },
        durationMinutes: {
          type: "number",
          description: "Optional length in minutes (5–480). Defaults to 60.",
        },
        contactId: {
          type: "string",
          description:
            "Optional id of an existing contact to link, exactly as returned by find_contacts.",
        },
        contactName: {
          type: "string",
          description: "The linked contact's name (required when contactId is set).",
        },
        location: { type: "string", description: "Optional location or meeting spot." },
        notes: { type: "string", description: "Optional extra detail." },
      },
      required: ["title", "date", "time"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const title = str(raw, "title");
      if (!title) return { ok: false, error: "an event title is required" };
      const date = str(raw, "date");
      if (!ISO_DATE_RE.test(date) || isNaN(Date.parse(date))) {
        return { ok: false, error: "the date must be a valid ISO date like 2026-07-10" };
      }
      const time = str(raw, "time");
      if (!TIME_24H_RE.test(time)) {
        return { ok: false, error: "the time must be 24-hour HH:MM, e.g. 14:00" };
      }
      const rawDuration = (raw as Record<string, unknown>)?.durationMinutes;
      const duration =
        rawDuration === undefined || rawDuration === null
          ? 60
          : typeof rawDuration === "number"
            ? rawDuration
            : Number(rawDuration);
      if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
        return { ok: false, error: "the duration must be between 5 and 480 minutes" };
      }
      return {
        ok: true,
        args: {
          title,
          date,
          time,
          durationMinutes: Math.round(duration),
          contactId: str(raw, "contactId"),
          contactName: str(raw, "contactName"),
          location: str(raw, "location").slice(0, 200),
          notes: str(raw, "notes").slice(0, 2000),
        },
      };
    },
    summarize: (args) =>
      `Create the event “${args.title}” on ${args.date} at ${args.time} (${args.durationMinutes} min, workspace time)${
        args.contactName ? ` with ${args.contactName}` : ""
      }.`,
    execute: async (ctx, args) => {
      const contactId = (args.contactId as string) || null;
      if (contactId) {
        // The id came from the model — verify it's in THIS workspace.
        const c = await getAdminDb().doc(`contacts/${contactId}`).get();
        if (!c.exists || c.data()?.subAccountId !== ctx.subAccountId) {
          throw new CapabilityUserError(
            "The linked contact wasn't found in this workspace.",
          );
        }
      }
      const tz = await subAccountTimezone(ctx.subAccountId!);
      const [y, m, d] = (args.date as string).split("-").map(Number);
      const [hh, mm] = (args.time as string).split(":").map(Number);
      const startAt = utcFromWallClock(y, m, d, hh * 60 + mm, tz);
      const endAt = new Date(
        startAt.getTime() + (args.durationMinutes as number) * 60_000,
      );
      const res = await createEventServerSide({
        subAccountId: ctx.subAccountId!,
        agencyId: ctx.agencyId,
        createdByUid: ctx.uid,
        mode: "live",
        title: args.title as string,
        startAt,
        endAt,
        contactId,
        location: (args.location as string) ?? "",
        notes: (args.notes as string) ?? "",
      });
      return {
        resultText: `Booked “${args.title}” for ${fmtInTz(startAt, tz)} (${tz}, ${args.durationMinutes} min)${
          args.contactName ? ` with ${args.contactName}` : ""
        }. You'll see it on the Calendar.`,
        ref: { kind: "event", id: res.id },
      };
    },
  },
  {
    name: "list_members",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    readonly: true,
    menuLabel: "List this workspace's members and pending invites",
    description:
      "List this sub-account's members (name, email, role, status) and any pending invites. Use to answer questions about who has access, and ALWAYS use it before invite_member to check the person isn't already a member or already invited.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "List this workspace's members and pending invites.",
    execute: async (ctx) => {
      const db = getAdminDb();
      const [membersSnap, invitesSnap] = await Promise.all([
        db
          .collection(`subAccounts/${ctx.subAccountId!}/subAccountMembers`)
          .limit(100)
          .get(),
        db
          .collection("invites")
          .where("subAccountId", "==", ctx.subAccountId!)
          .where("acceptedByUid", "==", null)
          .where("revokedAt", "==", null)
          .limit(50)
          .get(),
      ]);
      const memberLines = membersSnap.docs
        .filter((d) => d.data().status !== "removed")
        .map((d) => {
          const data = d.data();
          const who =
            (data.displayName as string) || (data.email as string) || d.id;
          const email =
            data.displayName && data.email ? ` (${data.email})` : "";
          return `- ${who}${email} — role: ${data.role ?? "member"}${
            data.status && data.status !== "active" ? `, ${data.status}` : ""
          }`;
        });
      const inviteLines = invitesSnap.docs.map((d) => {
        const data = d.data();
        return `- ${data.email} — invited as ${
          data.subAccountRole ?? "collaborator"
        }, pending (hasn't signed up yet)`;
      });
      return {
        resultText: [
          `Members (${memberLines.length}):`,
          memberLines.length ? memberLines.join("\n") : "(none)",
          "",
          `Pending invites (${inviteLines.length}):`,
          inviteLines.length
            ? inviteLines.join("\n")
            : "(none)",
        ].join("\n"),
      };
    },
  },
  {
    name: "invite_member",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel:
      "Invite someone to this workspace by email (as admin or collaborator)",
    description:
      "Add someone (by email) to this sub-account as 'admin' (manages members + settings) or 'collaborator' (works the data, no member management). If the email is NEW, they get an email with a signup link and the invite stays pending until they sign up. If the email ALREADY has an account, they're added to this workspace directly (nothing to accept) and emailed a notification — this is how someone already in another sub-account gets added here. Re-adding an existing member just updates their role. Ask which role the user wants if they didn't say; default to collaborator when they just say 'invite'.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The invitee's email address.",
        },
        role: {
          type: "string",
          enum: ["admin", "collaborator"],
          description:
            "'admin' manages members + settings; 'collaborator' works the data only.",
        },
      },
      required: ["email", "role"],
      additionalProperties: false,
    },
    validate: (raw) => {
      const email = str(raw, "email").toLowerCase();
      if (!email || !EMAIL_RE.test(email)) {
        return { ok: false, error: "a valid email address is required" };
      }
      const role = str(raw, "role");
      if (role !== "admin" && role !== "collaborator") {
        return { ok: false, error: "the role must be 'admin' or 'collaborator'" };
      }
      return { ok: true, args: { email, role } };
    },
    summarize: (args) =>
      `Invite ${args.email} to this workspace as ${
        args.role === "admin" ? "an admin" : "a collaborator"
      } (they'll get a signup email).`,
    execute: async (ctx, args) => {
      let res;
      try {
        res = await createInviteServerSide({
          subAccountId: ctx.subAccountId!,
          invitedByUid: ctx.uid,
          email: args.email as string,
          role: args.role as "admin" | "collaborator",
        });
      } catch (err) {
        if (err instanceof MemberAddBlockedError) {
          throw new CapabilityUserError(err.message);
        }
        throw err;
      }
      const roleLabel = res.role === "admin" ? "Admin" : "Collaborator";

      // Existing account → added directly (no signup step).
      if (res.added) {
        if (res.alreadyMember) {
          return {
            resultText: `${res.email} was already a member of “${res.subAccountName}” — their role is now ${roleLabel}.`,
            ref: { kind: "subAccount", id: res.subAccountId },
          };
        }
        const note = res.mailed
          ? " They've been emailed a notification."
          : "";
        return {
          resultText: `Added ${res.email} to “${res.subAccountName}” as ${roleLabel} (they already had an account, so there was nothing to accept).${note}`,
          ref: { kind: "sub-account", id: res.subAccountId },
        };
      }

      // New email → pending invite until they sign up.
      const reusedNote = res.reused
        ? " There was already a pending invite for them — it's been updated to this role and re-sent."
        : "";
      const delivery = res.mailed
        ? `The invite email is on its way.`
        : `No email was sent (${
            res.mailError ? "the send failed" : "email isn't configured on this deployment"
          }) — share this signup link with them directly: ${res.inviteUrl}`;
      return {
        resultText: `Invited ${res.email} to “${res.subAccountName}” as ${roleLabel}.${reusedNote} ${delivery} Pending invites are managed under Settings → Members.`,
        ref: { kind: "invite", id: res.inviteId },
      };
    },
  },
  {
    name: "research_website_reference",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    readonly: true,
    menuLabel:
      "Read a reference website's content to inform a site you're drafting",
    description:
      "Fetch a public web page's main content (markdown) so you can draft website copy, services, and positioning in a similar style — use this BEFORE create_website whenever the user names a reference site ('make it like fitness.com'). Also useful to read the client's existing site. Returns the page text; if the deployment has no Firecrawl key or the page can't be read, you'll get a note saying so — then draft from the user's description instead. Never quote the reference site verbatim in the new site's copy.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Full http(s) URL of the page to read, e.g. https://fitness.com.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    validate: (raw) => {
      let url = str(raw, "url");
      if (url && !/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url)) {
        // The user often says "like fitness.com" — accept the bare domain.
        url = `https://${url}`;
      }
      if (!url || !/^https?:\/\/.+\..+/i.test(url) || url.length > 300) {
        return { ok: false, error: "a valid http(s) URL is required" };
      }
      return { ok: true, args: { url } };
    },
    summarize: (args) => `Read ${args.url} for reference.`,
    execute: async (_ctx, args) => {
      if (!firecrawlIsConfigured()) {
        return {
          resultText:
            "Firecrawl isn't configured on this deployment, so external sites can't be read. Draft the website from the user's own description instead (don't mention configuration details unless asked).",
        };
      }
      try {
        const page = await scrapeUrl(args.url as string);
        const excerpt = page.markdown.slice(0, 5000);
        return {
          resultText: `Reference page${page.title ? ` “${page.title}”` : ""} (${page.sourceUrl}):\n---\n${excerpt}${
            page.markdown.length > 5000 ? "\n… (truncated)" : ""
          }`,
        };
      } catch (err) {
        const status = err instanceof FirecrawlError ? ` (${err.status})` : "";
        return {
          resultText: `That page couldn't be read${status} — it may be blocked or unavailable. Draft the website from the user's description instead.`,
        };
      }
    },
  },
  {
    name: "get_website_prefill",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    readonly: true,
    menuLabel:
      "Check what's already known for a website draft (business details, defaults, site slots)",
    description:
      "Look up what this workspace already knows before drafting a website: the business name, saved contact email/phone, the booking link (the default CTA), how many of the site slots are used, and whether the website builder is enabled/configured. ALWAYS call this before create_website (and before asking the user questions) so you only ask for what's genuinely missing — never ask for something this lookup already provides.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "Check the workspace's website prefill details.",
    execute: async (ctx) => {
      const db = getAdminDb();
      const [subSnap, profileSnap, sitesSnap] = await Promise.all([
        db.doc(`subAccounts/${ctx.subAccountId!}`).get(),
        db.doc(`subAccounts/${ctx.subAccountId!}/aiAgent/profile`).get(),
        db.collection(`subAccounts/${ctx.subAccountId!}/website`).get(),
      ]);
      const sub = (subSnap.data() ?? {}) as Record<string, unknown>;
      const contact = (sub.accountContact ?? {}) as {
        email?: string | null;
        phone?: string | null;
      };
      const businessName =
        (profileSnap.data()?.businessName as string | undefined) ||
        (sub.name as string | undefined) ||
        null;
      const bookingLink =
        typeof sub.bookingLink === "string" &&
        /^https?:\/\//i.test(sub.bookingLink)
          ? sub.bookingLink
          : null;

      const gateOn = sub.websiteEnabledByAgency === true;
      const maxSites = effectiveWebsiteCap(sub);
      const maxSitesLabel = Number.isFinite(maxSites) ? String(maxSites) : "unlimited";
      const lines = [
        `Website builder enabled by agency: ${gateOn ? "yes" : "NO — the agency owner must enable it before any build (tell the user this up front)"}`,
        `Builder configured on this deployment: ${gitpageIsConfigured() ? "yes" : "NO (GITPAGE_API_KEY missing — builds will fail)"}`,
        `Site slots used: ${sitesSnap.size} of ${maxSitesLabel}${
          sitesSnap.size >= maxSites
            ? " — FULL, one must be removed first"
            : ""
        }`,
        `Business name: ${businessName ?? "(unknown — ask the user)"}`,
        `Contact email (default for the site): ${contact.email ?? "(none saved — ask the user)"}`,
        `Contact phone: ${contact.phone ?? "(none saved)"}`,
        `Booking link (default CTA): ${bookingLink ?? "(none saved — ask the user where the main button should go)"}`,
        "No street address is stored anywhere — always ask the user for it when a niche template or contact page is wanted.",
      ];
      return { resultText: lines.join("\n") };
    },
  },
  {
    name: "create_website",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel:
      "Create and build a website for this workspace (via the website builder)",
    description:
      "Create a website and submit a REAL build via the website builder — use when the user asks to build/make/create a website or landing page. Workflow: (1) call get_website_prefill FIRST — it tells you the business name, saved contact email, default CTA link, and remaining site slots, so you only ask the user for what's genuinely missing; (2) if they name a reference site, call research_website_reference and mirror its tone/services WITHOUT copying text; (3) pick the closest niche template — gym_fitness for gyms/trainers, home_services for trades (plumbers, electricians, cleaners), real_estate for agents — or 'none' for anything else; (4) NICHE SITES NEED THE BUSINESS'S STREET ADDRESS (street + city) — ask for it if unknown, or use niche 'none' without a contact page; (5) features and benefits are each EXACTLY 3 short comma-separated phrases (max 60 chars total); (6) build_type 'vsl' is a single-page video funnel — only use it when the user has a video embed URL; default 'local'. Contact email and the main button link default from the workspace's saved details when omitted. Confirming spends one of the agency's website builds; the site goes live in ~1–3 minutes on the Website page." +
      " (7) WRITE LIKE A DIRECT-RESPONSE COPYWRITER (think Russell Brunson / Jim Edwards / Dan Kennedy), NOT A CORPORATE BROCHURE. gitpage's own template defaults to generic filler ('Our comprehensive approach combines cutting-edge methodology with timeless wisdom') when a site is built around vague input — your job is to give it something specific enough that it can't fall back to that. hero_statement should hook with the reader's actual problem, not describe the business in the abstract — a sharp question or a concrete pain beats a mission statement every time. features/benefits phrases must name a specific outcome or mechanism, never an adjective doing all the work ('transformative', 'revolutionary', 'comprehensive', 'cutting-edge' are banned — they say nothing). Ground every phrase in what the user actually told you about this specific business. Writing heading/hero_statement/features/benefits is YOUR job as the copywriter — never respond with 'heading is required, what should it be?' or similar. If you have even a one-line description of the business, write concrete copy from it rather than asking for more. The ONLY thing worth a clarifying question is a missing BUSINESS FACT you can't honestly invent (what the business does, who it's for, what makes it different) — never the copy itself." +
      " (8) VARY THE DESIGN TO MATCH THIS BUSINESS'S ACTUAL PERSONALITY — don't default to the same design_color_palette/design_typography/design_components/design_interactions combination every time out of habit. A tattoo studio, a children's dentist, and a B2B SaaS tool should never land on the same design choices. Reason about who this business is for and what tone earns their trust (playful vs. authoritative, bold vs. minimal, energetic vs. calm) before picking — the enum lists exist precisely so different businesses can look different.",
    parameters: {
      type: "object",
      properties: {
        site_name: {
          type: "string",
          description: "Short label for the site card, e.g. the business name.",
        },
        build_type: {
          type: "string",
          enum: ["local", "vsl"],
          description:
            "'local' = multi-page business site (default). 'vsl' = single-page video funnel; requires video_link.",
        },
        niche: {
          type: "string",
          enum: ["gym_fitness", "home_services", "real_estate", "none"],
          description:
            "Vertical template. Forces a 5-page site and requires the business street address. 'none' = generic build.",
        },
        heading: {
          type: "string",
          description:
            "Site heading / title, max 80 chars. The business name plus a specific, concrete hook — not a generic tagline. Bad: 'Elevate Your Fitness Journey'. Good: 'Drop 15lbs Before Your Reunion, Not Someday'.",
        },
        hero_statement: {
          type: "string",
          description:
            "One-line subheading under the heading, max 80 chars. Hook with the reader's actual problem or a sharp question, not a mission statement. Bad: 'Comprehensive fitness solutions for everyone'. Good: 'Tired of gyms that feel like a second job?'",
        },
        features: {
          type: "string",
          description:
            "Exactly 3 short comma-separated phrases, max 60 chars total, e.g. 'Coach-led, HR tracked, Progressive'. Each phrase names a specific mechanism or outcome, not a vague adjective ('cutting-edge', 'comprehensive', 'transformative' are banned).",
        },
        benefits: {
          type: "string",
          description:
            "Exactly 3 short comma-separated phrases, max 60 chars total, e.g. 'Adapt fast, Stay durable, Train sharper'. What the reader actually gets, in their terms — not a restatement of the feature in fancier words.",
        },
        contact_email: {
          type: "string",
          description:
            "Public contact email for the site. Omit to use the workspace's saved account contact.",
        },
        cta_link: {
          type: "string",
          description:
            "http(s) URL the site's main button points at (booking page, phone tel: is NOT allowed — must be http/https). Omit to use the workspace's saved booking link.",
        },
        include_faq: { type: "boolean", description: "Include an FAQ section. Default true." },
        color_scheme: {
          type: "string",
          enum: [...GITPAGE_COLOR_SCHEMES],
          description: "'Dark Mode' suits gyms/bold brands; 'Standard' otherwise.",
        },
        language: { type: "string", enum: [...GITPAGE_LANGUAGES] },
        design_color_palette: {
          type: "string",
          enum: [...GITPAGE_DESIGN_COLOR_PALETTES],
          description:
            "Pick to match THIS business's personality, not the same default every time. Use 'Custom' when the user gives specific brand colours.",
        },
        custom_colors: {
          type: "string",
          description:
            "Only with design_color_palette 'Custom': three hex colours, e.g. '#5B4BFF,#EEF0FF,#00E5A8'.",
        },
        design_typography: {
          type: "string",
          enum: [...GITPAGE_DESIGN_TYPOGRAPHY],
          description: "Match the business's voice — a playful brand and a law firm shouldn't share one.",
        },
        design_layout: { type: "string", enum: [...GITPAGE_DESIGN_LAYOUT] },
        design_components: {
          type: "string",
          enum: [...GITPAGE_DESIGN_COMPONENTS],
          description: "Sharp/geometric reads differently than rounded/soft — pick what fits this brand.",
        },
        design_interactions: {
          type: "string",
          enum: [...GITPAGE_DESIGN_INTERACTIONS],
          description: "Energetic suits bold/active brands; subtle suits calm/premium ones.",
        },
        design_buttons: { type: "string", enum: [...GITPAGE_DESIGN_BUTTONS] },
        design_contact_form: { type: "string", enum: [...GITPAGE_DESIGN_CONTACT_FORM] },
        design_icons: { type: "string", enum: [...GITPAGE_DESIGN_ICONS] },
        include_services_page: {
          type: "boolean",
          description: "Generic local builds only (niche forces all pages). Default true.",
        },
        include_contact_page: {
          type: "boolean",
          description:
            "Generic local builds only. Requires the business street address in `business`.",
        },
        include_privacy_page: { type: "boolean" },
        include_terms_page: { type: "boolean" },
        services_list: {
          type: "string",
          description:
            "Optional short description of the services offered. Omit to let the builder generate them.",
        },
        video_link: {
          type: "string",
          description:
            "VSL builds only: http(s) EMBED URL of the video (e.g. https://www.youtube.com/embed/...).",
        },
        business: {
          type: "object",
          description:
            "Business details for the contact page / niche templates. Only include what the user actually provided — never invent an address.",
          properties: {
            name: { type: "string" },
            street: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            country: { type: "string" },
            zip: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            opening_hours: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["heading", "hero_statement", "features", "benefits"],
      additionalProperties: false,
    },
    validate: (rawIn) => {
      // Confirm round-trips the camelCase `args` this validate() itself
      // returns (see the `return { ok: true, args: {...} }` below) — so this
      // function must accept both the LLM's original snake_case tool-call
      // args AND its own previously-normalized camelCase output. Alias the
      // camelCase keys back to their snake_case originals up front so every
      // `str(raw, "snake_case")` read below works either way.
      const rawObj = (rawIn ?? {}) as Record<string, unknown>;
      const camelToSnake: Record<string, string> = {
        siteName: "site_name",
        buildType: "build_type",
        videoLink: "video_link",
        contactEmail: "contact_email",
        ctaLink: "cta_link",
        designPalette: "design_color_palette",
        customColors: "custom_colors",
        designTypography: "design_typography",
        designLayout: "design_layout",
        designComponents: "design_components",
        designInteractions: "design_interactions",
        designButtons: "design_buttons",
        designContactForm: "design_contact_form",
        designIcons: "design_icons",
        servicesList: "services_list",
        heroStatement: "hero_statement",
        colorScheme: "color_scheme",
        includeFaq: "include_faq",
        includeContactPage: "include_contact_page",
        includeServicesPage: "include_services_page",
        includePrivacyPage: "include_privacy_page",
        includeTermsPage: "include_terms_page",
      };
      const raw: Record<string, unknown> = { ...rawObj };
      for (const [camel, snake] of Object.entries(camelToSnake)) {
        if (raw[snake] === undefined && camel in rawObj) {
          raw[snake] = rawObj[camel];
        }
      }

      const heading = str(raw, "heading");
      if (!heading) return { ok: false, error: "a site heading is required" };
      if (heading.length > 80) {
        return { ok: false, error: "the heading must be 80 characters or fewer" };
      }
      const heroStatement = str(raw, "hero_statement");
      if (!heroStatement || heroStatement.length > 80) {
        return {
          ok: false,
          error: "a hero statement (max 80 characters) is required",
        };
      }
      const features = str(raw, "features");
      const benefits = str(raw, "benefits");
      if (!features || features.length > 60) {
        return {
          ok: false,
          error:
            "features must be 3 short comma-separated phrases, max 60 characters total",
        };
      }
      if (!benefits || benefits.length > 60) {
        return {
          ok: false,
          error:
            "benefits must be 3 short comma-separated phrases, max 60 characters total",
        };
      }

      const buildType = str(raw, "build_type") === "vsl" ? "vsl" : "local";
      const nicheRaw = str(raw, "niche");
      const niche: Niche | null =
        nicheRaw === "gym_fitness" ||
        nicheRaw === "home_services" ||
        nicheRaw === "real_estate"
          ? nicheRaw
          : null;

      const videoLink = str(raw, "video_link");
      if (buildType === "vsl") {
        if (!videoLink || !/^https?:\/\/.+/i.test(videoLink)) {
          return {
            ok: false,
            error:
              "a VSL funnel needs the video's http(s) embed URL — ask the user for it (or build a 'local' site instead)",
          };
        }
      }

      const contactEmail = str(raw, "contact_email").toLowerCase();
      if (contactEmail && !EMAIL_RE.test(contactEmail)) {
        return { ok: false, error: "that contact email doesn't look valid" };
      }
      const ctaLink = str(raw, "cta_link");
      if (ctaLink && !/^https?:\/\/.+/i.test(ctaLink)) {
        return {
          ok: false,
          error: "the CTA link must start with http:// or https://",
        };
      }

      const inList = (value: string, list: readonly string[]) =>
        list.includes(value);
      const enumOr = (
        key: string,
        list: readonly string[],
        fallback: string,
      ): string => {
        const v = str(raw, key);
        return v && inList(v, list) ? v : fallback;
      };

      const designPalette = enumOr(
        "design_color_palette",
        GITPAGE_DESIGN_COLOR_PALETTES,
        "Modern / Startup",
      );
      const customColors = str(raw, "custom_colors");
      if (
        designPalette === "Custom" &&
        !/^#?[0-9a-f]{6}\s*,\s*#?[0-9a-f]{6}\s*,\s*#?[0-9a-f]{6}$/i.test(
          customColors.trim(),
        )
      ) {
        return {
          ok: false,
          error:
            "a Custom palette needs three hex colours separated by commas, e.g. '#5B4BFF,#EEF0FF,#00E5A8'",
        };
      }

      const bizRaw = ((raw as Record<string, unknown>)?.business ?? {}) as Record<
        string,
        unknown
      >;
      const bizStr = (key: string): string => {
        const v = bizRaw[key];
        return typeof v === "string" ? v.trim().slice(0, 160) : "";
      };
      const business = {
        name: bizStr("name"),
        street: bizStr("street"),
        city: bizStr("city"),
        state: bizStr("state"),
        country: bizStr("country"),
        zip: bizStr("zip"),
        phone: bizStr("phone"),
        email: bizStr("email").toLowerCase(),
        opening_hours: bizStr("opening_hours"),
      };
      if (business.email && !EMAIL_RE.test(business.email)) {
        return { ok: false, error: "the business email doesn't look valid" };
      }

      const wantsContactPage =
        (raw as Record<string, unknown>)?.include_contact_page === true;
      if (
        buildType === "local" &&
        (niche || wantsContactPage) &&
        (!business.street || !business.city)
      ) {
        return {
          ok: false,
          error: niche
            ? "niche templates include a contact page, which needs the business's street address and city — ask the user for them (or use niche 'none' without a contact page)"
            : "a contact page needs the business's street address and city — ask the user for them (or leave the contact page off)",
        };
      }

      return {
        ok: true,
        args: {
          siteName: str(raw, "site_name").slice(0, 60),
          buildType,
          niche,
          heading,
          heroStatement,
          features,
          benefits,
          contactEmail,
          ctaLink,
          includeFaq:
            (raw as Record<string, unknown>)?.include_faq !== false,
          colorScheme: enumOr("color_scheme", GITPAGE_COLOR_SCHEMES, "Standard"),
          language: enumOr("language", GITPAGE_LANGUAGES, "English"),
          designPalette,
          customColors: designPalette === "Custom" ? customColors : "",
          designTypography: enumOr(
            "design_typography",
            GITPAGE_DESIGN_TYPOGRAPHY,
            "Professional / Corporate",
          ),
          designLayout: enumOr("design_layout", GITPAGE_DESIGN_LAYOUT, "Spacious"),
          designComponents: enumOr(
            "design_components",
            GITPAGE_DESIGN_COMPONENTS,
            "Rounded & Soft",
          ),
          designInteractions: enumOr(
            "design_interactions",
            GITPAGE_DESIGN_INTERACTIONS,
            "Energetic",
          ),
          designButtons: enumOr(
            "design_buttons",
            GITPAGE_DESIGN_BUTTONS,
            "Solid Primary",
          ),
          designContactForm: enumOr(
            "design_contact_form",
            GITPAGE_DESIGN_CONTACT_FORM,
            "Centered Card",
          ),
          designIcons: enumOr(
            "design_icons",
            GITPAGE_DESIGN_ICONS,
            "Heroicons Outline",
          ),
          includeServicesPage:
            (raw as Record<string, unknown>)?.include_services_page !== false,
          includeContactPage: wantsContactPage,
          includePrivacyPage:
            (raw as Record<string, unknown>)?.include_privacy_page === true,
          includeTermsPage:
            (raw as Record<string, unknown>)?.include_terms_page === true,
          servicesList: str(raw, "services_list").slice(0, 600),
          videoLink,
          business,
        },
      };
    },
    summarize: (args) => {
      const nicheLabel =
        args.niche === "gym_fitness"
          ? "Gym & Fitness template"
          : args.niche === "home_services"
            ? "Home Services template"
            : args.niche === "real_estate"
              ? "Real Estate template"
              : "generic design";
      const kind =
        args.buildType === "vsl"
          ? "single-page video funnel"
          : `multi-page site (${nicheLabel})`;
      return `Create & BUILD the website “${
        args.siteName || args.heading
      }” — ${kind}, ${args.colorScheme === "Dark Mode" ? "dark mode" : "standard colours"}, heading “${args.heading}”. This submits a real build (uses one of your agency's website builds; live in ~1–3 minutes).`;
    },
    execute: async (ctx, args) => {
      const subAccountId = ctx.subAccountId!;
      const db = getAdminDb();

      // Fill contact email + CTA from the workspace's real saved details —
      // never from model guesses.
      const [subSnap, profileSnap] = await Promise.all([
        db.doc(`subAccounts/${subAccountId}`).get(),
        db.doc(`subAccounts/${subAccountId}/aiAgent/profile`).get(),
      ]);
      const sub = (subSnap.data() ?? {}) as Record<string, unknown>;
      const accountContact = (sub.accountContact ?? {}) as {
        email?: string | null;
        phone?: string | null;
      };
      const profileBusinessName =
        (profileSnap.data()?.businessName as string | undefined) ?? "";

      const business = args.business as Record<string, string>;
      const contactEmail =
        (args.contactEmail as string) ||
        business.email ||
        accountContact.email ||
        "";
      if (!contactEmail) {
        throw new CapabilityUserError(
          "I need a public contact email for the site. Tell me which to use, or save one under Settings → Account contact first.",
        );
      }
      const bookingLink =
        typeof sub.bookingLink === "string" && /^https?:\/\//i.test(sub.bookingLink)
          ? sub.bookingLink
          : "";
      const ctaLink = (args.ctaLink as string) || bookingLink;
      if (!ctaLink) {
        throw new CapabilityUserError(
          "I need a link for the site's main button (a booking page or your website). Tell me the URL, or set a booking link in Settings first.",
        );
      }

      const buildType = args.buildType as "local" | "vsl";
      const niche = args.niche as Niche | null;
      const config: WebsiteConfig =
        buildType === "vsl" ? blankVslConfig() : blankWebsiteConfig();

      config.build_type = buildType;
      config.niche = niche;
      config.language = args.language as string;
      config.heading = args.heading as string;
      config.color_scheme = args.colorScheme as WebsiteConfig["color_scheme"];
      config.hero_statement = args.heroStatement as string;
      config.features = args.features as string;
      config.benefits = args.benefits as string;
      config.contact_details = contactEmail;
      config.cta_link = ctaLink;
      config.include_faq = args.includeFaq as boolean;
      config.video_link = (args.videoLink as string) || "";
      config.design_color_palette = args.designPalette as string;
      config.custom_colors = args.customColors as string;
      config.design_typography = args.designTypography as string;
      config.design_layout = args.designLayout as string;
      config.design_components = args.designComponents as string;
      config.design_interactions = args.designInteractions as string;
      config.design_buttons = args.designButtons as string;
      config.design_contact_form = args.designContactForm as string;
      config.design_icons = args.designIcons as string;

      const needsBusinessDetails =
        buildType === "local" &&
        (niche !== null || (args.includeContactPage as boolean));
      if (buildType === "local") {
        config.local_page_selections = {
          index: true,
          services: (args.includeServicesPage as boolean) || niche !== null,
          contact: needsBusinessDetails,
          privacy: (args.includePrivacyPage as boolean) || niche !== null,
          terms: (args.includeTermsPage as boolean) || niche !== null,
        };
        const servicesList = args.servicesList as string;
        config.services_config = config.local_page_selections.services
          ? {
              let_ai_do_services: !servicesList,
              services_list: servicesList,
            }
          : null;
        config.business_details = needsBusinessDetails
          ? {
              ...blankBusinessDetails(),
              business_name:
                business.name || profileBusinessName || (sub.name as string) || "",
              business_street: business.street,
              business_city: business.city,
              business_state: business.state,
              business_country: business.country,
              business_zip: business.zip,
              business_phone: business.phone || accountContact.phone || "",
              business_email: business.email || contactEmail,
              opening_hours: business.opening_hours,
            }
          : null;
      }

      // Create the draft slot only after the config is complete, so a
      // validation failure never leaves an unusable blank card behind.
      const { siteId } = await (async () => {
        try {
          return await createWebsiteForSubAccount({
            subAccountId,
            name:
              (args.siteName as string) ||
              business.name ||
              (args.heading as string),
          });
        } catch (err) {
          if (err instanceof WebsiteServiceError) {
            throw new CapabilityUserError(err.message);
          }
          throw err;
        }
      })();

      try {
        await submitWebsiteBuildForSubAccount({
          subAccountId,
          siteId,
          config,
          buildByUid: ctx.uid,
        });
      } catch (err) {
        // Don't leave a blank draft occupying one of the 5 site slots when
        // the build submit failed — the user will just retry from chat.
        await db
          .doc(`subAccounts/${subAccountId}/website/${siteId}`)
          .delete()
          .catch(() => undefined);
        if (err instanceof WebsiteServiceError) {
          const firstFieldError = err.fieldErrors
            ? Object.values(err.fieldErrors)[0]
            : null;
          throw new CapabilityUserError(
            firstFieldError ? `${err.message} ${firstFieldError}` : err.message,
          );
        }
        throw err;
      }

      return {
        resultText: `The build for “${
          (args.siteName as string) || (args.heading as string)
        }” is submitted — it takes about 1–3 minutes to generate. Watch it go live under Sidebar → Website; the card shows the live URL when it's ready.`,
        ref: { kind: "website", id: siteId },
      };
    },
  },
  {
    name: "check_website_status",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Check this workspace's websites (build status + live URLs)",
    description:
      "List this sub-account's websites with their build status and live URL. Use when the user asks whether their site is done, what sites exist, or for a site's address.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "Check the websites' status.",
    execute: async (ctx) => {
      const snap = await getAdminDb()
        .collection(`subAccounts/${ctx.subAccountId!}/website`)
        .get();
      if (snap.empty) {
        return {
          resultText:
            "No websites exist in this workspace yet. Ask me to build one, or use Sidebar → Website.",
        };
      }
      const lines = snap.docs.map((d) => {
        const w = d.data() as Record<string, unknown>;
        const name =
          (w.name as string) ||
          ((w.config as { heading?: string } | undefined)?.heading ?? "Untitled site");
        const status = w.status as string;
        const contentFlags = w.contentFlags as unknown[] | null | undefined;
        const detail =
          status === "ready" && w.liveUrl
            ? `live at ${w.liveUrl}`
            : status === "failed"
              ? `failed${w.errorMessage ? ` — ${w.errorMessage}` : ""}`
              : status === "queued" || status === "building"
                ? "building now (usually 1–3 minutes)"
                : "draft (not built yet)";
        const flagWarning =
          status === "ready" && contentFlags && contentFlags.length > 0
            ? " ⚠️ may contain generic filler content (fake testimonials/stats/program details) — tell the user to review before sharing this link"
            : "";
        return `- “${name}”: ${detail}${flagWarning}`;
      });
      return {
        resultText: `Websites in this workspace:\n${lines.join("\n")}`,
      };
    },
  },
  {
    name: "create_funnel",
    level: "sub-account",
    requiredRole: "subAccountAdmin",
    menuLabel: "Create a funnel system for this workspace (page + form + follow-up email + workflow)",
    description:
      "Create a COMPLETE funnel system — not just a landing page — hosted directly on this platform (not the website builder): the funnel page itself, PLUS (when the funnel needs a lead-capture opt-in — most genres besides paid tripwire/vsl offers) a dedicated capture Form, a follow-up email Message Template, and a Workflow that sends it the moment someone submits. Use when the user asks to build/make/create/generate a funnel, landing page, lead magnet page, webinar registration page, application page, or tripwire offer — 'build me a webinar funnel' should produce the whole connected system in one shot, matching what an operator would expect, not just a page they still have to wire up by hand. Everything is created in DRAFT/review state — the funnel is never auto-published, the workflow is never auto-activated — since real money (Stripe) and real emails are on the other side of 'live'. If the user names a reference site, call research_website_reference FIRST and mirror its tone/services WITHOUT copying text. IMPORTANT — write the copy yourself, don't make the user write it: headline, subheadline, bullets, story, and CTA label are all YOUR job as the copywriter, not the user's — never respond with a bare 'a headline is required, what should it be?' question. From whatever the user told you about their business/offer/audience (even a single sentence), write a specific, concrete headline/subheadline/bullets/CTA yourself. The ONLY thing you should ask the user for is a genuine BUSINESS FACT you truly have nothing to go on for AND cannot safely infer or draft around — realistically just: what the business actually does (if even that wasn't said), whether a named person is really the founder, or whether a testimonial may be published. That's close to the full list — do NOT ask for the business/clinic/practice NAME (use whatever the user called it, or write around it generically — 'this clinic', 'your practice' — the operator can rename it in seconds), a CITY or location (skip locality-specific copy rather than ask), a real media URL (use media_subject/hero_media_url's honest-placeholder path instead of asking), or a booking calendar/phone number (cta_style silently falls back to a working popup_form when neither cta_booking_page_slug nor cta_phone_number is available — see those params — so there is NOTHING to ask about there either). Never ask the user to define marketing copy, visual choices, funnel structure, offer wording, or WHICH GENRE/PRICING MODEL to use — that includes the specific lead-magnet/consultation MECHANISM (e.g. 'should this be a free assessment, a downloadable checklist, or a generic consultation request?' is exactly the kind of question you must NOT ask) and 'should this be free or a paid offer?' (default to a free genre — lead_gen or lead_magnet — whenever the user didn't mention pricing; only pick a priced genre — tripwire/vsl/challenge — when they told you a real price). When the business, audience, and objective already give you enough context (which a one-sentence business description almost always does), pick the single most conversion-appropriate mechanism yourself — for a B2B/professional/consultative business with no named lead magnet, default to a free consultation/scoping-call/assessment offer, worded specifically to the business, not generically — build the complete DRAFT with that assumption, and say so plainly in your reply (e.g. 'I've drafted this around a free scoping-call offer, since none was specified — easy to swap for a different lead magnet before you publish'). A draft in review beats a blocking question every time; the user can always edit or regenerate. The one exception where asking instead of drafting stays correct: the user has explicitly requested something this tool structurally cannot configure without a specific real-world fact they haven't given — e.g. they said 'charge $49 for this' but never told you the actual price, or 'send people to my calendar' but never gave a real booking-page slug — because guessing those isn't a draft assumption, it's a broken or misleading live page. Absent such an explicit request, always take the safe free/self-contained default instead of asking. The one exception on copy specifically is testimonials (see story_paragraphs below): those must come from the user or be written as synthesized non-testimonial copy — never invented as if from a real customer. STRATEGY — before writing any copy, silently reason through (do NOT show this reasoning in your reply or explain it to the user — only the finished page is ever exposed, never the analysis behind it): who the customer is, their market sophistication (have they seen offers like this before, or is this new to them?) and awareness level (do they already know they have this problem, or do you need to surface it first?), what problem/pain they have right now, the outcome they actually want, the objection most likely stopping them from acting, how this offer is positioned against alternatives, what the offer itself concretely delivers, where they are in their buying cycle (browsing vs. actively comparing vs. ready now), whether real urgency exists (never invent false scarcity/deadlines — see the trust rules below), how much proof this specific claim needs before a skeptical reader believes it, whether the purchase is more emotional or more logical for this audience (and whether the copy should lead with feeling or with facts accordingly), and how much friction the CTA can tolerate (a free lead magnet can ask for one click; a $5k engagement earns the right to a longer, more consultative page). A senior conversion copywriter does this thinking before typing a single word — your headline/bullets/story/CTA should read like the output of that reasoning, not like a form filled in field-by-field or a generic template with the business name swapped in. COPY QUALITY — cut every word that isn't doing real work: never use 'unlock', 'elevate', 'seamless', 'seamlessly', 'revolutionize', 'revolutionary', 'empower', 'unparalleled', 'cutting-edge', 'game-changing', 'game-changer', 'next-level', 'world-class', 'unleash', 'supercharge', 'effortless', 'effortlessly', 'holistic', 'robust', 'dynamic', 'tailored', 'transformative', 'comprehensive', 'unlock your potential', or any phrase that could be pasted onto a competitor's page unchanged — if a sentence would still be true with the business name swapped out, rewrite it until it wouldn't be. Prefer a concrete number, mechanism, or named outcome over an adjective every time ('cuts callback visits in half' beats 'more efficient'). Every sentence on the page should exist for a specific reason — cut anything that's there to sound impressive rather than to move the reader toward the CTA. " +
      "PERSUASION OPERATING SYSTEM — APPLY these to the actual copy you write; this is what separates a real page from a template, and skipping it is why generic pages feel bland: " +
      "(1) ONE ARGUMENT — the whole page argues a SINGLE belief: '[the mechanism] is why they aren't getting [result] now, and why [better result] is now possible.' Every section reinforces that one belief; the mechanism is the ROUTE to the result, never a list of deliverables. " +
      "(2) HOOK — open with ONE hook that makes the RIGHT prospect feel seen and excludes the wrong one: villain/contrarian ('what you were told to do is quietly costing you'), bold specific claim, identity/situation ('if you're [who] stuck at [where]…'), or story/before-after. The context is the prospect's situation, never the company's bio. " +
      "(3) OLD WAY vs NEW WAY — give a BLAMELESS reason their past effort failed ('not because you're incapable — the method itself produces the wrong result'); the villain is a behavior/belief/system/category, NEVER a named person or competitor; make the contrast FELT, don't literally announce 'old way/new way'. " +
      "(4) AMPLIFY EVERY LINE — each line must make the outcome more DESIRABLE (physical + specific: 'case-study-worthy clients', not 'better leads'), more CERTAIN (controllable/proven: 'a dial you can turn', not 'scalable'), more ACHIEVABLE (lower effort/time: 'three shifts', not 'endless work'), or more URGENT (the cost of the old way). A line that does none of these four is filler — cut it. " +
      "(5) MECHANISM — name it and state what it PRODUCES, not what you do ('a dialled-in message gets the right people to book themselves', not 'we write ads and optimize funnels'). It must feel better, easier, AND more certain than the old way. " +
      "(6) CADENCE — one idea per line, open loops (a line raises a question the next answers), tension-then-payoff, side-by-side contrast, long-setup→short-snap, so each line pulls the reader into the next. " +
      "(7) PROOF stays REAL — congruent with the claim, exact non-round numbers, no vanity metrics, and NEVER fabricated (no invented testimonials, counts, stats, or guarantees — write around missing proof with mechanism + specificity instead). " +
      "Enter the conversation already happening in the prospect's head; use their words for the problem and the outcome, not industry jargon. " +
      "DESIGN — you are both the conversion strategist AND the landing-page designer. This is Phase 2's job, not the user's: NEVER ask what color/font/template/border-radius/layout they want — infer a visual_archetype from the business/audience/offer you already have, and only ask when a real fact is genuinely missing and unsafe to guess (existing brand colors, whether a named person is the founder, whether a testimonial may be published, a video URL, which booking calendar). Pick ONE visual_archetype: " +
      "For a sales or lead-generation page — which is MOST funnels, INCLUDING local-service lead-gen — DEFAULT to direct_response; only pick a softer archetype when the brand genuinely calls for it (luxury, wellness, nonprofit, or a brand that explicitly wants a calm/premium feel). " +
      "direct_response (THE DEFAULT for high-converting sales & lead pages — offers, lead magnets, VSLs, applications, webinars, and most local-service lead-gen: dark, high-contrast, oversized bold headlines, ONE punchy high-visibility CTA color, strong alternating dark section bands, sharp layered cards, high energy — the ClickFunnels/direct-response look, built to CONVERT, not to look tastefully minimal. Never default a normal sales/lead page to a flat, light, tasteful look). " +
      "local_service (home services, automotive, clinics, contractors — ONLY when a calm warm/high-trust look genuinely converts better than the bold direct-response look for this specific brand: warm palette, friendly sans, rounded cards, low complexity, phone/booking/estimate CTAs). " +
      "saas_technology (SaaS, AI, dev tools, platforms, apps — high-contrast light/dark/mixed, controlled gradients, dashboard/browser mockups, modern type, moderate motion, tight geometry). " +
      "luxury_premium (executive consulting, luxury services, wealth, premium professional services — cream/charcoal/deep-neutral, restrained gold/metallic accents, serif display, editorial imagery, generous whitespace, minimal icons, subtle motion). " +
      "nonprofit_mission (nonprofits, causes, community/mission-driven programs — story-led, community/impact imagery, human-centered hierarchy, warm-but-credible palette, highly accessible). " +
      "coach_consultant (coaches, consultants, personal brands, mastermind/mentorship — founder-forward, founder photo/video, methodology/journey sections, strong booking/application CTA, authority without fabricated proof). " +
      "wellness (health, fitness, life coaching, spiritual/holistic — soft natural palette, organic/rounded shapes, calmer spacing, gentle animation, lower density). " +
      "agency_creative (marketing/creative agencies, freelance studios, sales-led creative services — bold type, strong contrast, layered cards, higher energy, moderate/expressive motion, strategy-call CTA). " +
      "professional_enterprise (consultants, healthcare, law, finance, enterprise B2B — structured grids, restrained color, data/process visuals, conservative motion, clear comparison sections). " +
      "Each archetype resolves a FULL token set automatically (palette, color mode, typography, card geometry, icon style, density, background rhythm, animation level, hero layout, CTA strategy) — never hand-pick these individually; instead nudge them via the optional overrides below, which are only honored when they're one of that archetype's own approved options (an invalid override is silently ignored, never an arbitrary color/font): palette_variant (that archetype's own named palette, e.g. 'trust_blue' for local_service — omit to use its first/default), color_mode (light/dark/mixed, only if the archetype supports more than one), typography_pairing, hero_layout, animation_level (none/minimal/moderate/expressive — omit to use the archetype's own default; never crank this up just because you can), visual_density (low/medium/high), media_strategy (what kind of media the hero/founder area wants — e.g. dashboard_screenshot for SaaS, founder_photo for coach_consultant), cta_style (inline/popup_form/popup_calendar/dual/sticky_desktop/floating_mobile/phone — omit to use the archetype's own recommended CTA, e.g. local_service defaults to popup_calendar/phone, luxury_premium to popup_calendar). If the user gave you a REAL media asset (a screenshot/photo URL), pass it as hero_media_url (+ hero_media_type); if the archetype's media_strategy calls for real media you don't have, Zeno leaves an honest labeled placeholder automatically — never fabricate a fake dashboard/photo. Write media_subject whenever media_strategy implies a real photo (service_photo/team_photo/community_photo/founder_photo) with no hero_media_url given — a SPECIFIC shooting brief for the operator (e.g. 'Technician repairing an HVAC unit'), not a generic 'add a photo'; skip it for screenshot-type strategies (dashboard_screenshot/browser_mockup/product_screenshot — nothing to 'shoot'). When media_strategy is service_photo/team_photo/community_photo (i.e. the business would show MULTIPLE real examples, not one), Zeno automatically adds a dedicated photo-gallery section instead of cramming everything into the hero — the hero stays a clean headline (with room for the operator's real logo above it); gallery_layout optionally overrides which layout that gallery uses (grid/masonry/carousel/before_after), omit to use the archetype's own recommendation. For a 'phone' cta_style, pass the real number as cta_phone_number (E.164, e.g. '+15551234567') — omit if you don't have one and the CTA falls back to inline rather than a dead tel: link. " +
      "Legacy design_pack (classic/executive/bold/premium/startup/local_business/wellness) still works if you use it instead, but visual_archetype is the current, richer system — prefer it for every new funnel. Don't set BOTH design_pack and accent_color when you've picked a real archetype/pack — they'd conflict. " +
      "STRUCTURE — this is a conversion-framework generator, not a paragraph generator: every funnel follows Attention → Problem → Solution → Benefits → Process → Offer → Trust → FAQ → CTA, and each genre maps that sequence onto a recommended sequence of REUSABLE LAYOUTS (cards, grids, timelines, comparisons — favor these over walls of text): " +
      "lead_magnet = Hero ONLY — one fold, no scrolling required. A free lead magnet is a low-commitment ask; the hero itself carries the value prop, 3-5 bullets (what they get), and the capture form as a popup behind the CTA button. Write MORE into eyebrow/headline/subheadline/bullets than you would for a multi-section genre, since the hero is the entire page — but still no separate sections below it. " +
      "vsl = Hero → Video → Problem/Solution → Value Stack → Offer → FAQ → CTA banner (fill the value_stack param with the real deliverables + values)." +
      "webinar = Hero → Agenda (process timeline) → Benefits (grid) → Host (founder story) → FAQ → Register (capture form). " +
      "application = Hero → Who It's For (benefits grid) → Who This Isn't For (cards — real disqualifying criteria, not a vague adjective) → Process (timeline) → Results (before/after, or real testimonials if given) → Application (capture form). " +
      "challenge = Hero → Problem/Solution → What You'll Get (benefits grid) → Challenge Schedule (process timeline) → Register (ticket tiers) → FAQ. " +
      "tripwire (sales-page style) = Hero → Problem/Solution → Opportunity (callout — why this matters now) → Features (benefits grid) → Trust badges (or real testimonials, if given) → Value Stack → Offer (priced) → Guarantee → FAQ (fill the value_stack param with the real deliverables + honest values + total + price)." +
      "lead_gen = Hero → Trust Logos → Benefits (grid) → Offer (capture form) → FAQ. " +
      "LENGTH — match page length to commitment level, not a fixed habit: lead_magnet is the one exception at a true single fold (above); every other genre's stage count already reflects what its ask requires, so use the full sequence rather than trimming it. A free download needs zero persuasion runway; a webinar/lead_gen registration (6/5 stages) needs a little context before someone hands over their email; a multi-day challenge or a qualify-before-you-can-apply application (6 stages each) needs to show the process and set expectations; a priced tripwire offer (8 stages, sales-page style) needs the most — problem, proof, guarantee, objection-handling — because asking for a card number is the highest-commitment ask on this list. For an especially high-ticket / SaaS-style offer within any priced genre, lean into writing MORE substantive copy per stage (richer stage_content, fuller story_paragraphs) rather than adding new sections — the framework's stage count is fixed per genre; depth of copy is where 'long-form' actually lives. " +
      "Some stages have a fixed layout; a few (marked above with 'or') allow an alternate — use layout_choices ONLY to pick that alternate when the business/evidence genuinely calls for it (e.g. real testimonials exist), never as a default habit. Workflow: (1) pick the genre — lead_magnet (free book/PDF opt-in, one-fold), vsl (high-ticket video sales page), challenge (multi-day registration), application (qualify leads before a call), tripwire (low-ticket entry offer), webinar (single-session registration), lead_gen (generic interest capture); (2) write a specific, concrete headline — never a generic tagline; (3) bullets must name a specific outcome or mechanism, never a vague adjective ('transformative', 'game-changing', 'cutting-edge' are banned); (4) ONLY include faq_items if you have enough real detail to answer honestly — never invent generic filler Q&A or fabricated guarantees/stats; (5) price_cents only applies to genres with a priced offer (tripwire, vsl, challenge) — omit for a free lead magnet, and when a price IS set, skip the capture form (a paid offer needs checkout, not a lead form — the operator wires up Stripe checkout on that section afterward); (6) leave include_capture_form at its default (true) unless the user is clearly building a pure sales/checkout page with no opt-in step; (7) confirmation_email_body should read like a real, brief, human confirmation (what they'll get, what's next) — it can be genuinely short, but must never invent guarantees, stats, or promises the funnel copy itself didn't make; (8) ALWAYS write story_paragraphs whenever the genre's framework includes a Story/Founder-Story/Host stage. Two cases: if the user gave you a REAL testimonial (an actual customer's words, name, location, or result), use it close to verbatim as story_paragraphs with story_byline set to their real attribution (e.g. 'From: Jane Doe, Austin, TX') — don't rewrite their claim into something stronger than what they said. Otherwise (the common case — no testimonial offered), write 2-4 paragraphs of synthesized 'why this works' copy — the mechanism, the reasoning — from the headline/bullets you already wrote, with a generic byline like 'Why this works' (or 'Your host: ...' for a webinar), and NEVER invent a fictional customer name/location/quote to make it look like a testimonial; (9) guarantee_headline/guarantee_body — ONLY when the user told you a real guarantee they actually offer, never invented; (10) trust_badges — safe generic ones (e.g. 'Secure checkout', 'Privacy protected') are fine whenever there's a form or checkout, but only add a guarantee-related badge if guarantee_headline is also set; (11) cta_banner_headline/cta_banner_subtext (VSL genre) should restate the real offer, never introduce a new claim; (12) process_steps — write these whenever the genre's framework includes a process-timeline stage (most do); (13) stage_content — write one entry per remaining stage the genre's framework includes (video/benefits grid/problem-solution/before-after/included/comparison/callout), per that param's own field-mapping description; never include a testimonials entry unless the user gave you real quotes; (14) visual_archetype — ALWAYS pick one that matches this business's audience (see the DESIGN section above); omitting it skips Phase 2's design intelligence entirely and falls back to a plain, generic look, which defeats the point — only override its palette/typography/animation/CTA defaults when you have a genuine reason from what the user told you, not by default habit. Every genre's full stage sequence renders on the page regardless of which fields you fill — an unfilled stage shows placeholder/nothing, so fill every stage the genre actually has, not just headline/offer/faq. After creating, feel free to suggest one or two concrete improvements in your reply (e.g. a sharper headline angle, a stronger CTA placement, a trust element to add) — but only as a suggestion the user can act on, never as a score or grade.",
    parameters: {
      type: "object",
      properties: {
        funnel_name: {
          type: "string",
          description: "Short internal label for the funnel list. Defaults to the headline.",
        },
        genre: {
          type: "string",
          enum: ["lead_magnet", "vsl", "challenge", "application", "tripwire", "webinar", "lead_gen"],
        },
        eyebrow: {
          type: "string",
          description: "Small text above the headline, e.g. 'Your FREE copy will show you how to:'. Optional.",
        },
        headline: {
          type: "string",
          description:
            "Main hero headline, max 80 chars. A specific, concrete hook — not a generic tagline. Bad: 'Unlock Your Potential'. Good: 'Book 10 Qualified Calls a Week Without Cold DMs'.",
        },
        subheadline: {
          type: "string",
          description: "One-line subheadline under the headline. Keep it under 140 characters and make sure it reads as a complete sentence at that length — count as you write it, since anything longer gets cut off rather than wrapped. Optional.",
        },
        bullets: {
          type: "array",
          items: { type: "string" },
          description:
            "3-5 short phrases, each naming a specific outcome or mechanism, e.g. ['Done-in-a-day setup', 'No cold outreach', 'Works with any niche']. Never vague adjectives alone. Each item is ONE bullet — a phrase that itself contains a natural comma (e.g. 'Nail, ear, and paw prep') is still a single array item, not three.",
        },
        price_cents: {
          type: "number",
          description:
            "Offer price in cents (e.g. 4700 = $47). Only for tripwire/vsl/challenge genres with a real priced offer. Omit for a free lead magnet.",
        },
        cta_label: {
          type: "string",
          description: "Button text, e.g. 'Get instant access'. Omit for a sensible per-genre default.",
        },
        accent_color: {
          type: "string",
          description: "Hex color, e.g. '#2563eb'. Pick to match the brand/offer tone. Omit for the genre default.",
        },
        theme: { type: "string", enum: ["light", "dark"] },
        faq_items: {
          type: "array",
          description:
            "ONLY include if you have enough real detail from the user to answer honestly — omit entirely rather than invent generic filler Q&A.",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["question", "answer"],
            additionalProperties: false,
          },
        },
        include_capture_form: {
          type: "boolean",
          description:
            "Create a dedicated lead-capture form and wire it into the funnel's offer/registration section (or, for the one-fold lead_magnet genre, directly into the hero itself), plus a follow-up email + workflow that fires on submit. Default true — set false only for a pure paid-checkout page with no opt-in step.",
        },
        confirmation_email_subject: {
          type: "string",
          description: "Subject line for the auto-reply sent when someone submits the capture form. Omit for a sensible default.",
        },
        confirmation_email_body: {
          type: "string",
          description:
            "Body of the auto-reply email. Short, human, no fabricated claims. Format as 2-4 short paragraphs (1-3 sentences each) SEPARATED BY A REAL BLANK LINE — never one dense block of text, and never a numbered list crammed onto consecutive lines with no space between items; give each step/point its own line with a blank line before and after so it's easy to scan. Use an ACTUAL newline character between paragraphs — never write the literal two-character text \"\\n\" as part of the sentence itself (a real line break is what a blank line in the string produces, not typed backslash-n characters). The unsubscribe footer is added automatically — don't write your own.",
        },
        tag: {
          type: "string",
          description:
            "Tag applied to the contact when they submit the capture form, e.g. 'Website Assessment Requested'. Omit for a sensible default derived from the funnel name — this tag is what downstream broadcasts/voice-campaign audiences and other workflow triggers filter on.",
        },
        story_paragraphs: {
          type: "array",
          items: { type: "string" },
          description:
            "2-4 short paragraphs of real, specific 'why this works' copy for the funnel's Story section — the mechanism, the reasoning, what makes this different. Write it whenever the funnel's genre has a Story section (most genres do); synthesize it from the headline/bullets/offer you already wrote, don't invent new facts, customer names, or case studies that weren't given to you. Omit only if you truly have nothing substantive to add beyond the offer copy.",
        },
        story_byline: {
          type: "string",
          description:
            "Small label above the Story paragraphs, e.g. 'Why this works' or 'The story behind [business]'. NEVER a fabricated person's name/city (e.g. 'From: Jane Doe, Austin, TX') unless the user gave you a real customer to attribute it to. Omit for a sensible generic default.",
        },
        guarantee_headline: {
          type: "string",
          description:
            "Headline for a Guarantee section, e.g. '30-Day Money-Back Guarantee'. ONLY include if the user told you a real guarantee/refund policy they actually offer — never invent one. Omit entirely otherwise.",
        },
        guarantee_body: {
          type: "string",
          description: "1-2 sentences explaining the real guarantee terms. Required if guarantee_headline is set.",
        },
        trust_badges: {
          type: "array",
          items: { type: "string" },
          description:
            "Short trust-signal labels for a Trust Badges row, e.g. ['Secure checkout', 'Privacy protected']. Only include badges that are actually true of this funnel — e.g. only add a money-back-guarantee badge if guarantee_headline is also set. Safe generic ones like 'Secure checkout' and 'Privacy protected' are fine whenever there's a form or checkout. Omit if the genre has no Trust Badges section.",
        },
        cta_banner_headline: {
          type: "string",
          description:
            "Headline for a mid-page repeat-CTA banner section (VSL genre), restating the real offer/hook already established — not a new claim. Omit if the genre has no CTA Banner section.",
        },
        cta_banner_subtext: {
          type: "string",
          description: "One short supporting line under the CTA banner headline. Optional.",
        },
        layout_choices: {
          type: "object",
          description:
            "Override which layout fills a stage, where that stage allows alternates. Keys are the stage's DEFAULT section type (not a label — e.g. \"before_after\", \"guarantee\", \"problem_solution\"), values are the alternate section type to use instead. E.g. for 'application' genre, {\"before_after\": \"testimonials\"} uses real testimonials for the Results stage instead of the default Before/After — only do this when the user actually gave you real testimonials. Then describe that chosen layout's content in stage_content, keyed by the SAME resolved type (e.g. \"testimonials\", not \"before_after\"). Omit entirely to use each genre's recommended layout for every stage.",
          additionalProperties: { type: "string" },
        },
        process_steps: {
          type: "array",
          description:
            "Steps for the funnel's Process Timeline stage (used by most genres — 'How It Works', 'Agenda', 'Process', 'Challenge Schedule'). Each step needs a short title and 1-3 supporting bullets. Write these whenever the genre has this stage — a timeline with no steps reads as unfinished.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Optional short tag, e.g. 'Day 1' or 'Step 1'." },
              title: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
        stage_content: {
          type: "array",
          description:
            "Content for the funnel's other conversion-framework stages (Video, Benefits Grid, Problem/Solution, Before/After, What's Included, Comparison, Testimonials, Callout) — write ONE entry per stage the genre's framework actually includes (see the genre descriptions above), keyed by section_type = that stage's resolved section type. If a genre's framework lists BOTH benefits_grid and included (e.g. lead_magnet: 'What You'll Learn' AND 'What's Included'), write TWO separate entries, not one — they answer different questions (benefits_grid = the outcomes/knowledge the reader gains; included = the concrete deliverables/assets they receive) and skipping either leaves that section visibly blank on the page. Each entry's fields are used differently depending on section_type: " +
            "\"video\" — video_url (required), headline/text optional. " +
            "\"benefits_grid\" — headline optional, items[].title + items[].description (3-6 items, each a specific outcome the reader gets, never a vague adjective). " +
            "\"included\" — headline optional, items[].title + items[].description (3-6 concrete deliverables — what's literally in the box/download/program, OR for application genre's 'Who This Isn't For' stage, real disqualifying criteria). " +
            "\"problem_solution\" — headline+text describe the problem, secondary_headline+secondary_text describe the solution. " +
            "\"before_after\" — items with group 'before' or 'after' (items[].title is the line text); headline/secondary_headline are the two column labels. " +
            "\"comparison\" — items[].title is a feature name (assumes you have it and the generic alternative doesn't — never claim something false); headline is the section title. " +
            "\"callout\" — text is a single highlighted sentence restating something already established (e.g. the market opportunity/why-now) — not a new factual claim. " +
            "\"testimonials\" — ONLY include this entry if the user gave you REAL customer quotes. items[].quote/name/detail, verbatim, never invented. Omit the whole entry (not just leave items empty) if you have no real testimonials — do not choose the testimonials layout via layout_choices without this.",
          items: {
            type: "object",
            properties: {
              section_type: {
                type: "string",
                enum: ["video", "benefits_grid", "problem_solution", "before_after", "included", "comparison", "testimonials", "callout"],
                description: "Which layout this content is for — must match a section that will actually be in the funnel (a genre default, or what you chose via layout_choices).",
              },
              headline: { type: "string" },
              text: { type: "string" },
              secondary_headline: { type: "string" },
              secondary_text: { type: "string" },
              video_url: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    quote: { type: "string" },
                    name: { type: "string" },
                    detail: { type: "string" },
                    group: { type: "string", enum: ["before", "after"] },
                  },
                  additionalProperties: false,
                },
              },
            },
            required: ["section_type"],
            additionalProperties: false,
          },
        },
        value_stack: {
          type: "object",
          description:
            "For PRICED sales genres (tripwire, vsl) — the value stack that renders right before the offer/price. List the operator's REAL deliverables, each with an honest value, then a summed total and the real price. Use only real, defensible values — NEVER fabricate or pad the numbers (an inflated stack is a fabrication). Omit entirely for free genres (lead_magnet, lead_gen, webinar, application) — there's no price to anchor.",
          properties: {
            headline: { type: "string", description: "e.g. \"Here's everything you get\"." },
            items: {
              type: "array",
              description: "3-7 real deliverables the buyer actually receives, each with an honest value.",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "The deliverable, e.g. \"12-month roof warranty\"." },
                  description: { type: "string", description: "One short line on what it is/does. Optional." },
                  value: { type: "string", description: "Honest value string, e.g. \"$500\". Only real/defensible values, never invented." },
                },
                required: ["title"],
                additionalProperties: false,
              },
            },
            total_value_label: { type: "string", description: "The summed anchor, e.g. \"Total value: $2,970\" (shown struck-through)." },
            price_label: { type: "string", description: "The real price revealed beneath, e.g. \"Today: $497\"." },
            footnote: { type: "string", description: "Optional line under the price (e.g. a REAL guarantee restatement). Never invent a guarantee." },
          },
          additionalProperties: false,
        },
        design_pack: {
          type: "string",
          enum: ["classic", "executive", "bold", "premium", "startup", "local_business", "wellness"],
          description: "The visual design pack — see the DESIGN section above for which pack fits which audience. Omit for 'classic'.",
        },
        hero_layout: {
          type: "string",
          enum: ["centered", "split", "background_image", "founder_image", "browser_mockup", "phone_mockup"],
          description: "Hero section layout. Prefer omitting this and letting visual_archetype pick it — only set explicitly when you have a genuine reason (e.g. real media on hand) to deviate from the archetype's own recommendation. 'split'/'background_image'/'browser_mockup'/'phone_mockup' look best with real media (hero_media_url) but render an honest placeholder without one — never a fabricated screenshot.",
        },
        cta_style: {
          type: "string",
          enum: ["inline", "popup_form", "popup_calendar", "dual", "sticky_desktop", "floating_mobile", "phone"],
          description: "How the primary capture/offer CTA behaves. NEVER ask the user for a booking-page slug or phone number before building — that's exactly the kind of blocking question the tool's top-level instructions ban. Only set this to 'popup_calendar' or 'phone' when the user has ALREADY volunteered a real slug/number earlier in the conversation; otherwise omit this entirely (or set 'popup_form') and the funnel safely defaults to a lead-capture form + follow-up email — the operator connects their calendar/number afterward, no live page is ever broken by omitting it. 'dual' needs cta_secondary_label + cta_secondary_href.",
        },
        cta_secondary_label: { type: "string", description: "Only used with cta_style 'dual'." },
        cta_secondary_href: { type: "string", description: "Only used with cta_style 'dual'." },
        cta_phone_number: {
          type: "string",
          description: "Real phone number in E.164 format (e.g. '+15551234567'), only used with cta_style 'phone'. Never ask for one before building — omit cta_style/leave it as popup_form if you don't have a real number; only set cta_style to 'phone' when the user already gave you one.",
        },
        cta_booking_page_slug: {
          type: "string",
          description: "A real booking-page slug the user already gave you (from /b/[subAccountId]/[slug]), only used with cta_style 'popup_calendar'. Never ask for one before building. Without it, 'popup_calendar' is impossible to configure from this tool, so the CTA falls back to popup_form regardless of what cta_style/the archetype recommends — the operator can switch to a real calendar in the builder once they have a booking page.",
        },
        visual_archetype: {
          type: "string",
          enum: [
            "direct_response",
            "local_service",
            "saas_technology",
            "luxury_premium",
            "nonprofit_mission",
            "coach_consultant",
            "wellness",
            "agency_creative",
            "professional_enterprise",
          ],
          description: "The industry-aware visual design system for the whole page — see the DESIGN section above. ALWAYS set this for a new funnel; it resolves a full, professionally-constrained token set (palette, typography, card geometry, icon style, density, background rhythm, animation, hero layout, CTA) in one shot. DEFAULT to 'direct_response' for sales/lead conversion pages (the bold, high-converting look) unless the business clearly calls for a softer aesthetic (luxury, wellness, nonprofit).",
        },
        palette_variant: {
          type: "string",
          description: "One of the chosen archetype's own named palettes (see the DESIGN section, e.g. 'trust_blue'/'warm_amber'/'grounded_green' for local_service). Omit to use the archetype's first/default palette. An id that doesn't belong to the chosen archetype is ignored.",
        },
        color_mode: {
          type: "string",
          enum: ["light", "dark", "mixed"],
          description: "Only meaningful for archetypes that support more than one (mainly saas_technology, luxury_premium). Omit to use the chosen palette's own default.",
        },
        typography_pairing: {
          type: "string",
          enum: ["sans_classic", "sans_modern", "serif_editorial", "serif_display", "mono_technical"],
          description: "Only honored if it's one of the chosen archetype's approved pairings. Omit to use the archetype's default.",
        },
        animation_level: {
          type: "string",
          enum: ["none", "minimal", "moderate", "expressive"],
          description: "Reveal-on-scroll animation intensity. Omit to use the archetype's own default (most are minimal/none; agency_creative defaults to expressive, saas_technology to moderate). Never pick a level higher than the archetype's own character calls for.",
        },
        visual_density: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Section spacing/breathing room. Omit to use the archetype's own default.",
        },
        media_strategy: {
          type: "string",
          enum: [
            "founder_photo",
            "team_photo",
            "community_photo",
            "service_photo",
            "product_screenshot",
            "dashboard_screenshot",
            "browser_mockup",
            "phone_mockup",
            "video",
            "illustration",
            "abstract",
            "none",
          ],
          description: "What kind of media the hero/founder area wants. Omit to use the archetype's own default. When real media isn't available (see hero_media_url), Zeno shows an honest labeled placeholder for this media type rather than nothing or a fabricated image.",
        },
        hero_media_url: {
          type: "string",
          description: "A REAL image/video URL the user gave you (screenshot, founder photo, product shot). Never invent or guess a URL. Omit if you don't have one — the hero shows an honest placeholder instead.",
        },
        hero_media_type: { type: "string", enum: ["image", "video"], description: "Only used with hero_media_url. Omit to default to 'image'." },
        media_subject: {
          type: "string",
          description: "A SPECIFIC description of what the placeholder photo should show, written for the operator, not the visitor — e.g. 'Technician repairing an HVAC unit' or 'You speaking at a recent event', not a generic 'a photo'. Only used when hero_media_url is omitted (no real media yet); shown next to the placeholder in the builder as a shooting brief, never on the public page. Write this whenever media_strategy implies a real photo (service_photo/team_photo/community_photo/founder_photo) — skip for dashboard/product screenshots (there's nothing to 'shoot').",
        },
        gallery_layout: {
          type: "string",
          enum: ["grid", "masonry", "carousel", "before_after"],
          description: "Only relevant when the archetype's media strategy calls for MULTIPLE real photos (service_photo/team_photo/community_photo) — Zeno then adds a dedicated photo-gallery section (see media_strategy) instead of a single hero image, freeing the hero for a clean headline/logo. Omit to use the archetype's own recommended gallery layout.",
        },
      },
      required: ["headline", "bullets"],
      additionalProperties: false,
    },
    validate: (rawIn) => {
      // Confirm round-trips the camelCase `args` this validate() itself
      // returns (the chat route validates the LLM's raw snake_case tool
      // call; the confirm route then re-validates THAT already-normalized
      // result) — so every renamed field must be read under both its
      // original snake_case key and its own camelCase output key. Same
      // pattern create_website's validate() uses, for the same reason.
      const rawObj = (rawIn ?? {}) as Record<string, unknown>;
      const camelToSnake: Record<string, string> = {
        funnelName: "funnel_name",
        priceCents: "price_cents",
        ctaLabel: "cta_label",
        accentColor: "accent_color",
        faqItems: "faq_items",
        includeCaptureForm: "include_capture_form",
        confirmationEmailSubject: "confirmation_email_subject",
        confirmationEmailBody: "confirmation_email_body",
        storyParagraphs: "story_paragraphs",
        storyByline: "story_byline",
        guaranteeHeadline: "guarantee_headline",
        guaranteeBody: "guarantee_body",
        trustBadges: "trust_badges",
        ctaBannerHeadline: "cta_banner_headline",
        ctaBannerSubtext: "cta_banner_subtext",
        layoutChoices: "layout_choices",
        processSteps: "process_steps",
        stageContent: "stage_content",
        designPack: "design_pack",
        heroLayout: "hero_layout",
        ctaStyle: "cta_style",
        ctaSecondaryLabel: "cta_secondary_label",
        ctaSecondaryHref: "cta_secondary_href",
        ctaPhoneNumber: "cta_phone_number",
        ctaBookingPageSlug: "cta_booking_page_slug",
        visualArchetype: "visual_archetype",
        paletteVariant: "palette_variant",
        colorMode: "color_mode",
        typographyPairing: "typography_pairing",
        animationLevel: "animation_level",
        visualDensity: "visual_density",
        mediaStrategy: "media_strategy",
        heroMediaUrl: "hero_media_url",
        heroMediaType: "hero_media_type",
        mediaSubject: "media_subject",
        galleryLayout: "gallery_layout",
      };
      const raw: Record<string, unknown> = { ...rawObj };
      for (const [camel, snake] of Object.entries(camelToSnake)) {
        if (raw[snake] === undefined && camel in rawObj) {
          raw[snake] = rawObj[camel];
        }
      }

      const headline = str(raw, "headline");
      if (!headline || headline.length > 80) {
        return { ok: false, error: "a headline (max 80 characters) is required" };
      }
      // Accepts BOTH the LLM's original comma-separated string AND this
      // validate()'s own previously-normalized array output.
      const bulletsIn = raw.bullets;
      const bulletsList = Array.isArray(bulletsIn)
        ? bulletsIn.filter((b): b is string => typeof b === "string")
        : str(raw, "bullets")
            .split(",")
            .map((b) => b.trim())
            .filter(Boolean);
      if (bulletsList.length === 0) {
        return { ok: false, error: "at least one bullet point is required" };
      }
      const genreRaw = str(raw, "genre");
      const validGenres = ["lead_magnet", "vsl", "challenge", "application", "tripwire", "webinar", "lead_gen"];
      const genre = validGenres.includes(genreRaw) ? genreRaw : "lead_magnet";

      const priceCentsRaw = raw.price_cents;
      let priceCents: number | null = null;
      if (priceCentsRaw !== undefined && priceCentsRaw !== null) {
        const n = Number(priceCentsRaw);
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, error: "price_cents must be a non-negative number" };
        }
        priceCents = Math.round(n);
      }

      // Cosmetic + optional — an invalid value (a named color, 3-digit
      // shorthand, missing '#', etc.) degrades to "use the genre default"
      // rather than rejecting the whole funnel, matching how
      // create_website's enumOr() falls back instead of hard-failing on an
      // optional design field the model got slightly wrong.
      const accentColorRaw = str(raw, "accent_color");
      const sixDigitMatch = accentColorRaw.match(/^#?([0-9a-f]{6})$/i);
      const threeDigitMatch = accentColorRaw.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
      const accentColor = sixDigitMatch
        ? `#${sixDigitMatch[1]}`
        : threeDigitMatch
          ? `#${threeDigitMatch[1]}${threeDigitMatch[1]}${threeDigitMatch[2]}${threeDigitMatch[2]}${threeDigitMatch[3]}${threeDigitMatch[3]}`
          : "";
      const theme = str(raw, "theme") === "dark" ? "dark" : str(raw, "theme") === "light" ? "light" : null;

      const faqRaw = Array.isArray(raw.faq_items) ? raw.faq_items : [];
      const faqItems = faqRaw
        .filter(
          (i): i is { question: string; answer: string } =>
            !!i &&
            typeof (i as Record<string, unknown>).question === "string" &&
            typeof (i as Record<string, unknown>).answer === "string",
        )
        .slice(0, 10)
        .map((i) => ({ question: i.question.slice(0, 200), answer: i.answer.slice(0, 1000) }));

      const funnelName = str(raw, "funnel_name").slice(0, 60);
      const tag = (str(raw, "tag") || `${funnelName || headline} requested`).slice(0, 40);

      const storyRaw = raw.story_paragraphs;
      const storyParagraphs = (
        Array.isArray(storyRaw) ? storyRaw.filter((p): p is string => typeof p === "string") : []
      )
        .slice(0, 4)
        .map((p) => fixLiteralNewlines(p).slice(0, 800));

      // guarantee_body is required whenever guarantee_headline is set — a
      // headline with no real terms behind it is worse than no guarantee
      // section at all, so treat a missing body as "no guarantee given."
      const guaranteeHeadlineRaw = str(raw, "guarantee_headline").slice(0, 80);
      const guaranteeBodyRaw = fixLiteralNewlines(str(raw, "guarantee_body")).slice(0, 500);
      const guaranteeHeadline = guaranteeBodyRaw ? guaranteeHeadlineRaw : "";
      const guaranteeBody = guaranteeHeadlineRaw ? guaranteeBodyRaw : "";

      const trustBadgesRaw = raw.trust_badges;
      const trustBadges = (
        Array.isArray(trustBadgesRaw) ? trustBadgesRaw.filter((b): b is string => typeof b === "string") : []
      )
        .slice(0, 5)
        .map((b) => b.slice(0, 40));

      // Sanitized only — the actual per-stage alternates check happens in
      // buildFrameworkSections() at execute() time (an invalid/unknown
      // stage id or layout silently falls back to that stage's default),
      // so this just bounds size/type.
      const layoutChoicesRaw = raw.layout_choices;
      const layoutChoices: Record<string, string> =
        layoutChoicesRaw && typeof layoutChoicesRaw === "object" && !Array.isArray(layoutChoicesRaw)
          ? Object.fromEntries(
              Object.entries(layoutChoicesRaw as Record<string, unknown>)
                .filter((e): e is [string, string] => typeof e[1] === "string")
                .slice(0, 9)
                .map(([k, v]) => [k.slice(0, 40), v.slice(0, 40)]),
            )
          : {};

      const processStepsRaw = Array.isArray(raw.process_steps) ? raw.process_steps : [];
      const processSteps = processStepsRaw
        .filter(
          (s): s is { label?: string; title: string; bullets?: string[] } =>
            !!s && typeof (s as Record<string, unknown>).title === "string",
        )
        .slice(0, 8)
        .map((s) => ({
          label: typeof s.label === "string" ? s.label.slice(0, 20) : "",
          title: s.title.slice(0, 80),
          bullets: Array.isArray(s.bullets)
            ? s.bullets.filter((b): b is string => typeof b === "string").slice(0, 5).map((b) => b.slice(0, 200))
            : [],
        }));

      // Round-trip note: array-item fields hit the same camelCase-vs-snake_case
      // issue as top-level params (the confirm route re-validates THIS
      // function's own camelCase output) — read each multi-word field under
      // both spellings, same reasoning as the top-level camelToSnake block.
      const s1 = (s: Record<string, unknown>, snake: string, camel: string): string => {
        const v = s[snake] ?? s[camel];
        return typeof v === "string" ? v : "";
      };
      const stageContentRaw = Array.isArray(raw.stage_content) ? raw.stage_content : [];
      const stageContent = stageContentRaw
        .filter((s): s is Record<string, unknown> => !!s && !!s1(s as Record<string, unknown>, "section_type", "sectionType"))
        .slice(0, 9)
        .map((s) => ({
          sectionType: s1(s, "section_type", "sectionType").slice(0, 40),
          headline: s1(s, "headline", "headline").slice(0, 100),
          text: fixLiteralNewlines(s1(s, "text", "text")).slice(0, 800),
          secondaryHeadline: s1(s, "secondary_headline", "secondaryHeadline").slice(0, 100),
          secondaryText: fixLiteralNewlines(s1(s, "secondary_text", "secondaryText")).slice(0, 800),
          videoUrl: s1(s, "video_url", "videoUrl").slice(0, 500),
          items: (Array.isArray(s.items) ? s.items : [])
            .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
            .slice(0, 8)
            .map((i) => ({
              title: typeof i.title === "string" ? i.title.slice(0, 80) : "",
              description: typeof i.description === "string" ? fixLiteralNewlines(i.description).slice(0, 300) : "",
              quote: typeof i.quote === "string" ? fixLiteralNewlines(i.quote).slice(0, 500) : "",
              name: typeof i.name === "string" ? i.name.slice(0, 60) : "",
              detail: typeof i.detail === "string" ? i.detail.slice(0, 100) : "",
              group: i.group === "before" || i.group === "after" ? i.group : undefined,
            })),
        }));

      // Value stack (priced sales genres) — real deliverables + honest values,
      // an anchor total, and the price reveal. Parsed defensively like
      // stage_content; empty/absent leaves the section blank (renders nothing).
      const vsRaw = raw.value_stack && typeof raw.value_stack === "object" ? (raw.value_stack as Record<string, unknown>) : null;
      const vsStr = (o: Record<string, unknown>, snake: string, camel: string, cap: number): string => {
        const v = o[snake] ?? o[camel];
        return (typeof v === "string" ? v : "").slice(0, cap);
      };
      const valueStack = vsRaw
        ? {
            headline: vsStr(vsRaw, "headline", "headline", 100),
            items: (Array.isArray(vsRaw.items) ? vsRaw.items : [])
              .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
              .slice(0, 8)
              .map((i) => ({
                title: typeof i.title === "string" ? i.title.slice(0, 80) : "",
                description: typeof i.description === "string" ? fixLiteralNewlines(i.description).slice(0, 200) : "",
                value: typeof i.value === "string" ? i.value.slice(0, 24) : "",
              }))
              .filter((i) => i.title),
            totalValueLabel: vsStr(vsRaw, "total_value_label", "totalValueLabel", 60),
            priceLabel: vsStr(vsRaw, "price_label", "priceLabel", 60),
            footnote: vsStr(vsRaw, "footnote", "footnote", 160),
          }
        : null;

      const DESIGN_PACK_IDS = ["classic", "executive", "bold", "premium", "startup", "local_business", "wellness"];
      const designPackRaw = str(raw, "design_pack");
      const designPack = DESIGN_PACK_IDS.includes(designPackRaw) ? designPackRaw : "classic";

      const HERO_LAYOUTS = ["centered", "split", "background_image", "founder_image", "browser_mockup", "phone_mockup"];
      const heroLayoutRaw = str(raw, "hero_layout");
      const heroLayout = HERO_LAYOUTS.includes(heroLayoutRaw) ? heroLayoutRaw : "";

      // Left "" (not defaulted here) when omitted/invalid — execute() is
      // the one place that decides the effective default, since the RIGHT
      // default depends on whether an archetype resolved: an archetype's
      // OWN recommended CTA (e.g. local_service -> popup_calendar) must
      // win over the generic "popup_form everywhere" fallback, which only
      // applies when no archetype was resolved at all. Defaulting to
      // "popup_form" here (as an earlier version did) would make every
      // omitted cta_style look like an EXPLICIT "popup_form" request by
      // the time resolveDesignStrategy sees it — silently overriding every
      // archetype's own CTA recommendation, which is exactly backwards.
      const CTA_STYLES = ["inline", "popup_form", "popup_calendar", "dual", "sticky_desktop", "floating_mobile", "phone"];
      const ctaStyleRaw = str(raw, "cta_style");
      const ctaStyle = CTA_STYLES.includes(ctaStyleRaw) ? ctaStyleRaw : "";

      // Phase 2 — Design Intelligence. Every value here is either a real
      // enum member (validated against the archetype catalog's own lists)
      // or ignored, same discipline as every other enum param on this tool.
      const visualArchetypeRaw = str(raw, "visual_archetype");
      const visualArchetype = VISUAL_ARCHETYPE_IDS.includes(visualArchetypeRaw as VisualArchetype) ? visualArchetypeRaw : "";
      const paletteVariant = str(raw, "palette_variant").slice(0, 60);
      const colorModeRaw = str(raw, "color_mode");
      const colorMode = colorModeRaw === "light" || colorModeRaw === "dark" || colorModeRaw === "mixed" ? colorModeRaw : "";
      const typographyPairingRaw = str(raw, "typography_pairing");
      const typographyPairing = typographyPairingRaw in TYPOGRAPHY_PAIRINGS ? typographyPairingRaw : "";
      const ANIMATION_LEVELS = ["none", "minimal", "moderate", "expressive"];
      const animationLevelRaw = str(raw, "animation_level");
      const animationLevel = ANIMATION_LEVELS.includes(animationLevelRaw) ? animationLevelRaw : "";
      const VISUAL_DENSITIES = ["low", "medium", "high"];
      const visualDensityRaw = str(raw, "visual_density");
      const visualDensity = VISUAL_DENSITIES.includes(visualDensityRaw) ? visualDensityRaw : "";
      const MEDIA_STRATEGIES = [
        "founder_photo",
        "team_photo",
        "community_photo",
        "service_photo",
        "product_screenshot",
        "dashboard_screenshot",
        "browser_mockup",
        "phone_mockup",
        "video",
        "illustration",
        "abstract",
        "none",
      ];
      const mediaStrategyRaw = str(raw, "media_strategy");
      const mediaStrategy = MEDIA_STRATEGIES.includes(mediaStrategyRaw) ? mediaStrategyRaw : "";
      const heroMediaUrl = str(raw, "hero_media_url").trim().slice(0, 1000);
      const heroMediaTypeRaw = str(raw, "hero_media_type");
      const heroMediaType = heroMediaTypeRaw === "video" ? "video" : "image";
      const ctaPhoneNumber = str(raw, "cta_phone_number").trim().slice(0, 20);
      const ctaBookingPageSlug = str(raw, "cta_booking_page_slug").trim().slice(0, 80);
      const mediaSubject = str(raw, "media_subject").trim().slice(0, 100);
      const GALLERY_LAYOUTS = ["grid", "masonry", "carousel", "before_after"];
      const galleryLayoutRaw = str(raw, "gallery_layout");
      const galleryLayout = GALLERY_LAYOUTS.includes(galleryLayoutRaw) ? galleryLayoutRaw : "";

      return {
        ok: true,
        args: {
          funnelName,
          genre,
          eyebrow: truncateAtWord(str(raw, "eyebrow"), 100),
          headline,
          subheadline: truncateAtWord(str(raw, "subheadline"), 140),
          bullets: bulletsList.slice(0, 6),
          priceCents,
          ctaLabel: str(raw, "cta_label").slice(0, 40),
          accentColor,
          theme,
          faqItems,
          includeCaptureForm: (raw as Record<string, unknown>)?.include_capture_form !== false,
          confirmationEmailSubject: truncateAtWord(str(raw, "confirmation_email_subject"), 120),
          confirmationEmailBody: fixLiteralNewlines(str(raw, "confirmation_email_body")).slice(0, 2000),
          tag,
          storyParagraphs,
          storyByline: str(raw, "story_byline").slice(0, 60),
          guaranteeHeadline,
          guaranteeBody,
          trustBadges,
          ctaBannerHeadline: str(raw, "cta_banner_headline").slice(0, 80),
          ctaBannerSubtext: truncateAtWord(str(raw, "cta_banner_subtext"), 140),
          layoutChoices,
          processSteps,
          stageContent,
          valueStack,
          designPack,
          heroLayout,
          ctaStyle,
          ctaSecondaryLabel: str(raw, "cta_secondary_label").slice(0, 40),
          ctaSecondaryHref: str(raw, "cta_secondary_href").slice(0, 500),
          ctaPhoneNumber,
          ctaBookingPageSlug,
          visualArchetype,
          paletteVariant,
          colorMode,
          typographyPairing,
          animationLevel,
          visualDensity,
          mediaStrategy,
          heroMediaUrl,
          heroMediaType,
          mediaSubject,
          galleryLayout,
        },
      };
    },
    summarize: (args) => {
      const genreLabels: Record<string, string> = {
        lead_magnet: "Lead Magnet",
        vsl: "VSL",
        challenge: "Challenge",
        application: "Application",
        tripwire: "Tripwire",
        webinar: "Webinar",
        lead_gen: "Lead Gen",
      };
      const willPackage = args.includeCaptureForm !== false && args.priceCents === null;
      const packageNote = willPackage
        ? " Also builds the connected Growth System: a capture form, a confirmation email, and a workflow that creates an Opportunity, tags the contact, sends the confirmation, notifies you, and leaves a follow-up task — all in draft/review state, nothing live automatically."
        : "";
      return `Create a DRAFT ${genreLabels[args.genre as string] ?? args.genre} funnel “${
        args.funnelName || args.headline
      }” with headline “${args.headline}”.${packageNote} You'll review and publish/activate everything yourself.`;
    },
    execute: async (ctx, args) => {
      const subAccountId = ctx.subAccountId!;
      const db = getAdminDb();
      const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
      if (subSnap.data()?.funnelsEnabledByAgency !== true) {
        throw new CapabilityUserError(
          "Funnels aren't enabled for this workspace. Ask the agency owner to turn it on first.",
        );
      }

      const genre = args.genre as
        | "lead_magnet"
        | "vsl"
        | "challenge"
        | "application"
        | "tripwire"
        | "webinar"
        | "lead_gen";
      const layoutChoices = (args.layoutChoices as Record<string, string>) ?? {};
      const designPack = (args.designPack as DesignPackId) || "classic";
      // Phase 2 — Design Intelligence. When the model picked a
      // visual_archetype, resolve the FULL token set here (once) so both
      // creation (accent/theme) and the section-content pass below (hero
      // layout, CTA strategy, media placeholders) read from the same
      // resolved strategy — never two independent decisions that could
      // disagree with each other.
      // EVERY AI-generated funnel gets the bold direct-response sales-letter
      // look — funnels convert best that way, so we do NOT defer to the model's
      // archetype pick (it kept choosing light looks: wellness for a med spa,
      // coach_consultant for leadership, local_service for a roofer). A soft /
      // premium / website look is website-mode's job (separate); the operator
      // can also switch the archetype in the builder. A real CTA fact (a phone
      // number or booking slug the operator gave) is still honored so call-now /
      // booking survive the bold default.
      const effectiveArchetype = "direct_response" as VisualArchetype;
      const designStrategy = resolveDesignStrategy(effectiveArchetype, {
        ctaStrategy: ((args.ctaStyle as string) || undefined) as CtaStrategyId | undefined,
      });
      const funnelId = await createFunnelServerSide({
        subAccountId,
        createdByUid: ctx.uid,
        name: (args.funnelName as string) || (args.headline as string),
        genre,
        stageOverrides: layoutChoices as Record<string, FunnelSectionType>,
        designPack,
        designStrategy,
      });

      const created = await getFunnel(subAccountId, funnelId);
      if (!created) {
        throw new CapabilityUserError("Something went wrong creating the funnel.");
      }

      // stage_content entries are keyed by the RESOLVED section type (not an
      // opaque stage id the model would have to invent correctly) — every
      // genre framework uses each section type at most once, so this is an
      // unambiguous match. An earlier stage-id-keyed design reliably failed
      // in live testing (2026-08-02): the model never had a way to know the
      // exact id strings, so every new-layout section came back empty.
      const stageContent = (args.stageContent as {
        sectionType: string;
        headline: string;
        text: string;
        secondaryHeadline: string;
        secondaryText: string;
        videoUrl: string;
        items: { title: string; description: string; quote: string; name: string; detail: string; group?: "before" | "after" }[];
      }[]) ?? [];
      const contentFor = (sectionType: string) => stageContent.find((c) => c.sectionType === sectionType);
      const processSteps = (args.processSteps as { label: string; title: string; bullets: string[] }[]) ?? [];

      const bullets = args.bullets as string[];
      const faqItems = args.faqItems as { question: string; answer: string }[];
      const storyParagraphs = args.storyParagraphs as string[];
      const storyByline = args.storyByline as string;
      const guaranteeHeadline = args.guaranteeHeadline as string;
      const guaranteeBody = args.guaranteeBody as string;
      const trustBadges = args.trustBadges as string[];
      const ctaBannerHeadline = args.ctaBannerHeadline as string;
      const ctaBannerSubtext = args.ctaBannerSubtext as string;
      // An archetype's own resolved hero layout/CTA strategy takes priority
      // over the raw params (which resolveDesignStrategy already folded in
      // as overrides above) — falling back to the raw values, unchanged,
      // when no archetype was resolved (today's exact pre-Phase-2 behavior).
      const heroLayout = designStrategy?.heroLayout ?? (args.heroLayout as string);
      // designStrategy.ctaStrategy (when an archetype resolved) already
      // incorporated any explicit args.ctaStyle override during
      // resolveDesignStrategy() above, and always returns a real value —
      // so it wins outright. Only the NO-archetype legacy path falls back
      // to the standing "popup_form everywhere" default when ctaStyle
      // wasn't explicitly set.
      const rawCtaStyle = designStrategy?.ctaStrategy ?? ((args.ctaStyle as string) || "popup_form");
      // create_funnel can only ever make "popup_calendar"/"phone" fully
      // functional when the user already gave a real slug/number in this
      // conversation (cta_booking_page_slug / cta_phone_number) — without
      // one, storing that style anyway would look configured in the
      // builder but silently do nothing until the operator fixes it.
      // Falling back to "popup_form" here (rather than asking the user for
      // the missing slug/number before building) is what lets the model
      // omit cta_style entirely and never have to block on it — the
      // funnel is always fully working the moment it's created.
      const ctaStyle =
        rawCtaStyle === "popup_calendar" && !args.ctaBookingPageSlug
          ? "popup_form"
          : rawCtaStyle === "phone" && !args.ctaPhoneNumber
            ? "popup_form"
            : rawCtaStyle;
      // Some genres (currently just lead_magnet, RC 1.1's one-fold length
      // pass) put isCapture on the hero stage itself rather than a
      // separate offer/ticket_tiers stage — the hero IS the whole page.
      const heroIsCaptureStage = FUNNEL_FRAMEWORKS[genre].some((s) => s.section === "hero" && s.isCapture);
      const ctaExtras =
        ctaStyle && ctaStyle !== "inline"
          ? {
              style: ctaStyle as NonNullable<HeroConfig["cta"]>["style"],
              ...(ctaStyle === "dual"
                ? {
                    secondaryLabel: (args.ctaSecondaryLabel as string) || "Learn more",
                    secondaryHref: (args.ctaSecondaryHref as string) || "#",
                  }
                : {}),
              ...(ctaStyle === "phone" && args.ctaPhoneNumber ? { phoneNumber: args.ctaPhoneNumber as string } : {}),
              ...(ctaStyle === "popup_calendar" && args.ctaBookingPageSlug ? { bookingPageSlug: args.ctaBookingPageSlug as string } : {}),
              // Popup-style intelligence: reinforce the offer with the
              // bullets Zeno already wrote instead of a bare form-in-a-box
              // — free, since the copy already exists. Gated to
              // medium/high-density archetypes only (saas_technology,
              // agency_creative, nonprofit_mission, coach_consultant,
              // professional_enterprise) — low-density archetypes
              // (luxury_premium, wellness, local_service) keep a plain
              // centered popup, matching their restrained/minimal
              // character; no archetype at all (legacy path) also stays
              // plain, unchanged from pre-Phase-3 behavior.
              ...(ctaStyle === "popup_form" &&
              bullets.length > 0 &&
              (designStrategy?.visualDensity === "medium" || designStrategy?.visualDensity === "high")
                ? { popupLayout: "split_benefits" as const, popupBenefits: bullets.slice(0, 4), popupHeadline: args.headline as string }
                : {}),
            }
          : undefined;
      // Media strategy — an honest labeled placeholder when the archetype
      // expects real media but none was supplied (never a fabricated
      // screenshot/photo). Only kicks in when a strategy was actually
      // resolved; a plain (no-archetype) funnel behaves exactly as before.
      const MEDIA_PLACEHOLDER_LABELS: Partial<Record<MediaStrategyId, string>> = {
        founder_photo: "Add your photo",
        team_photo: "Add a team photo",
        community_photo: "Add a community photo",
        service_photo: "Add a photo of your work",
        product_screenshot: "Add a product screenshot",
        dashboard_screenshot: "Add a dashboard screenshot",
        browser_mockup: "Add a product screenshot",
        phone_mockup: "Add a screenshot",
        video: "Add a video",
      };
      // Shooting-brief purpose/size — fixed per media strategy (not
      // model-authored; these don't vary business to business the way the
      // SUBJECT does). Only strategies with a real placeholder above need
      // an entry.
      const MEDIA_PURPOSE: Partial<Record<MediaStrategyId, string>> = {
        founder_photo: "Establish credibility and a real face behind the business",
        team_photo: "Show the real people the visitor would work with",
        community_photo: "Build trust through real, specific proof",
        service_photo: "Build trust before the CTA",
        product_screenshot: "Show the product in action",
        dashboard_screenshot: "Show the product in action",
        browser_mockup: "Show the product in action",
        phone_mockup: "Show the product in action",
      };
      const MEDIA_SIZE: Partial<Record<MediaStrategyId, string>> = {
        founder_photo: "800×800",
        team_photo: "800×800",
        community_photo: "1600×900",
        service_photo: "1600×900",
        product_screenshot: "1600×1000",
        dashboard_screenshot: "1600×1000",
        browser_mockup: "1600×1000",
        phone_mockup: "750×1334",
      };
      const mediaSubject = (args.mediaSubject as string) || "";
      function mediaBrief(strategy: MediaStrategyId | undefined): string | undefined {
        if (!strategy) return undefined;
        const purpose = MEDIA_PURPOSE[strategy];
        const size = MEDIA_SIZE[strategy];
        const parts = [mediaSubject || undefined, purpose ? `Purpose: ${purpose}` : undefined, size ? `Recommended ${size}` : undefined].filter(
          Boolean,
        );
        return parts.length > 0 ? parts.join(" · ") : undefined;
      }
      const heroMediaUrl = (args.heroMediaUrl as string) || "";
      const heroMediaType = (args.heroMediaType as string) === "video" ? "video" : "image";
      const resolvedMediaStrategy = designStrategy?.mediaStrategy;
      // These three strategies mean "show MULTIPLE real examples," not one
      // hero image — Zeno routes them to a dedicated photo_gallery section
      // instead (added below, after `nextSections` is built) so the hero
      // stays a clean headline with room for the operator's real logo
      // above it, and the operator can keep adding photos independently.
      const MULTI_PHOTO_STRATEGIES: MediaStrategyId[] = ["service_photo", "team_photo", "community_photo"];
      const wantsGallerySection = !!resolvedMediaStrategy && MULTI_PHOTO_STRATEGIES.includes(resolvedMediaStrategy);
      const heroMediaPlaceholder =
        !heroMediaUrl && resolvedMediaStrategy && !wantsGallerySection
          ? MEDIA_PLACEHOLDER_LABELS[resolvedMediaStrategy]
          : undefined;
      const heroMediaBrief = heroMediaPlaceholder ? mediaBrief(resolvedMediaStrategy) : undefined;
      const nextSections = created.sections.map((section): FunnelSection => {
        const content = contentFor(section.type);
        if (section.type === "hero") {
          return {
            ...section,
            config: {
              ...(section.config as HeroConfig),
              ...(args.eyebrow ? { eyebrow: args.eyebrow as string } : {}),
              headline: args.headline as string,
              ...(args.subheadline ? { subheadline: args.subheadline as string } : {}),
              ...(heroLayout ? { layout: heroLayout as HeroConfig["layout"] } : {}),
              // One-fold genres (e.g. lead_magnet) carry the offer directly
              // on the hero — same bullets/CTA every other genre puts on
              // its offer section, since there's no separate offer stage
              // to hold them.
              ...(heroIsCaptureStage ? { bullets, ...(args.ctaLabel ? { ctaLabel: args.ctaLabel as string } : {}) } : {}),
              ...(ctaExtras ? { cta: ctaExtras } : {}),
              ...(heroMediaUrl
                ? { mediaUrl: heroMediaUrl, mediaType: heroMediaType as HeroConfig["mediaType"] }
                : heroMediaPlaceholder
                  ? {
                      mediaType: heroMediaType as HeroConfig["mediaType"],
                      mediaPlaceholderLabel: heroMediaPlaceholder,
                      ...(heroMediaBrief ? { mediaPlaceholderBrief: heroMediaBrief } : {}),
                    }
                  : {}),
            },
          };
        }
        if (section.type === "offer") {
          return {
            ...section,
            config: {
              ...section.config,
              bullets,
              ...(args.priceCents !== null ? { priceCents: args.priceCents as number } : {}),
              ...(args.ctaLabel ? { ctaLabel: args.ctaLabel as string } : {}),
              ...(ctaExtras ? { cta: ctaExtras } : {}),
            },
          };
        }
        if (section.type === "value_stack") {
          const vs = args.valueStack as {
            headline: string;
            items: { title: string; description: string; value: string }[];
            totalValueLabel: string;
            priceLabel: string;
            footnote: string;
          } | null;
          if (vs && vs.items.length > 0) {
            return {
              ...section,
              config: {
                ...(vs.headline ? { headline: vs.headline } : {}),
                items: vs.items.map((i) => ({
                  title: i.title,
                  ...(i.description ? { description: i.description } : {}),
                  ...(i.value ? { value: i.value } : {}),
                })),
                ...(vs.totalValueLabel ? { totalValueLabel: vs.totalValueLabel } : {}),
                ...(vs.priceLabel ? { priceLabel: vs.priceLabel } : {}),
                ...(vs.footnote ? { footnote: vs.footnote } : {}),
              },
            };
          }
          // No stack supplied → leave the section's empty default (renders nothing).
          return section;
        }
        if (section.type === "faq" && faqItems.length > 0) {
          return { ...section, config: { items: faqItems } };
        }
        if (section.type === "story" && storyParagraphs.length > 0) {
          return {
            ...section,
            config: {
              ...section.config,
              paragraphs: storyParagraphs,
              ...(storyByline ? { byline: storyByline } : {}),
              // Founder-forward archetypes (coach_consultant) want a real
              // founder photo here; an honest placeholder when none was
              // given, reusing the same media signal as the hero's.
              ...(heroMediaUrl
                ? { photoUrl: heroMediaUrl }
                : resolvedMediaStrategy === "founder_photo" && heroMediaPlaceholder
                  ? {
                      photoPlaceholderLabel: heroMediaPlaceholder,
                      ...(heroMediaBrief ? { photoPlaceholderBrief: heroMediaBrief } : {}),
                    }
                  : {}),
            },
          };
        }
        // Deliberately excluded: proof_strip (its rating/logos variants need
        // a real numeric score or real client logos — nothing here can fill
        // those honestly) and countdown (a deadline the AI invents is
        // fabricated urgency, exactly what this tool's own instructions ban
        // elsewhere). Both stay at their neutral seed defaults.
        if (section.type === "guarantee" && guaranteeHeadline && guaranteeBody) {
          return { ...section, config: { ...section.config, headline: guaranteeHeadline, bodyText: guaranteeBody } };
        }
        if (section.type === "trust_badges" && trustBadges.length > 0) {
          const iconFor = (label: string): "lock" | "card" | "shield" | "star" => {
            const l = label.toLowerCase();
            if (l.includes("secure") || l.includes("checkout") || l.includes("payment") || l.includes("card")) return "card";
            if (l.includes("guarantee") || l.includes("refund")) return "shield";
            if (l.includes("privacy") || l.includes("protect")) return "lock";
            return "star";
          };
          return {
            ...section,
            config: { badges: trustBadges.map((label) => ({ label, iconType: iconFor(label) })) },
          };
        }
        if (section.type === "cta_banner" && ctaBannerHeadline) {
          return {
            ...section,
            config: {
              ...section.config,
              headline: ctaBannerHeadline,
              ...(ctaBannerSubtext ? { subtext: ctaBannerSubtext } : {}),
              ...(args.ctaLabel ? { ctaLabel: args.ctaLabel as string } : {}),
            },
          };
        }
        if (section.type === "agenda" && processSteps.length > 0) {
          return { ...section, config: { days: processSteps.map((s) => ({ label: s.label, title: s.title, bullets: s.bullets })) } };
        }
        if (section.type === "callout" && content?.text) {
          return { ...section, config: { text: content.text, tone: "highlight" as const } };
        }
        if (section.type === "video" && content?.videoUrl) {
          return {
            ...section,
            config: {
              embedUrl: content.videoUrl,
              ...(content.headline ? { headline: content.headline } : {}),
              ...(content.text ? { subtext: content.text } : {}),
            },
          };
        }
        if ((section.type === "benefits_grid" || section.type === "included") && content && content.items.length > 0) {
          return {
            ...section,
            config: {
              ...(content.headline ? { headline: content.headline } : {}),
              items: content.items
                .filter((it) => it.title)
                .map((it) => ({ title: it.title, ...(it.description ? { description: it.description } : {}) })),
            },
          };
        }
        if (section.type === "problem_solution" && content && (content.text || content.secondaryText)) {
          return {
            ...section,
            config: {
              problemHeadline: content.headline,
              problemText: content.text,
              solutionHeadline: content.secondaryHeadline,
              solutionText: content.secondaryText,
            },
          };
        }
        if (section.type === "before_after" && content && content.items.length > 0) {
          return {
            ...section,
            config: {
              ...(content.headline ? { beforeHeadline: content.headline } : {}),
              ...(content.secondaryHeadline ? { afterHeadline: content.secondaryHeadline } : {}),
              beforeItems: content.items.filter((it) => it.group === "before" && it.title).map((it) => it.title),
              afterItems: content.items.filter((it) => it.group === "after" && it.title).map((it) => it.title),
            },
          };
        }
        if (section.type === "comparison" && content && content.items.length > 0) {
          return {
            ...section,
            config: {
              ...(content.headline ? { headline: content.headline } : {}),
              usLabel: "Us",
              themLabel: content.secondaryHeadline || "The old way",
              rows: content.items.filter((it) => it.title).map((it) => ({ feature: it.title, us: true, them: false })),
            },
          };
        }
        // Testimonials are the one layout that requires real evidence —
        // the tool description tells the model to omit this stage_content
        // entry entirely (not just leave items empty) unless the user gave
        // real quotes, so an empty/missing entry here correctly leaves the
        // section at its safe "renders nothing" default.
        if (section.type === "testimonials" && content && content.items.length > 0) {
          return {
            ...section,
            config: {
              items: content.items
                .filter((it) => it.quote && it.name)
                .map((it) => ({ quote: it.quote, name: it.name, ...(it.detail ? { detail: it.detail } : {}) })),
            },
          };
        }
        // The challenge genre's seed uses ticket_tiers (not offer) for its
        // registration mechanism, seeded EMPTY (tiers: []) — without this,
        // a Zeno-built challenge funnel had no way to register at all
        // until the operator manually added a tier. Populate one default
        // tier from the same headline/bullets/CTA every other genre uses.
        if (section.type === "ticket_tiers") {
          const existingTiers = (section.config as TicketTiersConfig).tiers;
          if (existingTiers.length === 0) {
            return {
              ...section,
              config: {
                tiers: [
                  {
                    name: (args.funnelName as string) || "Register",
                    priceCents: (args.priceCents as number | null) ?? 0,
                    features: bullets,
                    ctaLabel: (args.ctaLabel as string) || "Register now",
                    formId: null,
                    highlighted: true,
                  },
                ],
              },
            };
          }
        }
        return section;
      });

      let sectionsToSave = nextSections;

      // "More than one photo" — when the archetype's media strategy is one
      // of the multi-photo kinds (service_photo/team_photo/community_photo)
      // Zeno adds a real, independently-growable Photo Gallery section
      // right after the hero, with an honest placeholder (never fabricated
      // photos) — see wantsGallerySection above for why this replaces the
      // hero's own single-image placeholder rather than stacking both.
      if (wantsGallerySection && resolvedMediaStrategy) {
        const galleryPlaceholderLabel = MEDIA_PLACEHOLDER_LABELS[resolvedMediaStrategy] ?? "Add photos of your work";
        const galleryPlaceholderBrief = mediaBrief(resolvedMediaStrategy);
        const heroIndex = sectionsToSave.findIndex((s) => s.type === "hero");
        const gallerySection: FunnelSection = {
          id: `s_gallery_${Date.now()}`,
          type: "photo_gallery",
          config: {
            images: [],
            layout: ((args.galleryLayout as string) || designStrategy?.galleryLayout || "grid") as PhotoGalleryConfig["layout"],
            placeholderLabel: galleryPlaceholderLabel,
            ...(galleryPlaceholderBrief ? { placeholderBrief: galleryPlaceholderBrief } : {}),
          },
        };
        sectionsToSave = [
          ...sectionsToSave.slice(0, heroIndex + 1),
          gallerySection,
          ...sectionsToSave.slice(heroIndex + 1),
        ];
      }

      // Orchestration: for a lead-capture-style funnel (no price set), also
      // create a dedicated form, a confirmation-email template, and a
      // workflow that sends it on submit — reusing the exact same services
      // the manual Forms/Templates/Workflow pages call, so a Zeno-built
      // package is indistinguishable from an operator-built one. Skipped
      // for a priced offer (tripwire/vsl/challenge with price_cents set) —
      // that needs Stripe checkout wired up by the operator, not a lead form.
      const wantsPackage = (args.includeCaptureForm as boolean) !== false && args.priceCents === null;
      const hasOffer = sectionsToSave.some((s) => s.type === "offer");
      const hasTicketTiers = sectionsToSave.some(
        (s) => s.type === "ticket_tiers" && (s.config as TicketTiersConfig).tiers.length > 0,
      );
      const hasHeroCapture = heroIsCaptureStage && sectionsToSave.some((s) => s.type === "hero");
      let createdFormId: string | null = null;
      let createdWorkflowId: string | null = null;

      if (wantsPackage && (hasOffer || hasTicketTiers || hasHeroCapture)) {
        createdFormId = await createFormServerSide({
          subAccountId,
          createdByUid: ctx.uid,
          name: `${(args.funnelName as string) || (args.headline as string)} — capture form`,
        });
        sectionsToSave = sectionsToSave.map((s) => {
          if (s.type === "offer") return { ...s, config: { ...s.config, formId: createdFormId } };
          if (s.type === "hero" && heroIsCaptureStage) {
            return { ...s, config: { ...s.config, formId: createdFormId } };
          }
          if (s.type === "ticket_tiers") {
            const cfg = s.config as TicketTiersConfig;
            return {
              ...s,
              config: {
                tiers: cfg.tiers.map((t, i) => (i === 0 ? { ...t, formId: createdFormId } : t)),
              },
            };
          }
          return s;
        });

        const emailSubject =
          (args.confirmationEmailSubject as string) || `You're in — ${args.headline as string}`;
        let emailBody =
          (args.confirmationEmailBody as string) ||
          `Thanks for signing up! We've got your details and will be in touch shortly.`;
        if (!emailBody.includes("{{unsubscribeLink}}")) {
          emailBody = `${emailBody}\n\n{{unsubscribeLink}}`;
        }

        try {
          await createMessageTemplateServerSide({
            subAccountId,
            createdByUid: ctx.uid,
            name: `${(args.funnelName as string) || (args.headline as string)} — confirmation`,
            type: "email",
            subject: emailSubject,
            body: emailBody,
          });
        } catch (err) {
          if (err instanceof MessageTemplateValidationError) {
            throw new CapabilityUserError(err.message);
          }
          throw err;
        }

        // Full Growth System recipe — every node type here already has a
        // real executor in lib/workflows/engine.ts's REGISTRY (the exact
        // same engine a manually-built workflow runs on, not a parallel
        // AI-only path): create the Opportunity, tag the contact, send the
        // confirmation, notify the operator, wait a day, then leave a
        // follow-up task. Mirrors what an operator builds by hand in the
        // visual Workflow builder — a Zeno-built workflow is editable there
        // exactly like any other.
        const displayName = (args.funnelName as string) || (args.headline as string);
        const tag = (args.tag as string) || `${displayName} requested`;

        createdWorkflowId = await createWorkflowServerSide({
          subAccountId,
          createdByUid: ctx.uid,
          name: `${displayName} — follow-up`,
          template: "blank",
        });
        await updateWorkflowServerSide({
          subAccountId,
          workflowId: createdWorkflowId,
          patch: {
            trigger: { type: "form.submitted", filters: { all: [] }, formId: createdFormId },
            nodes: {
              n1: {
                id: "n1",
                type: "create_deal",
                config: { title: displayName, value: 0, currency: "usd", stageId: "new", priority: "medium" },
                next: "n2",
              },
              n2: { id: "n2", type: "add_tag", config: { tag }, next: "n3" },
              n3: {
                id: "n3",
                type: "send_email",
                config: { subject: emailSubject, body: emailBody },
                next: "n4",
              },
              n4: {
                id: "n4",
                type: "notify",
                config: {
                  recipient: "owner",
                  to: "",
                  subject: `New lead: ${displayName}`,
                  body: `{{contact.firstName}} ({{contact.email}}) just submitted "${displayName}" and was tagged "${tag}". A follow-up task has been created.`,
                },
                next: "n5",
              },
              n5: { id: "n5", type: "wait", config: { seconds: 86_400 }, next: "n6" },
              n6: {
                id: "n6",
                type: "create_task",
                config: { title: `Follow up with {{contact.firstName}} — ${displayName}`, dueInDays: 0 },
                next: null,
              },
            },
            startNodeId: "n1",
          },
        });
      }

      try {
        await updateFunnelServerSide({
          subAccountId,
          funnelId,
          patch: {
            sections: sectionsToSave,
            ...(args.accentColor ? { accentColor: args.accentColor as string } : {}),
            ...(args.theme ? { theme: args.theme as "light" | "dark" } : {}),
          },
        });
      } catch (err) {
        if (err instanceof FunnelValidationError) {
          throw new CapabilityUserError(err.message);
        }
        throw err;
      }

      // Calibration Engine v1 — every AI-generated funnel gets the locked
      // spec's 12-criteria design review the moment its real content lands
      // (not right after createFunnelServerSide, which only has the seed
      // sections — this runs after updateFunnelServerSide above wrote the
      // actual copy). Best-effort: a scoring failure (model hiccup, rate
      // limit) must never break funnel creation itself, so it's swallowed
      // here exactly like every other lifecycle side-effect in this
      // codebase (see lib/quotes/lifecycle.ts).
      let copyReview: FunnelCopyReview | null = null;
      try {
        const scoredFunnel = await getFunnel(subAccountId, funnelId);
        if (scoredFunnel) {
          await scoreFunnelDesign(scoredFunnel);
          // Conversion Engine (M6b) — deterministic copy-quality + anti-
          // fabrication review alongside the design score. No LLM cost; flags
          // generic filler / invented proof / vague CTAs for operator review
          // (persisted to funnelCopyReviews, mirroring the design score).
          // Best-effort, same swallow as the design score.
          copyReview = await reviewFunnelCopy(scoredFunnel);
        }
      } catch {
        // Swallowed — the operator can always trigger a manual re-score
        // from the funnel builder if this silently didn't run.
      }

      const displayName = (args.funnelName as string) || (args.headline as string);
      const tag = (args.tag as string) || `${displayName} requested`;
      const formLabel = hasTicketTiers ? "Registration Form" : "Capture Form";

      // Every line below maps 1:1 to something actually written to Firestore
      // above — nothing here is aspirational or generic. When the offer is
      // priced (no capture form/workflow package), the checklist shrinks to
      // just what was really created rather than checking off steps that
      // didn't run.
      const summaryLines = [
        "✅ Growth System Created",
        "",
        "ASSETS",
        `✓ Landing Page — "${displayName}"`,
      ];
      // Phase 2 — a concise, honest design rationale (never chain-of-thought,
      // never a score/grade) so the operator knows WHY this look was chosen
      // and can act on it (change the archetype/palette/CTA in the builder)
      // without having to guess what Zeno was thinking.
      if (designStrategy) {
        const archetypeDef = VISUAL_ARCHETYPES[designStrategy.visualArchetype];
        const heroLayoutLabel = designStrategy.heroLayout.replace(/_/g, " ");
        const ctaLabel = designStrategy.ctaStrategy.replace(/_/g, " ");
        const animationLabel = designStrategy.animationLevel === "none" ? "no animation" : `${designStrategy.animationLevel} animation`;
        summaryLines.push(
          "",
          "DESIGN",
          `${archetypeDef.label} style — chosen for ${archetypeDef.audienceHint.split(",")[0].toLowerCase()}. ${heroLayoutLabel} hero, ${animationLabel}, ${ctaLabel} CTA. Change the style, palette, hero, or CTA anytime without touching the copy.` +
            (wantsGallerySection
              ? ` Added a Photo Gallery section for real work photos — the hero stays a clean headline with room for your logo above it.`
              : ""),
        );
      }
      if (createdFormId) {
        summaryLines.push(
          "",
          "CHECKOUT",
          `✓ ${formLabel}`,
          "✓ Confirmation Email",
          "",
          "CRM",
          "✓ Opportunity Creation",
          `✓ Contact Tag ("${tag}")`,
          "✓ Follow-up Task",
          "",
          "AUTOMATION",
          "✓ Workflow (form submitted → Opportunity → tag → email → notify → wait → task)",
          "✓ Internal Notification",
          "✓ Wait Step (1 day)",
        );
      } else {
        summaryLines.push(
          "",
          "CHECKOUT",
          "— No capture form (this is a priced offer — wire up Stripe checkout on the offer section, no lead-form opt-in needed).",
        );
      }
      // Conversion Engine (M6b) — surface the copy review so the operator knows
      // to check before sharing. Only shown when something was actually flagged;
      // a clean pass stays quiet. Never a "score/grade" for its own sake.
      if (copyReview && copyReview.issues.length > 0) {
        summaryLines.push("", "COPY REVIEW");
        if (copyReview.fabricationRisk) {
          summaryLines.push(
            "⚠️ Possible fabricated proof/stats detected — verify or remove before publishing (never publish invented testimonials, numbers, or guarantees).",
          );
        }
        summaryLines.push(
          `Copy check: ${copyReview.score}/100 · ${copyReview.issues.length} item(s) flagged for a quick review (e.g. generic phrasing, vague CTA). Open the funnel to tighten them.`,
        );
      }

      summaryLines.push(
        "",
        "STATUS",
        "Everything above is in Draft. Review each asset before publishing/activating — Sidebar → Funnels" +
          (createdFormId ? " / Forms / Templates / Workflows." : "."),
      );

      return {
        resultText: summaryLines.join("\n"),
        ref: { kind: "funnel", id: funnelId },
      };
    },
  },
  {
    name: "check_funnel_status",
    level: "sub-account",
    requiredRole: "subAccountMember",
    readonly: true,
    menuLabel: "Check this workspace's funnels (draft/published status + live URLs)",
    description:
      "List this sub-account's funnels with their status and live URL. Use when the user asks whether their funnel is done, what funnels exist, or for a funnel's address.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    validate: () => ({ ok: true, args: {} }),
    summarize: () => "Check the funnels' status.",
    execute: async (ctx) => {
      const funnels = await listFunnels(ctx.subAccountId!);
      if (funnels.length === 0) {
        return {
          resultText:
            "No funnels exist in this workspace yet. Ask me to build one, or use Sidebar → Funnels.",
        };
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      const lines = funnels.map((f) => {
        const detail =
          f.status === "published" ? `live at ${appUrl}/lp/${f.id}` : "draft (not published yet)";
        return `- "${f.name}": ${detail}`;
      });
      return { resultText: `Funnels in this workspace:\n${lines.join("\n")}` };
    },
  },
];

/**
 * Agency-level "act in a named sub-account" variants.
 *
 * The agency owner has implicit admin in every sub-account, so the Agency
 * Assistant may run selected workspace capabilities against a sub-account
 * the owner names — WITHOUT duplicating any business logic. The wrapper:
 *   1. adds required `subAccountId` + `subAccountName` parameters (resolved
 *      via list_sub_accounts — the model is told never to guess ids),
 *   2. re-anchors the model-supplied id to the caller's own agency before
 *      anything runs (a crafted/wrong id can never reach another tenant),
 *   3. delegates to the base capability's validate/summarize/execute with
 *      the context's subAccountId swapped to the verified target — so every
 *      guardrail inside the base capability (per-feature agency gates,
 *      contact re-anchoring, URL validation) runs unchanged against the
 *      target workspace.
 */
function inSubAccount(base: AiSuiteCapability): AiSuiteCapability {
  const baseParams = base.parameters as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return {
    name: `${base.name}_in_sub_account`,
    level: "agency",
    requiredRole: "agencyOwner",
    readonly: base.readonly,
    menuLabel: `${base.menuLabel} — in a sub-account you name`,
    description: `${base.description} AGENCY VARIANT: performs this inside one of your sub-accounts. Resolve the sub-account's id with list_sub_accounts first — never guess ids.`,
    parameters: {
      type: "object",
      properties: {
        subAccountId: {
          type: "string",
          description:
            "The target sub-account's id, exactly as returned by list_sub_accounts.",
        },
        subAccountName: {
          type: "string",
          description: "The target sub-account's display name, for the confirmation card.",
        },
        ...(baseParams.properties ?? {}),
      },
      required: ["subAccountId", "subAccountName", ...(baseParams.required ?? [])],
      additionalProperties: false,
    },
    validate: (raw) => {
      const subAccountId = str(raw, "subAccountId");
      if (!subAccountId) {
        return {
          ok: false,
          error:
            "the target sub-account id is required — I need to look it up first (list_sub_accounts)",
        };
      }
      const inner = base.validate(raw);
      if (!inner.ok) return inner;
      return {
        ok: true,
        args: {
          ...inner.args,
          subAccountId,
          subAccountName: str(raw, "subAccountName"),
        },
      };
    },
    summarize: (args) =>
      `${base.summarize(args).replace(/\.\s*$/, "")} — in “${
        args.subAccountName || args.subAccountId
      }”.`,
    execute: async (ctx, args) => {
      const snap = await getAdminDb()
        .doc(`subAccounts/${args.subAccountId as string}`)
        .get();
      if (!snap.exists || snap.data()?.agencyId !== ctx.agencyId) {
        throw new CapabilityUserError("That sub-account wasn't found in this agency.");
      }
      // The owner is implicit admin in every sub-account of their agency.
      return base.execute(
        { ...ctx, subAccountId: snap.id, subAccountRole: "agencyOwner" },
        args,
      );
    },
  };
}

// Workspace capabilities Zeno (agency level) may run against a named
// sub-account. Deliberately a curated allowlist, not "everything".
const AGENCY_DELEGATED = [
  "find_contacts",
  "find_deals",
  "find_tasks",
  "find_events",
  "workspace_stats",
  "list_webhooks",
  "list_members",
  "create_contact",
  "update_contact",
  "create_task",
  "complete_task",
  "create_deal",
  "update_deal",
  "move_deal_stage",
  "create_event",
  "create_workflow",
  "create_webhook",
  "create_community",
  "invite_member",
  // Website builder — the agency owner can research, build, and check sites
  // for a named client workspace ("build Joe's Gym a website like X"). The
  // websiteEnabledByAgency gate still applies inside the service.
  "get_website_prefill",
  "research_website_reference",
  "create_website",
  "check_website_status",
  // Funnel Builder — same delegation shape as the website builder above.
  // funnelsEnabledByAgency still applies inside createFunnelServerSide's
  // caller (checked explicitly in create_funnel's execute()).
  "create_funnel",
  "check_funnel_status",
];
for (const name of AGENCY_DELEGATED) {
  const base = AI_SUITE_CAPABILITIES.find((c) => c.name === name);
  if (base) AI_SUITE_CAPABILITIES.push(inSubAccount(base));
}

export function getCapability(name: string): AiSuiteCapability | undefined {
  return AI_SUITE_CAPABILITIES.find((c) => c.name === name);
}

/** True when a caller with `role` satisfies the capability's required role. */
export function roleSatisfies(
  required: RequiredRole,
  ctx: { agencyRoleIsOwner: boolean; subAccountRole?: string },
): boolean {
  switch (required) {
    case "agencyOwner":
      return ctx.agencyRoleIsOwner;
    case "subAccountAdmin":
      return (
        ctx.subAccountRole === "admin" || ctx.subAccountRole === "agencyOwner"
      );
    case "subAccountMember":
      return !!ctx.subAccountRole; // any active member (already authed)
  }
}

/**
 * Capabilities available at a level to a caller with the given role, as
 * OpenAI/OpenRouter tool definitions. Filtering by role here means the model
 * is only ever offered tools the caller could actually run — so it guides a
 * collaborator to ask an admin rather than proposing a doomed action.
 */
export function toolsForLevel(
  level: AiSuiteLevel,
  role: { agencyRoleIsOwner: boolean; subAccountRole?: string },
): Array<{ type: "function"; function: Record<string, unknown> }> {
  return AI_SUITE_CAPABILITIES.filter(
    (c) => c.level === level && roleSatisfies(c.requiredRole, role),
  ).map((c) => ({
    type: "function",
    function: {
      name: c.name,
      description: c.description,
      parameters: c.parameters,
    },
  }));
}

export interface CapabilityMenuItem {
  name: string;
  menuLabel: string;
}

/**
 * The capabilities offered at a level+role — name + human menu label, split
 * by class so the prompt can explain that lookups run instantly while
 * actions need the user's confirmation, and so the assistant can answer
 * "what can you do?" with a polished, role-accurate list.
 */
export function capabilityNamesForLevel(
  level: AiSuiteLevel,
  role: { agencyRoleIsOwner: boolean; subAccountRole?: string },
): { actions: CapabilityMenuItem[]; lookups: CapabilityMenuItem[] } {
  const offered = AI_SUITE_CAPABILITIES.filter(
    (c) => c.level === level && roleSatisfies(c.requiredRole, role),
  );
  const item = (c: AiSuiteCapability): CapabilityMenuItem => ({
    name: c.name,
    menuLabel: c.menuLabel,
  });
  return {
    actions: offered.filter((c) => !c.readonly).map(item),
    lookups: offered.filter((c) => c.readonly).map(item),
  };
}
