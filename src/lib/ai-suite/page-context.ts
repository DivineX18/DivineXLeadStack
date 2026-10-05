import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";
import {
  isFlowAssetKind,
  readFlowAsset,
  type FlowAssetKind,
  type FlowAssetView,
} from "@/lib/ai-suite/flow-domains";

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
  // Any kind the Flow domain registry knows is resolvable. An unknown kind
  // resolves to nothing rather than being trusted.
  if (!isFlowAssetKind(kind)) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  // The selected section is a hint, not an authority: it only ever selects
  // from sections already proven to belong to this workspace's funnel.
  const sec = typeof sectionId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sectionId) ? sectionId : undefined;
  return { kind, id, ...(sec ? { sectionId: sec } : {}) };
}

/**
 * One section as Zeno needs to see it.
 *
 * This used to be the type plus an 80-character heading, which is why Zeno
 * kept answering "I need to see the real current wording": it genuinely had
 * not been shown any. It now carries the copy the customer can read on
 * screen, so a request like "strengthen the trust language in the hero" can
 * be reasoned about instead of asked about.
 *
 * Still a SUMMARY, not the raw document. Every field is capped and the
 * machine-only parts of a config (design tokens, ids, layout flags) stay
 * out, because the prompt is paid for on every turn and none of that helps
 * the model write better copy.
 */
export interface FunnelSectionView {
  /** The id a mutation tool needs. Never spoken to the customer. */
  id: string;
  type: string;
  heading: string;
  role?: string;
  /** Supporting copy, in the order a reader meets it. */
  copy?: string[];
  /** The call to action, when the section has one. */
  cta?: string;
  /** What the section points at, so Zeno can see a dead or wrong link. */
  ctaHref?: string;
  /** Whether a capture form is attached, which changes what the CTA means. */
  hasForm?: boolean;
  /** Media actually present, or a placeholder waiting to be filled. */
  media?: string;
  /** Listed items (benefits, FAQ questions, testimonials), truncated. */
  items?: string[];
}

export interface ResolvedArtifact {
  kind: FlowAssetKind;
  name: string;
  status: string;
  /** Customer-level review state, not internal orchestration metadata. */
  outstandingPhotos: number;
  reviewed: boolean;
  /** VISUAL EDITOR CONTEXT. The page as it stands RIGHT NOW, read from the
   *  stored doc rather than trusted from the client, so Zeno reasons about the
   *  customer's actual draft instead of regenerating from a title. */
  sections?: FunnelSectionView[];
  /** The section the customer currently has selected, when any. */
  selected?: FunnelSectionView | null;
  /** For every non-funnel asset: the registry's own structured view. The
   *  funnel keeps its richer section renderer below, because a landing page
   *  is the one asset whose copy is edited line by line in chat. */
  view?: FlowAssetView | null;
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
  if (ref.kind !== "funnel") {
    // One ownership-proving read for every other domain. Same
    // non-enumeration contract: foreign and nonexistent are both null.
    const view = await readFlowAsset(subAccountId, ref.kind as FlowAssetKind, ref.id);
    if (!view) return null;
    return {
      kind: view.kind,
      view,
      name: view.name,
      status: view.state,
      outstandingPhotos: 0,
      reviewed: false,
    };
  }
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
    const describe = (sec: {
      id?: string;
      type?: string;
      config?: Record<string, unknown>;
      argumentRole?: string;
    }): FunnelSectionView => {
      const cfg = sec.config ?? {};
      const str = (v: unknown, max = 200) =>
        typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "";
      const heading =
        [cfg.headline, cfg.problemHeadline, cfg.solutionHeadline, cfg.byline, cfg.text]
          .map((x) => str(x, 120))
          .find(Boolean) ?? "";

      // Prose, in reading order. Paragraph arrays are joined so a story
      // section reads as a story rather than as a list of fragments.
      const copy: string[] = [];
      for (const key of ["subheadline", "subtext", "problemText", "solutionText", "body", "bodyText", "description"]) {
        const v = str(cfg[key], 300);
        if (v) copy.push(v);
      }
      if (Array.isArray(cfg.paragraphs)) {
        const joined = (cfg.paragraphs as unknown[]).map((x) => str(x, 300)).filter(Boolean).join(" ");
        if (joined) copy.push(joined.slice(0, 600));
      }

      // Listed content, which is where most of a page's substance lives.
      const items: string[] = [];
      const listOf = (arr: unknown, pick: (o: Record<string, unknown>) => unknown) => {
        if (!Array.isArray(arr)) return;
        for (const raw of (arr as unknown[]).slice(0, 8)) {
          const v = typeof raw === "string" ? raw : pick((raw ?? {}) as Record<string, unknown>);
          const t = str(v, 120);
          if (t) items.push(t);
        }
      };
      listOf(cfg.items, (o) => o.title ?? o.question ?? o.text ?? o.label);
      listOf(cfg.bullets, (o) => o.text ?? o.title);
      listOf(cfg.testimonials, (o) => o.quote ?? o.text);
      listOf(cfg.tiers, (o) => o.name ?? o.title);
      listOf(cfg.steps, (o) => o.title);

      const mediaUrl = str(cfg.mediaUrl ?? cfg.imageUrl ?? cfg.photoUrl ?? cfg.embedUrl, 120);
      const placeholder = str(cfg.mediaPlaceholderLabel ?? cfg.photoPlaceholderLabel, 160);
      const media = mediaUrl
        ? (cfg.mediaIsStock === true ? "stock image in place" : "real image in place")
        : placeholder
          ? `placeholder, no image yet: ${placeholder}`
          : "";

      const cta = str(cfg.ctaLabel ?? cfg.buttonLabel, 80);
      const href = str(cfg.ctaHref, 120);
      return {
        id: String(sec.id ?? ""),
        type: String(sec.type ?? "section"),
        heading,
        ...(sec.argumentRole ? { role: String(sec.argumentRole) } : {}),
        ...(copy.length ? { copy } : {}),
        ...(cta ? { cta } : {}),
        ...(href ? { ctaHref: href } : {}),
        ...(cfg.formId ? { hasForm: true } : {}),
        ...(media ? { media } : {}),
        ...(items.length ? { items } : {}),
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
  create: "Create, where campaigns, landing pages and follow-up are built.",
  leads: "Leads, the people who have come in, and their pipeline.",
  performance: "Performance, the business outcomes and what has moved.",
  intelligence: "Intelligence, the diagnosis of the business and its opportunities.",
  settings: "Settings, configuration for this workspace.",
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
  if (artifact?.view) {
    // Every non-funnel asset, written out the same way: what it is, what
    // state it is in, what it actually says, and what it connects to. The
    // customer should never be asked to describe something the server holds.
    const v = artifact.view;
    lines.push(
      `THE ${v.label.toUpperCase()} THE CUSTOMER HAS OPEN, read from their real workspace just now: "${v.name}" (${v.state}).`,
      ...v.lines.map((l) => `   ${l}`),
      "You have read it. Do not ask the customer what it says or what it is set to. Quote it back when that helps.",
    );
    if (v.edges.length) {
      lines.push(
        `It is connected to: ${v.edges.map((e) => `${e.relation} ${e.kind.replace(/_/g, " ")} ${e.id}`).join("; ")}. ` +
          `Use trace_connected_system to follow the journey before judging why it is not converting.`,
      );
    }
    lines.push(
      `TOOL REFERENCES for this ${v.label}. Use these exact values: ` +
        `${Object.entries(v.refs).map(([k, val]) => `${k}="${val}"`).join(", ")}. ` +
        `These are internal identifiers: never say them to the customer.`,
    );
    const ops = Object.keys(v.operations);
    if (ops.length) {
      lines.push(
        `Supported changes here: ${Object.entries(v.operations).map(([op, tool]) => `${op} (${tool})`).join(", ")}. ` +
          `If they ask for something outside that list, say plainly that it is not something you can change from here.`,
      );
    }
  }
  if (artifact?.sections?.length) {
    // The page written out, section by section, because a list of types is
    // not something anyone can give an opinion about. Each line carries the
    // section's own id so an edit can be aimed precisely rather than by
    // position, which changes the moment anything is reordered.
    lines.push("THE PAGE AS IT STANDS RIGHT NOW, in order. This is the customer's real draft:");
    artifact.sections.forEach((x, i) => {
      const parts: string[] = [`${i + 1}. [${x.type}] id=${x.id}`];
      if (x.heading) parts.push(`heading: "${x.heading}"`);
      if (x.copy?.length) parts.push(`copy: "${x.copy.join(" / ")}"`);
      if (x.items?.length) parts.push(`items: ${x.items.map((t) => `"${t}"`).join(", ")}`);
      if (x.cta) parts.push(`button: "${x.cta}"${x.ctaHref ? ` -> ${x.ctaHref}` : ""}`);
      if (x.hasForm) parts.push("has a capture form");
      if (x.media) parts.push(`media: ${x.media}`);
      lines.push(`   ${parts.join(" | ")}`);
    });
    lines.push(
      "That is the whole page. You have read it, so do not ask the customer what it says, what sections exist, or to paste their own copy to you. Quote it back when it helps.",
      "Reason about THIS draft. Do not regenerate the page from its title or from defaults, the customer's own edits are the starting point.",
      "Each section's id above is what an edit tool needs. Aim at the id, never at the position.",
    );
  }
  if (artifact?.refIds) {
    lines.push(
      `TOOL REFERENCES for this page. Use these exact values when calling a tool that edits it: funnel_id="${artifact.refIds.funnelId}"${artifact.refIds.sectionId ? `, section_id="${artifact.refIds.sectionId}"` : ""}. These are internal identifiers: never say them to the customer.`,
    );
  }
  if (artifact?.selected) {
    lines.push(
      `The customer has SELECTED the ${artifact.selected.type} section${artifact.selected.heading ? ` ("${artifact.selected.heading}")` : ""}. Unless they ask for a page-wide change, keep your change scoped to that section.`,
    );
  }
  if (artifact && !artifact.view) {
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
    "USE THIS: they can see this screen. Do not ask them what they are working on or which page they mean. Answer in terms of what is in front of them.",
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
