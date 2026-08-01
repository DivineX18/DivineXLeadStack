import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  FunnelDoc,
  FunnelGenre,
  FunnelSection,
  FunnelStatus,
} from "@/types/funnels";

/** Admin-SDK CRUD for the Funnel Builder. All reads/writes are sub-account
 *  scoped — every helper re-checks the doc's `subAccountId`. */

function toMillis(v: unknown): number {
  const m = v as { toMillis?: () => number } | null;
  return m && typeof m.toMillis === "function" ? m.toMillis() : 0;
}

export async function listFunnels(subAccountId: string): Promise<FunnelDoc[]> {
  const snap = await getAdminDb()
    .collection("funnels")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelDoc, "id">) }))
    .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
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
}): Promise<string> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  const seed = SEEDS[opts.genre]();

  const ref = db.collection("funnels").doc();
  const doc: Omit<FunnelDoc, "id"> = {
    subAccountId: opts.subAccountId,
    agencyId,
    createdByUid: opts.createdByUid,
    name: opts.name.trim() || "Untitled funnel",
    genre: opts.genre,
    status: "draft",
    theme: DEFAULT_THEME[opts.genre],
    accentColor: DEFAULT_ACCENT[opts.genre],
    sections: seed.sections,
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
  if (patch.sections !== undefined) write.sections = patch.sections;
  await ref.update(write);
  return true;
}

export async function deleteFunnelServerSide(
  subAccountId: string,
  funnelId: string,
): Promise<boolean> {
  const ref = getAdminDb().doc(`funnels/${funnelId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.subAccountId !== subAccountId) return false;
  await ref.delete();
  return true;
}
