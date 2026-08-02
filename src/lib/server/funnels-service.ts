import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeForTenant } from "@/lib/stripe/tenant-server";
import { materializeCheckoutPrice } from "@/lib/funnels/materialize-price";
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

function leadMagnetSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "hero",
      config: {
        eyebrow: "Your FREE copy will show you how to:",
        headline: "Write your headline here",
        subheadline: "",
        mediaType: "video",
        mediaUrl: "",
      },
    },
    {
      id: "s2",
      type: "proof_strip",
      config: { variant: "rating", rating: { score: 4.8, reviewCount: 0, scale: 5 } },
    },
    {
      id: "s3",
      type: "offer",
      config: {
        headline: "Get your free copy today",
        priceCents: 0,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Send me my copy",
      },
    },
    { id: "s4", type: "proof_strip", config: { variant: "logos", logos: [] } },
    {
      id: "s5",
      type: "story",
      config: { byline: "From: Your Name, Your City", paragraphs: [] },
    },
    { id: "s6", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

function vslSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "countdown",
      config: { endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
    },
    {
      id: "s2",
      type: "hero",
      config: {
        headline: "Write your headline here",
        subheadline: "",
        mediaType: "video",
        mediaUrl: "",
      },
    },
    {
      id: "s3",
      type: "offer",
      config: {
        headline: "",
        priceCents: 0,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Get instant access",
        ctaHref: "",
      },
    },
    {
      id: "s4",
      type: "cta_banner",
      config: { headline: "Ready to get started?", ctaLabel: "Get instant access", ctaHref: "" },
    },
  ];
  return { sections };
}

function challengeSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "countdown",
      config: { endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
    },
    {
      id: "s2",
      type: "hero",
      config: {
        headline: "Write your headline here",
        subheadline: "",
        mediaType: "none",
      },
    },
    { id: "s3", type: "agenda", config: { days: [] } },
    { id: "s4", type: "ticket_tiers", config: { tiers: [] } },
    { id: "s5", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

function applicationSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "hero",
      config: {
        eyebrow: "Apply now — limited spots",
        headline: "Write your headline here",
        subheadline: "",
        mediaType: "none",
      },
    },
    {
      id: "s2",
      type: "proof_strip",
      config: { variant: "rating", rating: { score: 4.9, reviewCount: 0, scale: 5 } },
    },
    {
      id: "s3",
      type: "story",
      config: { byline: "Why this works", paragraphs: [] },
    },
    {
      id: "s4",
      type: "guarantee",
      config: { headline: "", bodyText: "", badgeIcon: "shield" },
    },
    {
      id: "s5",
      type: "offer",
      config: {
        headline: "Apply for a spot",
        priceCents: null,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Apply now",
      },
    },
    { id: "s6", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

/** Low-ticket entry-product funnel — the natural home for the checkout +
 *  order-bump + upsell/downsell work landing in later slices. Seeded with
 *  a plain `offer` section for now; revisit once the `checkout` section
 *  type ships (Slice 2) to seed `checkoutMode: "stripe_checkout"` instead. */
function tripwireSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "hero",
      config: { headline: "Write your headline here", subheadline: "", mediaType: "none" },
    },
    {
      id: "s2",
      type: "proof_strip",
      config: { variant: "rating", rating: { score: 4.8, reviewCount: 0, scale: 5 } },
    },
    {
      id: "s3",
      type: "offer",
      config: {
        headline: "",
        priceCents: 700,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Get instant access",
        ctaHref: "",
      },
    },
    { id: "s4", type: "trust_badges", config: { badges: [] } },
    {
      id: "s5",
      type: "guarantee",
      config: { headline: "", bodyText: "", badgeIcon: "shield" },
    },
    { id: "s6", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

function webinarSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "countdown",
      config: { endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
    },
    {
      id: "s2",
      type: "hero",
      config: { headline: "Write your headline here", subheadline: "", mediaType: "none" },
    },
    { id: "s3", type: "agenda", config: { days: [] } },
    {
      id: "s4",
      type: "offer",
      config: {
        headline: "Save your seat",
        priceCents: 0,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Register now",
      },
    },
    { id: "s5", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

/** Generic interest capture — no specific magnet asset, distinct from
 *  lead_magnet's "free book/PDF" framing. */
function leadGenSeed(): Seed {
  const sections: FunnelSection[] = [
    {
      id: "s1",
      type: "hero",
      config: { headline: "Write your headline here", subheadline: "", mediaType: "none" },
    },
    { id: "s2", type: "proof_strip", config: { variant: "logos", logos: [] } },
    {
      id: "s3",
      type: "offer",
      config: {
        headline: "",
        priceCents: null,
        strikethroughPriceCents: null,
        bullets: [],
        formId: null,
        ctaLabel: "Get in touch",
      },
    },
    { id: "s4", type: "trust_badges", config: { badges: [] } },
    { id: "s5", type: "faq", config: { items: [] } },
  ];
  return { sections };
}

const SEEDS: Record<FunnelGenre, () => Seed> = {
  lead_magnet: leadMagnetSeed,
  vsl: vslSeed,
  challenge: challengeSeed,
  application: applicationSeed,
  tripwire: tripwireSeed,
  webinar: webinarSeed,
  lead_gen: leadGenSeed,
};

export async function createFunnelServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  genre: FunnelGenre;
  /** Post-purchase chain step creation — bypasses genre seeding in favor
   *  of a single upsell_offer section. */
  chainRole?: "upsell" | "downsell";
  parentFunnelId?: string;
}): Promise<string> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

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
    : SEEDS[opts.genre]();

  const ref = db.collection("funnels").doc();
  const doc: Omit<FunnelDoc, "id"> = {
    subAccountId: opts.subAccountId,
    agencyId,
    createdByUid: opts.createdByUid,
    name: opts.name.trim() || "Untitled funnel",
    genre: opts.genre,
    status: "draft",
    theme: isChainStep ? "light" : DEFAULT_THEME[opts.genre],
    accentColor: isChainStep ? "#2563eb" : DEFAULT_ACCENT[opts.genre],
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
  theme?: "light" | "dark";
  accentColor?: string;
  sections?: FunnelSection[];
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
  if (patch.sections !== undefined) {
    await assertNoChainCycle(opts.subAccountId, opts.funnelId, patch.sections);
    const oldData = snap.data() as Omit<FunnelDoc, "id">;
    write.sections = await materializeSectionsPrices(
      opts.subAccountId,
      oldData.sections,
      patch.sections,
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
