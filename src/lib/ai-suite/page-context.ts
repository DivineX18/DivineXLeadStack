import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";

/**
 * ZENO PAGE + ARTIFACT CONTEXT — P0.6 Phase 2.
 *
 * THE SECURITY SHAPE OF THIS MODULE IS THE POINT.
 *
 * The client says WHERE the customer is. The server decides WHAT the customer
 * is allowed to know there. A route string and an artifact id are both
 * untrusted hints; neither authorizes anything.
 *
 *   route       → normalized against a fixed whitelist of the final P0.3 IA
 *                 surfaces. An unrecognised value becomes null, so an
 *                 arbitrary string can never reach the system prompt.
 *   artifactRef → re-resolved from authoritative storage and proven to belong
 *                 to the AUTHENTICATED workspace before one byte of it is
 *                 rendered.
 *
 * NON-ENUMERATION. A foreign artifact and a nonexistent one produce the
 * IDENTICAL result: null. No name, status, metadata, or existence signal
 * distinguishes them, so this cannot become a tenant-enumeration path. The
 * caller therefore cannot tell the customer "that belongs to another
 * workspace" — it has nothing to tell them with.
 */

/** The final P0.3 IA. Anything else normalizes away. */
const IA_SURFACES = ["home", "create", "leads", "performance", "intelligence", "settings"] as const;
export type IaSurface = (typeof IA_SURFACES)[number];

export interface PageContextInput {
  route?: unknown;
  artifactRef?: unknown;
}

/**
 * Normalize a client route to one IA surface. Deliberately does NOT pass
 * through the raw path: injecting `/app/create/funnels/abc123?x=<anything>`
 * into a system prompt would hand the client a channel into the model.
 */
export function normalizeSurface(route: unknown): IaSurface | null {
  if (typeof route !== "string") return null;
  // Take only the first path segment after an optional /app prefix.
  const seg = route.replace(/^\/+/, "").replace(/^app\/?/, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";
  return (IA_SURFACES as readonly string[]).includes(seg) ? (seg as IaSurface) : null;
}

function parseArtifactRef(raw: unknown): { kind: string; id: string; sectionId?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { kind, id, sectionId } = raw as { kind?: unknown; id?: unknown; sectionId?: unknown };
  if (typeof kind !== "string" || typeof id !== "string") return null;
  // Only funnels are resolvable today. An unknown kind resolves to nothing
  // rather than being trusted.
  if (kind !== "funnel") return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  // The selected section is a hint, not an authority: it only ever selects
  // from sections already proven to belong to this workspace's funnel.
  const sec = typeof sectionId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sectionId) ? sectionId : undefined;
  return { kind, id, ...(sec ? { sectionId: sec } : {}) };
}

export interface ResolvedArtifact {
  kind: "funnel";
  name: string;
  status: string;
  /** Customer-level review state, not internal orchestration metadata. */
  outstandingPhotos: number;
  reviewed: boolean;
  /** VISUAL EDITOR CONTEXT. The page as it stands RIGHT NOW, read from the
   *  stored doc rather than trusted from the client, so Zeno reasons about the
   *  customer's actual draft instead of regenerating from a title. */
  sections?: { type: string; heading: string; role?: string }[];
  /** The section the customer currently has selected, when any. */
  selected?: { type: string; heading: string; role?: string } | null;
  /** MACHINE REFERENCES for tool calls. A capability that edits this page
   *  needs the ids, and the model has no other way to learn them — the card
   *  is otherwise deliberately id-free. Same precedent as create_funnel
   *  returning a funnel id for bridge linking. Never spoken to the customer. */
  refIds?: { funnelId: string; sectionId?: string | null };
}

/**
 * Resolve an artifact ONLY if it belongs to the authenticated workspace.
 * Returns null for foreign AND for nonexistent — indistinguishable by design.
 */
export async function resolveArtifact(
  subAccountId: string,
  raw: unknown,
): Promise<ResolvedArtifact | null> {
  const ref = parseArtifactRef(raw);
  if (!ref) return null;
  try {
    const snap = await getAdminDb().doc(`funnels/${ref.id}`).get();
    if (!snap.exists) return null;
    const data = snap.data() as {
      subAccountId?: string; name?: string; status?: string;
      visualRequirements?: { resolvedWith?: unknown }[];
      criticVerdict?: { verdict?: string } | null;
      sections?: { id?: string; type?: string; config?: Record<string, unknown>; argumentRole?: string }[];
    };
    // THE OWNERSHIP PROOF. Everything below this line is gated on it.
    if (data.subAccountId !== subAccountId) return null;

    // A compact view of the real draft. Headings only — enough for Zeno to
    // reason about order, gaps and emphasis without pulling whole page copy
    // into every prompt.
    const rawSections = Array.isArray(data.sections) ? data.sections : [];
    const describe = (sec: { type?: string; config?: Record<string, unknown>; argumentRole?: string }) => {
      const cfg = sec.config ?? {};
      const heading =
        [cfg.headline, cfg.problemHeadline, cfg.byline, cfg.text]
          .find((x) => typeof x === "string" && x.trim()) ?? "";
      return {
        type: String(sec.type ?? "section"),
        heading: String(heading).slice(0, 80),
        ...(sec.argumentRole ? { role: String(sec.argumentRole) } : {}),
      };
    };
    const sections = rawSections.slice(0, 20).map(describe);
    const selected = ref.sectionId ? (rawSections.find((x) => x.id === ref.sectionId) ?? null) : null;

    return {
      kind: "funnel",
      refIds: { funnelId: ref.id, ...(ref.sectionId ? { sectionId: ref.sectionId } : {}) },
      sections,
      selected: selected ? describe(selected as never) : null,
      name: typeof data.name === "string" ? data.name : "Untitled",
      status: typeof data.status === "string" ? data.status : "draft",
      outstandingPhotos: (data.visualRequirements ?? []).filter((r) => !r.resolvedWith).length,
      reviewed: !!data.criticVerdict,
    };
  } catch {
    // A read failure must not leak a distinguishable outcome either.
    return null;
  }
}

const SURFACE_MEANING: Record<IaSurface, string> = {
  home: "their starting overview of the business.",
  create: "Create — where campaigns, landing pages and follow-up are built.",
  leads: "Leads — the people who have come in, and their pipeline.",
  performance: "Performance — the business outcomes and what has moved.",
  intelligence: "Intelligence — the diagnosis of the business and its opportunities.",
  settings: "Settings — configuration for this workspace.",
};

/**
 * Render the page-context card. Returns null when nothing trustworthy is
 * known, so no empty or speculative card is ever added.
 */
export function renderPageContextCard(
  surface: IaSurface | null,
  artifact: ResolvedArtifact | null,
): AiSuiteKnowledgeCard | null {
  if (!surface && !artifact) return null;

  const lines: string[] = [];
  if (surface) {
    lines.push(`The customer is currently looking at ${SURFACE_MEANING[surface]}`);
  }
  if (artifact?.sections?.length) {
    lines.push(
      `THE PAGE AS IT STANDS RIGHT NOW, in order: ${artifact.sections
        .map((x, i) => `${i + 1}. ${x.type}${x.heading ? ` — "${x.heading}"` : ""}`)
        .join("; ")}.`,
      "Reason about THIS draft. Do not regenerate the page from its title or from defaults — the customer's own edits are the starting point.",
    );
  }
  if (artifact?.refIds) {
    lines.push(
      `TOOL REFERENCES for this page — use these exact values when calling a tool that edits it: funnel_id="${artifact.refIds.funnelId}"${artifact.refIds.sectionId ? `, section_id="${artifact.refIds.sectionId}"` : ""}. These are internal identifiers: never say them to the customer.`,
    );
  }
  if (artifact?.selected) {
    lines.push(
      `The customer has SELECTED the ${artifact.selected.type} section${artifact.selected.heading ? ` ("${artifact.selected.heading}")` : ""}. Unless they ask for a page-wide change, keep your change scoped to that section.`,
    );
  }
  if (artifact) {
    // Customer-level state only — no ids, no internal orchestration metadata.
    // U1 governs what reaches customer prose; this keeps the temptation out
    // of the context in the first place.
    lines.push(
      `They have a landing page open: “${artifact.name}”. It is ${artifact.status === "published" ? "live" : "still a draft"}.` +
        (artifact.outstandingPhotos > 0
          ? ` ${artifact.outstandingPhotos} real photo${artifact.outstandingPhotos === 1 ? "" : "s"} would still strengthen it.`
          : ""),
    );
  }
  lines.push(
    "",
    "USE THIS: they can see this screen — do not ask them what they are working on or which page they mean. Answer in terms of what is in front of them.",
  );

  return {
    id: "zeno-page-context",
    levels: ["sub-account"],
    title: "What the customer is looking at right now",
    location: "Current screen",
    keywords: ["current", "page", "this", "here", "screen"],
    body: lines.join("\n"),
  };
}
