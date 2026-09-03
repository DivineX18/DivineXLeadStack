import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import { materializeCheckoutPrice } from "@/lib/funnels/materialize-price";
import { buildFrameworkSections, type DecisionComplexity, type FunnelDepth } from "@/lib/funnels/frameworks";
import { resolveDesignPack, type DesignPackId } from "@/lib/funnels/design-packs";
import { pruneEmptySections, evaluateSections } from "@/lib/funnels/section-completeness";
import { resolveEffectiveDesignTokens, type DesignStrategy } from "@/lib/funnels/design-strategy";
import type { VisualRequirement, VisualDecision } from "@/types/funnels";
import type {
  CheckoutConfig,
  FunnelDoc,
  FunnelGenre,
  FunnelSection,
  FunnelStatus,
  UpsellOfferConfig,
} from "@/types/funnels";

export class FunnelValidationError extends Error {}

/** Admin-SDK CRUD for the Funnel Builder. All reads/writes are sub-account
 *  scoped — every helper re-checks the doc's `subAccountId`. */

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

/** Excludes post-purchase chain steps (chainRole "upsell"/"downsell") —
 *  those live nested in their parent's "Post-purchase flow" panel, not
 *  the main list. Pass includeChainSteps to get every doc (used by the
 *  chain-cycle check). */
export async function listFunnels(
  subAccountId: string,
  opts?: { includeChainSteps?: boolean },
): Promise<FunnelDoc[]> {
  const snap = await getAdminDb()
    .collection("funnels")
    .where("subAccountId", "==", subAccountId)
    .get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelDoc, "id">) }));
  const filtered = opts?.includeChainSteps
    ? all
    : all.filter((f) => !f.chainRole || f.chainRole === "standalone");
  return filtered.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
}

export async function getFunnel(
  subAccountId: string,
  funnelId: string,
): Promise<FunnelDoc | null> {
  const snap = await getAdminDb().doc(`funnels/${funnelId}`).get();
  if (!snap.exists) return null;
  const f = { id: snap.id, ...(snap.data() as Omit<FunnelDoc, "id">) };
  return f.subAccountId === subAccountId ? f : null;
}

type Seed = Pick<FunnelDoc, "sections">;

const DEFAULT_ACCENT: Record<FunnelGenre, string> = {
  lead_magnet: "#2563eb",
  vsl: "#dc2626",
  challenge: "#22c55e",
  application: "#7c3aed",
  tripwire: "#ea580c",
  webinar: "#0891b2",
  lead_gen: "#2563eb",
};

const DEFAULT_THEME: Record<FunnelGenre, "light" | "dark"> = {
  lead_magnet: "light",
  vsl: "dark",
  challenge: "dark",
  application: "light",
  tripwire: "light",
  webinar: "dark",
  lead_gen: "light",
};

// Genre seeding used to be 7 hand-written, structurally-fixed section
// arrays (one per genre). The "Landing Page Generator RC" replaced that
// with FUNNEL_FRAMEWORKS (lib/funnels/frameworks.ts) — an ordered stage
// list per genre where each stage has a recommended layout plus, for some
// stages, a small set of alternates. buildFrameworkSections() resolves that
// into a real FunnelSection[], optionally letting a caller (the AI Suite)
// override individual stages within their allowed alternates. See that
// module for the full stage-by-genre definitions.

export async function createFunnelServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  genre: FunnelGenre;
  /** Post-purchase chain step creation — bypasses genre seeding in favor
   *  of a single upsell_offer section. */
  chainRole?: "upsell" | "downsell";
  parentFunnelId?: string;
  /** AI Suite layout choices, keyed by framework stage id — see
   *  FUNNEL_FRAMEWORKS. Ignored for chain steps. Omitted/invalid stages
   *  fall back to that stage's recommended layout. */
  stageOverrides?: Record<string, FunnelSection["type"]>;
  /** Adaptive funnel depth (Conversion Engine P0). "lean" strips education
   *  stages a high-intent visitor doesn't need; "standard" (default) keeps the
   *  genre's full sequence. Ignored for chain steps. */
  depth?: FunnelDepth;
  /** Decision complexity (Sales Argument Engine) — high/enterprise injects
   *  decision-SUPPORT stages (what's included, process/rollout, evaluation)
   *  at any persuasion depth. Default low = no injection. */
  complexity?: DecisionComplexity;
  /** Landing Page Design System (RC 1.1) pack — when set, its
   *  defaultAccentColor/defaultTheme take priority over the genre's plain
   *  DEFAULT_ACCENT/DEFAULT_THEME (a design pack's whole point is a
   *  coherent, audience-matched palette). Omitted = "classic", today's
   *  genre-only defaults, unchanged. Superseded by `designStrategy` below
   *  when both are given. */
  designPack?: DesignPackId;
  /** Flow Phase 2 — Design Intelligence. When set, takes priority over
   *  `designPack` for BOTH the stored accent/theme (resolved from the
   *  strategy's palette below) and the render-time tokens (icon style,
   *  radius, density, animation — resolved live by resolveEffectiveDesignTokens,
   *  not stored). Omitted = today's designPack/classic behavior, unchanged. */
  designStrategy?: DesignStrategy | null;
}): Promise<string> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";
  // "classic" is the do-nothing default (same rendering as no pack at all)
  // — treat it like "no preference" so an AI-authored funnel with no real
  // design signal stays structurally identical to one an operator built by
  // hand, rather than gaining a designPack field that changes nothing.
  const pack = opts.designPack && opts.designPack !== "classic" ? resolveDesignPack(opts.designPack) : null;
  const strategyTokens = opts.designStrategy ? resolveEffectiveDesignTokens({ designStrategy: opts.designStrategy }) : null;

  const isChainStep = !!opts.chainRole;
  const seed: Seed = isChainStep
    ? {
        sections: [
          {
            id: "s1",
            type: "upsell_offer",
            config: {
              headline:
                opts.chainRole === "downsell"
                  ? "Wait — how about this instead?"
                  : "Wait — add this to your order?",
              bullets: [],
              priceCents: 0,
              acceptLabel: "Yes, add it!",
              declineLabel: "No thanks",
            },
          },
        ],
      }
    : { sections: buildFrameworkSections(opts.genre, opts.stageOverrides, opts.depth, opts.complexity) };

  const ref = db.collection("funnels").doc();
  const doc: Omit<FunnelDoc, "id"> = {
    subAccountId: opts.subAccountId,
    agencyId,
    createdByUid: opts.createdByUid,
    name: opts.name.trim() || "Untitled funnel",
    genre: opts.genre,
    status: "draft",
    theme: isChainStep ? "light" : (strategyTokens?.theme ?? pack?.defaultTheme ?? DEFAULT_THEME[opts.genre]),
    accentColor: isChainStep
      ? "#2563eb"
      : (strategyTokens?.accentColor ?? pack?.defaultAccentColor ?? DEFAULT_ACCENT[opts.genre]),
    ...(opts.designStrategy && !isChainStep ? { designStrategy: opts.designStrategy } : {}),
    ...(pack && !opts.designStrategy && !isChainStep ? { designPack: pack.id } : {}),
    sections: seed.sections,
    chainRole: opts.chainRole ?? "standalone",
    parentFunnelId: opts.parentFunnelId ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return ref.id;
}

export interface FunnelPatch {
  name?: string;
  status?: FunnelStatus;
  /** P0.5 — actionable unresolved requirements. */
  visualRequirements?: VisualRequirement[];
  /** P0.5 — completed Director decisions, auditable but never actionable. */
  visualDecisions?: VisualDecision[];
  /** P0.5 — the Critic's structured verdict on the composed page. */
  criticVerdict?: FunnelDoc["criticVerdict"];
  theme?: "light" | "dark";
  accentColor?: string;
  designPack?: DesignPackId;
  designStrategy?: DesignStrategy | null;
  /** Stored Campaign Art Direction profile (see FunnelDoc.artDirection). */
  artDirection?: FunnelDoc["artDirection"];
  /** Stored Sales Argument Plan (see FunnelDoc.salesArgument). */
  salesArgument?: FunnelDoc["salesArgument"];
  persuasionDepth?: FunnelDoc["persuasionDepth"];
  /** Thank-you/bridge page config (multistep journey) — see FunnelDoc.bridge. */
  bridge?: FunnelDoc["bridge"];
  /** Webinar/event start time (ISO) — anchors wait_until reminders. */
  eventStartAt?: string | null;
  /** Per-funnel SEO/share metadata. */
  seo?: FunnelDoc["seo"];
  decisionComplexity?: FunnelDoc["decisionComplexity"];
  logoUrl?: string;
  sections?: FunnelSection[];
  /**
   * SHELL SAFETY (final launch pass, checkpoint 1). Set by generated-content
   * writers (the AI Suite). Empty-but-present sections in `sections` are
   * OMITTED before the write, and the save FAILS CLOSED if what remains
   * cannot function as a conversion experience.
   *
   * Deliberately opt-in rather than universal: a human editing in the builder
   * routinely adds a section and fills it a moment later, and silently
   * deleting their in-progress work would be its own defect. A human can see
   * their own blank section; a generated one ships to a paying customer
   * unseen. Publication is guarded separately and unconditionally below.
   */
  enforceCompleteness?: boolean;
}

/** For any `checkout` section in `stripe_checkout` mode, mints/reuses a real
 *  Stripe Product+Price on the tenant's own account for the main offer and
 *  (if present) its order bump, matching each incoming section against its
 *  prior version (by section id) so an unchanged price is never re-minted.
 *  Throws FunnelValidationError if the sub-account has no connected Stripe
 *  and one of the sections needs one — a save must not silently ship a
 *  checkout button with no real price behind it. */
async function materializeSectionsPrices(
  subAccountId: string,
  oldSections: FunnelSection[],
  newSections: FunnelSection[],
): Promise<FunnelSection[]> {
  const needsStripe = newSections.some(
    (s) => s.type === "checkout" && (s.config as CheckoutConfig).checkoutMode === "stripe_checkout",
  );
  if (!needsStripe) return newSections;

  const tenant = await getStripeForTenant(subAccountId);
  if (!tenant) {
    throw new FunnelValidationError(
      "Connect your Stripe account (Settings → Funnel checkout) before using real checkout on a section.",
    );
  }

  const oldById = new Map(oldSections.map((s) => [s.id, s]));

  return Promise.all(
    newSections.map(async (section) => {
      if (section.type !== "checkout") return section;
      const c = { ...(section.config as CheckoutConfig) };
      if (c.checkoutMode !== "stripe_checkout" || !c.priceCents) return { ...section, config: c };

      const old = oldById.get(section.id);
      const oldConfig = old?.type === "checkout" ? (old.config as CheckoutConfig) : null;
      const currency = (c.currency ?? "usd").toLowerCase();
      const billingMode = c.billingMode ?? "one_time";

      const main = await materializeCheckoutPrice(
        tenant.stripe,
        {
          productName: c.headline || "Funnel offer",
          priceCents: c.priceCents,
          currency,
          billingMode,
          recurringInterval: c.recurringInterval,
        },
        oldConfig
          ? {
              productName: oldConfig.headline || "Funnel offer",
              priceCents: oldConfig.priceCents ?? 0,
              currency: (oldConfig.currency ?? "usd").toLowerCase(),
              billingMode: oldConfig.billingMode ?? "one_time",
              recurringInterval: oldConfig.recurringInterval,
              stripeProductId: oldConfig.stripeProductId ?? null,
              stripePriceId: oldConfig.stripePriceId ?? null,
            }
          : null,
      );
      c.stripeProductId = main.stripeProductId;
      c.stripePriceId = main.stripePriceId;
      c.currency = currency;
      c.billingMode = billingMode;

      if (c.orderBump && c.orderBump.priceCents) {
        const oldBump = oldConfig?.orderBump ?? null;
        const bump = await materializeCheckoutPrice(
          tenant.stripe,
          {
            productName: c.orderBump.headline || "Order bump",
            priceCents: c.orderBump.priceCents,
            currency,
            billingMode: "one_time",
          },
          oldBump
            ? {
                productName: oldBump.headline || "Order bump",
                priceCents: oldBump.priceCents,
                currency,
                billingMode: "one_time",
                stripeProductId: null,
                stripePriceId: oldBump.stripePriceId ?? null,
              }
            : null,
        );
        c.orderBump = { ...c.orderBump, stripePriceId: bump.stripePriceId };
      }

      return { ...section, config: c };
    }),
  );
}

function outboundChainTargets(sections: FunnelSection[]): string[] {
  const targets: string[] = [];
  for (const s of sections) {
    if (s.type === "checkout") {
      const c = s.config as CheckoutConfig;
      if (c.upsellFunnelId) targets.push(c.upsellFunnelId);
    }
    if (s.type === "upsell_offer") {
      const c = s.config as UpsellOfferConfig;
      if (c.acceptNextFunnelId) targets.push(c.acceptNextFunnelId);
      if (c.declineFunnelId) targets.push(c.declineFunnelId);
    }
  }
  return targets;
}

/** Rejects a save whose chain pointers would loop back to this funnel —
 *  a real customer mid-purchase must never hit an infinite chain. Builds
 *  the full sub-account's pointer graph in one query (cheap — funnels
 *  are a small collection per tenant) and BFS's from the new outbound
 *  edges, substituting the funnel-being-saved's OWN new sections for its
 *  old ones so a self-referencing edit is caught too. */
async function assertNoChainCycle(
  subAccountId: string,
  funnelId: string,
  newSections: FunnelSection[],
): Promise<void> {
  const start = outboundChainTargets(newSections);
  if (start.length === 0) return;

  const all = await listFunnels(subAccountId, { includeChainSteps: true });
  const edgesById = new Map<string, string[]>();
  for (const f of all) {
    edgesById.set(f.id, f.id === funnelId ? start : outboundChainTargets(f.sections));
  }

  const queue = [...start];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next === funnelId) {
      throw new FunnelValidationError(
        "This chain loops back to the funnel you're editing — a customer could get stuck. Fix the accept/decline links before saving.",
      );
    }
    if (visited.has(next) || visited.size > 200) continue;
    visited.add(next);
    for (const n of edgesById.get(next) ?? []) queue.push(n);
  }
}

export async function updateFunnelServerSide(opts: {
  subAccountId: string;
  funnelId: string;
  patch: FunnelPatch;
}): Promise<boolean> {
  const ref = getAdminDb().doc(`funnels/${opts.funnelId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== opts.subAccountId) {
    return false;
  }
  const { patch } = opts;
  const write: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.name !== undefined) write.name = patch.name.trim() || "Untitled funnel";
  if (patch.status !== undefined) write.status = patch.status;
  if (patch.theme !== undefined) write.theme = patch.theme;
  if (patch.accentColor !== undefined) write.accentColor = patch.accentColor;
  if (patch.designPack !== undefined) write.designPack = patch.designPack;
  if (patch.designStrategy !== undefined) write.designStrategy = patch.designStrategy;
  // P0.5 — the patch application is an explicit allowlist, so a field the
  // TYPE accepts is still silently dropped unless it is written here. An
  // empty array is meaningful (the Director found nothing outstanding), so
  // this checks !== undefined rather than truthiness.
  if (patch.visualRequirements !== undefined) write.visualRequirements = patch.visualRequirements;
  if (patch.visualDecisions !== undefined) write.visualDecisions = patch.visualDecisions;
  if (patch.criticVerdict !== undefined) write.criticVerdict = patch.criticVerdict;
  if (patch.artDirection !== undefined) write.artDirection = patch.artDirection;
  if (patch.salesArgument !== undefined) write.salesArgument = patch.salesArgument;
  if (patch.bridge !== undefined) write.bridge = patch.bridge;
  if (patch.eventStartAt !== undefined) write.eventStartAt = patch.eventStartAt;
  if (patch.seo !== undefined) write.seo = patch.seo;
  if (patch.persuasionDepth !== undefined) write.persuasionDepth = patch.persuasionDepth;
  if (patch.decisionComplexity !== undefined) write.decisionComplexity = patch.decisionComplexity;
  if (patch.logoUrl !== undefined) write.logoUrl = patch.logoUrl;
  const oldData = snap.data() as Omit<FunnelDoc, "id">;

  // ── SHELL SAFETY ────────────────────────────────────────────────────────
  // A section may be minimal. A section may be omitted. A section may NOT be
  // empty-but-present. See lib/funnels/section-completeness.ts.
  let sectionsToWrite = patch.sections;
  if (sectionsToWrite !== undefined && patch.enforceCompleteness) {
    const pruned = pruneEmptySections(sectionsToWrite);
    if (!pruned.viability.viable) {
      // Fail closed. Pruning to nothing is not a repair — it would ship a page
      // that looks finished and does nothing. Never fill the gap with invented
      // copy; the correct outcome is that this write does not happen.
      throw new FunnelValidationError(
        `This page can't be saved as a working funnel yet: ${pruned.viability.reasons.join(" ")}`,
      );
    }
    if (pruned.removed.length > 0) {
      console.warn(
        `[funnels] pruned ${pruned.removed.length} empty section(s) from ${opts.funnelId}: ` +
          pruned.removed.map((r) => `${r.sectionType} (${r.reason})`).join("; "),
      );
    }
    sectionsToWrite = pruned.sections;
  }

  // Publication is guarded unconditionally, for every author. Going live is
  // the moment a shell stops being an internal draft artifact and starts
  // being what a paying customer's traffic lands on. Nothing is deleted here
  // — the operator is told exactly what to fill or remove.
  if (patch.status === "published") {
    const finalSections = sectionsToWrite ?? oldData.sections ?? [];
    const blanks = evaluateSections(finalSections).filter((e) => e.state === "empty");
    if (blanks.length > 0) {
      throw new FunnelValidationError(
        `Fill in or remove these empty sections before publishing: ${blanks
          .map((b) => `${b.sectionType} — ${b.reason}`)
          .join(" ")}`,
      );
    }
  }

  if (sectionsToWrite !== undefined) {
    await assertNoChainCycle(opts.subAccountId, opts.funnelId, sectionsToWrite);
    write.sections = await materializeSectionsPrices(
      opts.subAccountId,
      oldData.sections,
      sectionsToWrite,
    );
  }
  await ref.update(write);
  return true;
}

export async function deleteFunnelServerSide(
  subAccountId: string,
  funnelId: string,
): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.doc(`funnels/${funnelId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return false;

  const linkedChildren = await db
    .collection("funnels")
    .where("subAccountId", "==", subAccountId)
    .where("parentFunnelId", "==", funnelId)
    .limit(1)
    .get();
  if (!linkedChildren.empty) {
    throw new FunnelValidationError(
      "This funnel has linked upsell/downsell steps — remove those from the Post-purchase flow panel first.",
    );
  }

  await ref.delete();
  return true;
}
