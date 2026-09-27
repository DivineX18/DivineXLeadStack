import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ResourceKind } from "@/lib/ai-suite/execution-result";

/**
 * WHAT THE CUSTOMER IS LOOKING AT, PROVEN.
 *
 * page-context.ts established the shape this follows and the security rule
 * that matters: the client says WHERE someone is, the server decides what
 * they may know there, and a foreign resource is indistinguishable from one
 * that does not exist. That module resolves funnels. This resolves the rest,
 * under the identical rule, so "open Saturdays" on a booking page means the
 * booking page they have open without them naming it.
 *
 * TWO WAYS A RESOURCE IS NAMED, and neither is authority.
 *
 *   The ROUTE already carries the id for every resource with its own
 *   editor: /sa/:ws/booking/:slug, /app/create/forms/:id. Parsing it means
 *   no page has to be wired up individually, and a page that is added later
 *   works the day its route exists. It is still an untrusted string: the raw
 *   path never reaches the model, only a kind and an id that were matched
 *   against an exact pattern and then re-read from storage.
 *
 *   An explicit REF from a component wins over the route, because a
 *   component knows things the URL does not: which email node is selected,
 *   which deal dialog is open. A route cannot express a selected child.
 *
 * Every id, from either source, is loaded from authoritative storage and
 * proven to belong to the AUTHENTICATED workspace before anything about it
 * is rendered. Nothing here reads the workspace from the client.
 */

/** Resources that have a real editor a customer can be looking at. */
export type ContextKind = Extract<
  ResourceKind,
  "booking_page" | "form" | "workflow" | "contact" | "funnel" | "message_template" | "community" | "deal" | "task" | "event" | "website"
>;

export interface ContextRef {
  kind: ContextKind;
  id: string;
  /** A selected child: a workflow's email node, a funnel's section. */
  childId?: string;
}

export interface ResolvedContextResource {
  kind: ContextKind;
  id: string;
  /** Customer-facing name, safe to speak. */
  label: string;
  /** Short state note, safe to speak. Empty when there is nothing useful. */
  state: string;
  /** The selected child, when one was supplied AND proven to belong here. */
  child?: { id: string; label: string; kind: string };
  /** The argument names a capability editing this expects. */
  toolArgs: Record<string, string>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Route segment to resource kind.
 *
 * Keyed on the segment immediately before the id, so both shells work from
 * one table: /sa/:ws/forms/:id and /app/create/forms/:id both end
 * "forms/:id". A segment that is not here yields nothing rather than being
 * guessed at.
 */
const ROUTE_SEGMENTS: Record<string, ContextKind> = {
  booking: "booking_page",
  forms: "form",
  workflows: "workflow",
  contacts: "contact",
  funnel: "funnel",
  funnels: "funnel",
  templates: "message_template",
  community: "community",
};

/**
 * Pull a resource reference out of a route.
 *
 * Deliberately narrow: it matches "<known segment>/<id>" and stops. Trailing
 * sub-pages (/workflows/:id/runs, /community/:id/members) still resolve to
 * the parent resource, which is what the customer is looking at. Query
 * strings and fragments are dropped before anything is read, so nothing from
 * them can reach the model.
 */
export function parseRouteRef(route: unknown): ContextRef | null {
  if (typeof route !== "string" || route.length > 512) return null;
  const path = route.split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean);
  // Walk from the end so the deepest known resource wins: on
  // /community/:id/classroom/:courseId the community is still the subject.
  for (let i = parts.length - 2; i >= 0; i--) {
    const kind = ROUTE_SEGMENTS[parts[i].toLowerCase()];
    const id = parts[i + 1];
    if (kind && ID_RE.test(id)) return { kind, id };
  }
  return null;
}

/** An explicit ref from a component. Shape-checked only; never trusted. */
export function parseExplicitRef(raw: unknown): ContextRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; id?: unknown; childId?: unknown; sectionId?: unknown };
  const kind = typeof r.kind === "string" ? r.kind : "";
  const id = typeof r.id === "string" ? r.id : "";
  if (!ID_RE.test(id)) return null;
  const known: ContextKind[] = [
    "booking_page", "form", "workflow", "contact", "funnel",
    "message_template", "community", "deal", "task", "event", "website",
  ];
  if (!known.includes(kind as ContextKind)) return null;
  const rawChild = typeof r.childId === "string" ? r.childId : typeof r.sectionId === "string" ? r.sectionId : "";
  const childId = ID_RE.test(rawChild) ? rawChild : undefined;
  return { kind: kind as ContextKind, id, ...(childId ? { childId } : {}) };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

/**
 * Load the resource and prove it belongs to this workspace.
 *
 * Every branch returns null for BOTH a foreign resource and a missing one,
 * with no distinguishing delay, message or partial value, so this cannot
 * become a way to ask whether something exists somewhere else.
 */
export async function resolveContextResource(
  subAccountId: string,
  ref: ContextRef,
): Promise<ResolvedContextResource | null> {
  const db = getAdminDb();
  try {
    switch (ref.kind) {
      case "booking_page": {
        // Path-scoped: the workspace is IN the path, so a foreign slug reads
        // as a document that is not there.
        const snap = await db.doc(`subAccounts/${subAccountId}/bookingPages/${ref.id}`).get();
        if (!snap.exists) return null;
        const d = snap.data()!;
        return {
          kind: "booking_page", id: ref.id,
          label: str(d.name, "this booking page"),
          state: `${str(d.status, "draft")}, ${Number(d.durationMinutes ?? 0)} minute meetings`,
          toolArgs: { booking_page_id: ref.id },
        };
      }
      case "form": {
        const snap = await db.doc(`forms/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        const fields = Array.isArray(d.fields) ? d.fields : [];
        const child = ref.childId
          ? fields.find((f: { id?: string }) => f?.id === ref.childId)
          : null;
        return {
          kind: "form", id: ref.id,
          label: str(d.name, "this form"),
          state: `${fields.length} question${fields.length === 1 ? "" : "s"}`,
          ...(child ? { child: { id: String(child.id), label: str(child.label, "a question"), kind: "field" } } : {}),
          toolArgs: { form_id: ref.id },
        };
      }
      case "workflow": {
        const snap = await db.doc(`workflows/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        const nodes = (d.nodes ?? {}) as Record<string, { type?: string; config?: { subject?: string } }>;
        const emailIds = Object.keys(nodes).filter((k) => nodes[k]?.type === "send_email");
        // A child is only meaningful if it is a node of THIS workflow. A node
        // id from another workflow is dropped, not resolved against its own.
        const idx = ref.childId ? emailIds.indexOf(ref.childId) : -1;
        return {
          kind: "workflow", id: ref.id,
          label: str(d.name, "this automation"),
          state: `${str(d.status, "draft")}, ${emailIds.length} email${emailIds.length === 1 ? "" : "s"}`,
          ...(idx >= 0
            ? {
                child: {
                  id: ref.childId!,
                  label: `email ${idx + 1}${nodes[ref.childId!]?.config?.subject ? ` ("${nodes[ref.childId!].config!.subject}")` : ""}`,
                  kind: "email",
                },
              }
            : {}),
          toolArgs: { workflow_id: ref.id, ...(idx >= 0 ? { email_number: String(idx + 1) } : {}) },
        };
      }
      case "message_template": {
        const snap = await db.doc(`message_templates/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        return {
          kind: "message_template", id: ref.id,
          label: str(d.name, "this template"),
          state: str(d.type, "email"),
          toolArgs: { template_id: ref.id },
        };
      }
      case "contact": {
        const snap = await db.doc(`contacts/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        return {
          kind: "contact", id: ref.id,
          label: str(snap.data()!.name, "this contact"),
          state: "",
          toolArgs: { contact_id: ref.id },
        };
      }
      case "deal": {
        const snap = await db.doc(`deals/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        return {
          kind: "deal", id: ref.id,
          label: str(d.title, "this deal"),
          state: `in ${str(d.stageId, "an unknown stage")}`,
          toolArgs: { deal_id: ref.id },
        };
      }
      case "task": {
        const snap = await db.doc(`tasks/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        return {
          kind: "task", id: ref.id,
          label: str(d.title, "this task"),
          state: d.completed ? "done" : "open",
          toolArgs: { task_id: ref.id },
        };
      }
      case "event": {
        const snap = await db.doc(`events/${ref.id}`).get();
        if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return null;
        const d = snap.data()!;
        return {
          kind: "event", id: ref.id,
          label: str(d.title, "this event"),
          // Booking-sourced events cannot be moved, and saying so here stops
          // Zeno proposing a change it will then have to refuse.
          state: d.bookingPageId || d.source === "booking" ? "booked through a booking page" : "a manually created event",
          toolArgs: { event_id: ref.id },
        };
      }
      case "community": {
        const snap = await db.doc(`subAccounts/${subAccountId}/communityGroups/${ref.id}`).get();
        if (!snap.exists) return null;
        return {
          kind: "community", id: ref.id,
          label: str(snap.data()!.name, "this community"),
          state: "",
          toolArgs: { community_id: ref.id },
        };
      }
      case "website": {
        const snap = await db.doc(`subAccounts/${subAccountId}/website/${ref.id}`).get();
        if (!snap.exists) return null;
        const d = snap.data()!;
        return {
          kind: "website", id: ref.id,
          label: str(d.name, "this website"),
          state: str(d.status, "draft"),
          toolArgs: { site_id: ref.id },
        };
      }
      case "funnel":
        // Funnels keep their richer resolver in page-context.ts, which reads
        // sections and the selected one. Duplicating it here would give two
        // answers about the same page.
        return null;
    }
  } catch {
    // A read failure must not be distinguishable from a foreign resource.
    return null;
  }
}

/**
 * Resolve what the customer is looking at.
 *
 * An explicit ref wins: a component knows which child is selected, and a URL
 * cannot say that. The route is the fallback, which is what makes this work
 * on every page without wiring each one up.
 */
export async function resolveCurrentResource(
  subAccountId: string,
  input: { route?: unknown; resourceRef?: unknown },
): Promise<ResolvedContextResource | null> {
  const explicit = parseExplicitRef(input.resourceRef);
  if (explicit) {
    const byRef = await resolveContextResource(subAccountId, explicit);
    if (byRef) return byRef;
  }
  const fromRoute = parseRouteRef(input.route);
  if (!fromRoute) return null;
  return resolveContextResource(subAccountId, fromRoute);
}

/**
 * The context card for a resolved resource.
 *
 * Two things it must get right. The tool arguments are given exactly, so
 * the model never reconstructs an id, which is the failure that made the
 * member editor unreachable a turn after a lookup. And the precedence is
 * stated plainly: what the customer NAMES beats what they are looking at,
 * because "open Saturdays on my 60-minute page" while a different page is
 * open must not edit the one on screen.
 */
export function renderResourceContextLines(r: ResolvedContextResource): string[] {
  const KIND_WORDS: Record<ContextKind, string> = {
    booking_page: "booking page", form: "form", workflow: "automation",
    contact: "contact", funnel: "landing page", message_template: "saved email",
    community: "community", deal: "deal", task: "task", event: "calendar event",
    website: "website",
  };
  const noun = KIND_WORDS[r.kind];
  const lines = [
    `THE CUSTOMER HAS THIS OPEN: the ${noun} "${r.label}"${r.state ? ` (${r.state})` : ""}.`,
    `When they say "this", "this ${noun}", or name no ${noun} at all, they mean that one. Do not ask which.`,
  ];
  if (r.child) {
    lines.push(
      `Within it they have ${r.child.label} selected. A change they describe without naming a different part applies to that one.`,
    );
  }
  lines.push(
    `TOOL ARGUMENTS for it, use these exact values: ${Object.entries(r.toolArgs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(", ")}. These are internal identifiers: never say them to the customer.`,
    // The precedence rule, stated where the model reads the context rather
    // than buried in the global prompt.
    `IF THEY NAME A DIFFERENT ONE, they mean the one they named, not this. Look it up and use that instead. Never edit what is on screen because it was easier to reach.`,
  );
  return lines;
}
