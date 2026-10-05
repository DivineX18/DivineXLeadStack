import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getFunnel } from "@/lib/server/funnels-service";
import { getForm } from "@/lib/server/forms-service";
import { getWorkflow } from "@/lib/server/workflows-service";
import { listBookingPages } from "@/lib/server/booking-pages-service";
import { getCampaign } from "@/lib/server/campaigns-service";
import type { FunnelDoc, FunnelSection } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import type { WorkflowDoc, WorkflowNode } from "@/types/workflows";
import type { BookingPage } from "@/types/booking";
import type { CampaignDoc } from "@/lib/server/campaigns-service";

/**
 * THE FLOW DOMAIN REGISTRY — one place that knows how to read any asset the
 * customer can see, what it is connected to, and what Zeno may do to it.
 *
 * WHY A REGISTRY RATHER THAN A TOOL PER ASSET. Zeno reached funnels through
 * one bespoke resolver and emails through another, so every new Flow feature
 * meant another parallel path, and anything without one produced "tell me
 * what your booking settings are" — asking the customer to describe data the
 * server was holding. Adding a domain here is a table entry: the context
 * card, the read tool and the cross-domain trace all pick it up at once.
 *
 * THE SECURITY SHAPE IS INHERITED, NOT REINVENTED. Every `load` proves the
 * asset belongs to the authenticated workspace before returning it, and a
 * foreign asset is indistinguishable from a nonexistent one (both null), so
 * this cannot become a tenant-enumeration path. See page-context.ts, whose
 * non-enumeration rule this follows exactly.
 *
 * THIS IS NOT A SECOND PRODUCT. Nothing here stores, mutates or re-implements
 * anything: every load delegates to the same domain service the UI uses, and
 * `operations` only NAMES the existing capability that performs each change.
 * The registry is a map of the product, not a copy of it.
 */

export const FLOW_ASSET_KINDS = [
  "funnel",
  "form",
  "workflow",
  "booking_page",
  "campaign",
  "website",
  "email_template",
] as const;
export type FlowAssetKind = (typeof FLOW_ASSET_KINDS)[number];

/** The operations a domain can expose. Not every domain supports every one. */
export type FlowOperation =
  | "read" | "create" | "update" | "delete" | "reorder"
  | "connect" | "configure" | "activate" | "deactivate"
  | "publish" | "unpublish" | "duplicate";

/** A link from one asset to another, as the customer's journey actually runs. */
export interface FlowEdge {
  /** Said to the customer, so it reads as a journey, not a schema. */
  relation: string;
  kind: FlowAssetKind;
  id: string;
}

/** One asset, as Zeno needs to see it. A summary, never the raw document. */
export interface FlowAssetView {
  kind: FlowAssetKind;
  /** The word for this thing in front of a customer ("landing page"). */
  label: string;
  id: string;
  name: string;
  /** Lifecycle state in the customer's terms: draft, live, sending, off. */
  state: string;
  /** The readable body of the asset, line by line. */
  lines: string[];
  /** Ids a mutation tool needs. Never spoken to the customer. */
  refs: Record<string, string>;
  /** What Zeno can do to it, and with which tool. */
  operations: Partial<Record<FlowOperation, string>>;
  edges: FlowEdge[];
}

const cap = (v: unknown, max = 200): string =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "";

interface FlowDomain<T> {
  kind: FlowAssetKind;
  label: string;
  load: (subAccountId: string, id: string) => Promise<T | null>;
  describe: (doc: T, subAccountId: string) => Omit<FlowAssetView, "kind" | "label" | "operations">;
  /** Edges that need their own query. Resolved on every read, so the context
   *  card and inspect_asset see the same connections the trace does. */
  relatedAsync?: (doc: T, subAccountId: string) => Promise<FlowEdge[]>;
  operations: Partial<Record<FlowOperation, string>>;
}

/* ------------------------------- funnel -------------------------------- */

/** The section list, written out so it can be reasoned about rather than
 *  asked about. Shared with page-context.ts, which renders the richer card. */
export function describeFunnelSection(sec: FunnelSection): string {
  const cfg = (sec.config ?? {}) as Record<string, unknown>;
  const parts: string[] = [`[${sec.type}] id=${sec.id}`];
  const heading = [cfg.headline, cfg.problemHeadline, cfg.byline, cfg.text]
    .map((x) => cap(x, 120))
    .find(Boolean);
  if (heading) parts.push(`heading: "${heading}"`);
  const cta = cap(cfg.ctaLabel ?? cfg.buttonLabel, 80);
  if (cta) parts.push(`button: "${cta}"${cap(cfg.ctaHref, 120) ? ` -> ${cap(cfg.ctaHref, 120)}` : ""}`);
  if (cfg.formId) parts.push(`capture form ${String(cfg.formId)}`);
  return parts.join(" | ");
}

/** Every form this page can submit into — the first hop of the journey. */
function funnelFormIds(doc: FunnelDoc): string[] {
  const out = new Set<string>();
  for (const sec of doc.sections ?? []) {
    const cfg = (sec.config ?? {}) as Record<string, unknown>;
    if (typeof cfg.formId === "string" && cfg.formId) out.add(cfg.formId);
    for (const tier of Array.isArray(cfg.tiers) ? (cfg.tiers as Record<string, unknown>[]) : []) {
      if (typeof tier.formId === "string" && tier.formId) out.add(tier.formId);
    }
  }
  return [...out];
}

/** Where a page sends someone next: a booking diary, or the next step. */
function funnelDestinations(doc: FunnelDoc): FlowEdge[] {
  const edges: FlowEdge[] = [];
  if (doc.bridge?.nextFunnelId) {
    edges.push({ relation: "then sends them on to", kind: "funnel", id: doc.bridge.nextFunnelId });
  }
  const slugs = new Set<string>();
  for (const sec of doc.sections ?? []) {
    const cfg = (sec.config ?? {}) as Record<string, unknown>;
    const cta = (cfg.cta ?? {}) as Record<string, unknown>;
    const slug = cap(cta.bookingPageSlug, 80);
    if (slug) slugs.add(slug);
    const href = cap(cfg.ctaHref, 200);
    const m = href.match(/\/b\/[^/]+\/([A-Za-z0-9_-]+)/);
    if (m) slugs.add(m[1]);
  }
  for (const s of slugs) edges.push({ relation: "books a call at", kind: "booking_page", id: s });
  return edges;
}

const funnelDomain: FlowDomain<FunnelDoc> = {
  kind: "funnel",
  label: "landing page",
  load: (sa, id) => getFunnel(sa, id),
  describe: (doc) => ({
    id: doc.id,
    name: doc.name,
    state: doc.status === "published" ? "live" : "draft",
    lines: [
      ...(doc.sections ?? []).slice(0, 25).map((s, i) => `${i + 1}. ${describeFunnelSection(s)}`),
      ...(doc.leadMagnetAsset?.url
        ? [`It delivers a file: "${cap(doc.leadMagnetAsset.filename ?? "the download", 80)}".`]
        : []),
      ...((doc.visualRequirements ?? []).filter((r) => !r.resolvedWith).length
        ? [`${(doc.visualRequirements ?? []).filter((r) => !r.resolvedWith).length} real photo(s) still outstanding.`]
        : []),
    ],
    refs: { funnel_id: doc.id },
    edges: [
      ...funnelFormIds(doc).map((id) => ({ relation: "captures through", kind: "form" as const, id })),
      ...funnelDestinations(doc),
    ],
  }),
  operations: {
    read: "check_funnel_status",
    create: "create_funnel",
    update: "revise_funnel_copy",
    reorder: "edit_funnel_structure",
    configure: "edit_funnel_structure",
    connect: "link_funnel_steps",
  },
};

/* -------------------------------- form --------------------------------- */

const formDomain: FlowDomain<LeadForm> = {
  kind: "form",
  label: "capture form",
  load: (sa, id) => getForm(sa, id),
  describe: (doc) => ({
    id: doc.id,
    name: doc.name,
    state: doc.enabled ? "taking submissions" : "off",
    lines: [
      ...(doc.fields ?? []).map(
        (f, i) =>
          `${i + 1}. "${cap(f.label, 90)}" (${f.type}${f.required ? ", required" : ""}) id=${f.id}` +
          (f.mapsTo ? ` saves to ${f.mapsTo}` : ""),
      ),
      `${doc.submissionCount ?? 0} submission(s) so far.`,
    ],
    refs: { form_id: doc.id },
    edges: [],
  }),
  relatedAsync: (doc, sa) => workflowsForForm(sa, doc.id),
  operations: { read: "list_forms", create: "create_form", update: "update_form", reorder: "update_form" },
};

/* ------------------------------ workflow -------------------------------- */

function stepLine(node: WorkflowNode, n: number, emailOrdinal?: number): string {
  const cfg = (node.config ?? {}) as Record<string, unknown>;
  switch (node.type) {
    case "send_email":
      // The ordinal is the EMAIL's number, not the step's. revise_workflow_email
      // counts emails, so a listing that numbered every step made "email 2"
      // resolve to the third thing in the list and the edit was refused.
      return `${n}. Email ${emailOrdinal}, subject "${cap(cfg.subject, 120)}" id=${node.id}`;
    case "send_sms":
      return `${n}. Text message id=${node.id}`;
    case "wait": {
      const sec = Number(cfg.seconds ?? 0);
      const span =
        sec % 86_400 === 0 && sec > 0 ? `${sec / 86_400} day(s)`
        : sec % 3_600 === 0 && sec > 0 ? `${sec / 3_600} hour(s)`
        : `${Math.round(sec / 60)} minute(s)`;
      return `${n}. Wait ${span} id=${node.id}`;
    }
    case "add_tag":
      return `${n}. Tag them "${cap(cfg.tag, 60)}" id=${node.id}`;
    default:
      return `${n}. ${String(node.type).replace(/_/g, " ")} id=${node.id}`;
  }
}

/** The graph in the order it actually runs, which is the only order a
 *  customer means when they say "email 2". */
export function workflowStepsInOrder(doc: WorkflowDoc): WorkflowNode[] {
  const out: WorkflowNode[] = [];
  const seen = new Set<string>();
  let id = doc.startNodeId;
  while (id && !seen.has(id) && out.length < 60) {
    seen.add(id);
    const node = doc.nodes?.[id];
    if (!node) break;
    out.push(node);
    id = node.next ?? null;
  }
  return out;
}

const workflowDomain: FlowDomain<WorkflowDoc> = {
  kind: "workflow",
  label: "follow-up automation",
  load: (sa, id) => getWorkflow(sa, id),
  describe: (doc) => {
    const steps = workflowStepsInOrder(doc);
    const trig = (doc.trigger ?? {}) as unknown as Record<string, unknown>;
    return {
      id: doc.id,
      name: doc.name,
      state: doc.status === "active" ? "sending" : doc.status === "paused" ? "paused" : "draft",
      lines: [
        `Starts when: ${cap(trig.type, 60).replace(/_/g, " ") || "unknown"}${trig.formId ? ` (form ${String(trig.formId)})` : ""}.`,
        ...(() => {
          let emails = 0;
          return steps.map((node, i) =>
            stepLine(node, i + 1, node.type === "send_email" ? ++emails : undefined),
          );
        })(),
      ],
      refs: { workflow_id: doc.id },
      edges: trig.formId
        ? [{ relation: "starts from", kind: "form" as const, id: String(trig.formId) }]
        : [],
    };
  },
  operations: {
    read: "list_workflows",
    create: "create_workflow",
    update: "revise_workflow_email",
    reorder: "apply_workflow_plan",
    configure: "edit_workflow_steps",
  },
};

/* ---------------------------- booking page ------------------------------ */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const bookingDomain: FlowDomain<BookingPage> = {
  kind: "booking_page",
  label: "booking page",
  // Booking pages are addressed by SLUG in the product's own URLs, so both
  // the slug and the document id resolve here. A customer who says "this
  // booking page" from /create/booking/consult means the slug.
  load: async (sa, id) => {
    const all = await listBookingPages(sa);
    return all.find((p) => p.id === id) ?? all.find((p) => p.slug === id) ?? null;
  },
  describe: (doc) => ({
    id: doc.id,
    name: doc.name,
    state: doc.status === "published" ? "live" : "draft",
    lines: [
      `Each meeting is ${doc.durationMinutes} minutes, with ${doc.bufferMinutes} minute(s) between them.`,
      `Bookable ${doc.visibleDays} days ahead, needing ${doc.minNoticeHours} hour(s) notice` +
        `${doc.maxPerDay ? `, capped at ${doc.maxPerDay} a day` : ""}. Times in ${doc.timezone}.`,
      ...(doc.workingHours ?? []).map(
        (h) =>
          `${DAYS[h.dayOfWeek]}: ${String(Math.floor(h.startMinute / 60)).padStart(2, "0")}:${String(h.startMinute % 60).padStart(2, "0")}` +
          ` to ${String(Math.floor(h.endMinute / 60)).padStart(2, "0")}:${String(h.endMinute % 60).padStart(2, "0")}`,
      ),
      ...(doc.intakeFields ?? []).map((f) => `Asks: "${cap(f.label, 90)}"${f.required ? " (required)" : ""}`),
    ],
    refs: { booking_page_id: doc.id, booking_slug: doc.slug },
    edges: [],
  }),
  operations: {
    read: "list_booking_pages",
    create: "create_booking_page",
    update: "update_booking_page",
    configure: "update_booking_page",
    publish: "update_booking_page",
  },
};

/* ------------------------------ campaign -------------------------------- */

const campaignDomain: FlowDomain<CampaignDoc> = {
  kind: "campaign",
  label: "campaign",
  load: (sa, id) => getCampaign(sa, id),
  describe: (doc) => {
    const steps = doc.plan?.steps ?? [];
    // A campaign step names the asset it produced, which is exactly the edge
    // needed to walk from a plan into the real pages and automations.
    const KIND: Record<string, FlowAssetKind> = {
      funnel: "funnel", form: "form", workflow: "workflow", message_template: "email_template",
    };
    return {
      id: doc.id,
      name: doc.name,
      state: String(doc.status ?? "draft"),
      lines: [
        ...(doc.plan?.approved?.centralPromise ? [`Promise: ${cap(doc.plan.approved.centralPromise, 200)}`] : []),
        ...(doc.plan?.approved?.primaryCta ? [`Drives toward: ${cap(doc.plan.approved.primaryCta, 120)}`] : []),
        ...steps.map((st, i) => `${i + 1}. ${cap(st.label, 120)} (${st.status})${st.assetId ? ` -> ${st.assetKind} ${st.assetId}` : ""}`),
      ],
      refs: { campaign_id: doc.id },
      edges: steps
        .filter((st) => !!st.assetId && !!st.assetKind && !!KIND[st.assetKind])
        .map((st) => ({ relation: "includes", kind: KIND[st.assetKind!], id: st.assetId! })),
    };
  },
  operations: { read: "inspect_asset" },
};

/* ------------------------------- website -------------------------------- */

interface WebsiteDocLike {
  id: string;
  status?: string;
  liveUrl?: string | null;
  config?: Record<string, unknown>;
}

const websiteDomain: FlowDomain<WebsiteDocLike> = {
  kind: "website",
  label: "website",
  load: async (sa, id) => {
    const snap = await getAdminDb().doc(`subAccounts/${sa}/website/${id}`).get();
    return snap.exists ? ({ id: snap.id, ...(snap.data() as object) } as WebsiteDocLike) : null;
  },
  describe: (doc) => {
    const c = (doc.config ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      name: cap(c.business_name, 120) || "Website",
      state: doc.status === "ready" || doc.liveUrl ? "live" : String(doc.status ?? "draft"),
      lines: [
        ...(cap(c.heading, 160) ? [`Heading: "${cap(c.heading, 160)}"`] : []),
        ...(cap(c.hero_statement, 240) ? [`Hero: "${cap(c.hero_statement, 240)}"`] : []),
        ...(cap(c.services, 300) ? [`Services: ${cap(c.services, 300)}`] : []),
        ...(doc.liveUrl ? [`Live at ${doc.liveUrl}`] : []),
      ],
      refs: { site_id: doc.id },
      edges: [],
    };
  },
  operations: { read: "check_website_status", create: "create_website", update: "update_website" },
};

/* ---------------------------- email template ---------------------------- */

interface TemplateDocLike {
  id: string;
  name?: string;
  type?: string;
  subject?: string;
  body?: string;
}

const templateDomain: FlowDomain<TemplateDocLike> = {
  kind: "email_template",
  label: "saved message",
  load: async (sa, id) => {
    const snap = await getAdminDb().doc(`message_templates/${id}`).get();
    if (!snap.exists) return null;
    const data = snap.data() as { subAccountId?: string };
    if (data.subAccountId !== sa) return null;
    return { id: snap.id, ...(snap.data() as object) } as TemplateDocLike;
  },
  describe: (doc) => ({
    id: doc.id,
    name: doc.name ?? "Untitled",
    state: doc.type === "sms" ? "text message" : "email",
    lines: [
      ...(doc.subject ? [`Subject: "${cap(doc.subject, 160)}"`] : []),
      ...(doc.body ? [`Body: ${cap(doc.body, 1200)}`] : []),
    ],
    refs: { template_id: doc.id },
    edges: [],
  }),
  operations: { read: "list_email_templates", create: "create_email", update: "revise_email" },
};

/* ------------------------------- registry ------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous domains, each internally typed
const REGISTRY: Record<FlowAssetKind, FlowDomain<any>> = {
  funnel: funnelDomain,
  form: formDomain,
  workflow: workflowDomain,
  booking_page: bookingDomain,
  campaign: campaignDomain,
  website: websiteDomain,
  email_template: templateDomain,
};

export function isFlowAssetKind(v: unknown): v is FlowAssetKind {
  return typeof v === "string" && (FLOW_ASSET_KINDS as readonly string[]).includes(v);
}

export function flowDomainLabel(kind: FlowAssetKind): string {
  return REGISTRY[kind].label;
}

/**
 * Read one asset, ONLY if it belongs to the authenticated workspace.
 *
 * Returns null for a foreign asset AND for one that does not exist, so the
 * two are indistinguishable to the caller and this cannot be used to probe
 * another tenant for what they have.
 */
export async function readFlowAsset(
  subAccountId: string,
  kind: FlowAssetKind,
  id: string,
): Promise<FlowAssetView | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const domain = REGISTRY[kind];
  try {
    const doc = await domain.load(subAccountId, id);
    if (!doc) return null;
    const described = domain.describe(doc, subAccountId);
    const extra = domain.relatedAsync ? await domain.relatedAsync(doc, subAccountId) : [];
    return {
      kind,
      label: domain.label,
      operations: domain.operations,
      ...described,
      edges: [...described.edges, ...extra],
    };
  } catch {
    // A read failure must not leak a distinguishable outcome either.
    return null;
  }
}

/**
 * Which automations actually run off a given form.
 *
 * This used to read the workspace's first 50 workflows and filter them in
 * memory. In a workspace with 183 of them the right one simply was not in
 * the window, so Zeno told the customer "there is no follow-up automation
 * connected to this form" while looking straight at one. Both queries below
 * are equality-only, which Firestore serves from single-field indexes, so
 * this is exact without needing a composite index.
 */
async function workflowsForForm(subAccountId: string, formId: string): Promise<FlowEdge[]> {
  const db = getAdminDb();
  const [named, anyForm] = await Promise.all([
    db.collection("workflows")
      .where("subAccountId", "==", subAccountId)
      .where("trigger.formId", "==", formId)
      .get(),
    // A form.submitted trigger with no formId fires for EVERY form in the
    // workspace, so it is genuinely connected to this one.
    db.collection("workflows")
      .where("subAccountId", "==", subAccountId)
      .where("trigger.type", "==", "form.submitted")
      .get(),
  ]);
  const ids = new Set(named.docs.map((d) => d.id));
  for (const d of anyForm.docs) {
    if (!(d.data() as { trigger?: { formId?: string | null } }).trigger?.formId) ids.add(d.id);
  }
  return [...ids].slice(0, 10).map((id) => ({
    relation: "triggers the follow-up",
    kind: "workflow" as const,
    id,
  }));
}

export interface FlowTraceNode {
  depth: number;
  relation: string;
  asset: FlowAssetView;
}

/**
 * Walk the customer's journey from one asset outward: page to form, form to
 * the automation it triggers, automation to its emails, page to the diary it
 * books into.
 *
 * This is what makes "people download this but aren't booking calls" an
 * answerable question. Reading the page alone cannot answer it, because the
 * break is almost never on the page — it is in the email that never bridges
 * to the call. Breadth-first and hard-capped, so one request can never walk
 * a whole workspace.
 */
export async function traceFlowSystem(
  subAccountId: string,
  kind: FlowAssetKind,
  id: string,
  opts: { maxNodes?: number; maxDepth?: number } = {},
): Promise<{ nodes: FlowTraceNode[]; unreachable: string[] }> {
  const maxNodes = opts.maxNodes ?? 12;
  const maxDepth = opts.maxDepth ?? 3;
  const nodes: FlowTraceNode[] = [];
  const unreachable: string[] = [];
  const seen = new Set<string>();
  let queue: { kind: FlowAssetKind; id: string; depth: number; relation: string }[] = [
    { kind, id, depth: 0, relation: "the starting point" },
  ];

  while (queue.length > 0 && nodes.length < maxNodes) {
    const next: typeof queue = [];
    for (const item of queue) {
      if (nodes.length >= maxNodes) break;
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const asset = await readFlowAsset(subAccountId, item.kind, item.id);
      if (!asset) {
        // A link that points at something no longer there is a REAL finding,
        // not an error to swallow: it is a dead end a visitor would hit.
        unreachable.push(`${item.relation} a ${flowDomainLabel(item.kind)} that no longer exists`);
        continue;
      }
      nodes.push({ depth: item.depth, relation: item.relation, asset });
      if (item.depth >= maxDepth) continue;
      for (const e of asset.edges) {
        next.push({ kind: e.kind, id: e.id, depth: item.depth + 1, relation: e.relation });
      }
    }
    queue = next;
  }
  return { nodes, unreachable };
}

/** The trace, written out for the model as a journey rather than a graph. */
export function renderFlowTrace(trace: { nodes: FlowTraceNode[]; unreachable: string[] }): string {
  const lines: string[] = [];
  for (const n of trace.nodes) {
    const indent = "  ".repeat(n.depth);
    lines.push(
      `${indent}${n.depth === 0 ? "" : `${n.relation} `}${n.asset.label} "${n.asset.name}" (${n.asset.state}) ${Object.entries(n.asset.refs).map(([k, v]) => `${k}="${v}"`).join(" ")}`,
    );
    for (const l of n.asset.lines.slice(0, 12)) lines.push(`${indent}   ${l}`);
  }
  for (const u of trace.unreachable) lines.push(`BROKEN LINK: ${u}`);
  return lines.join("\n");
}
