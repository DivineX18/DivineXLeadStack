import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteFunnelServerSide,
  FunnelValidationError,
  getFunnel,
  updateFunnelServerSide,
  type FunnelPatch,
} from "@/lib/server/funnels-service";
import type { FunnelSection, FunnelSectionType } from "@/types/funnels";
import { DESIGN_PACKS } from "@/lib/funnels/design-packs";
import {
  VISUAL_ARCHETYPE_IDS,
  resolveDesignStrategy,
  type VisualArchetype,
  type TypographyPairingId,
  type HeroLayoutId,
  type AnimationLevel,
  type VisualDensity,
  type MediaStrategyId,
  type CtaStrategyId,
} from "@/lib/funnels/design-strategy";

export const dynamic = "force-dynamic";

const SECTION_TYPES: FunnelSectionType[] = [
  "hero",
  "proof_strip",
  "offer",
  "story",
  "faq",
  "cta_banner",
  "countdown",
  "agenda",
  "ticket_tiers",
  "guarantee",
  "trust_badges",
  "checkout",
  "upsell_offer",
  "video",
  "benefits_grid",
  "problem_solution",
  "before_after",
  "included",
  "comparison",
  "testimonials",
  "stats",
  "callout",
  "team",
  "image_text",
  "photo_gallery",
  "business_footer",
];

/** The renderer's own canvas vocabulary — mirrors SectionCanvas in
 *  types/funnels.ts so an unknown value can never reach the renderer. */
const SECTION_CANVASES = [
  "clean", "warm_paper", "brand_tint", "dark_immersive", "high_contrast_cta", "photographic",
] as const;
type SectionCanvas = (typeof SECTION_CANVASES)[number];

/** Defensive sanitize of a client-supplied sections array — authed staff,
 *  but keep the shape honest so a malformed save can't poison the renderer. */
function sanitizeSections(raw: unknown): FunnelSection[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FunnelSection[] = [];
  for (const v of raw) {
    const s = v as Partial<FunnelSection>;
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.type !== "string" ||
      !SECTION_TYPES.includes(s.type as FunnelSectionType) ||
      !s.config ||
      typeof s.config !== "object"
    ) {
      return null;
    }
    // PRESERVE THE COMPOSED PLAN. argumentRole/servesBelief are how the Sales
    // Argument Plan is structurally consumed, and canvas is the art-direction
    // surface that gives the page its story-fold rhythm. Dropping them here
    // meant the FIRST human edit silently destroyed all three — generation
    // stamped them correctly, then a save reduced the page to bare sections.
    // Validated, not trusted: only known-shaped values survive.
    const canvas = (SECTION_CANVASES as readonly string[]).includes(s.canvas as string) ? (s.canvas as SectionCanvas) : undefined;
    out.push({
      id: s.id,
      type: s.type as FunnelSectionType,
      config: s.config,
      ...(typeof s.argumentRole === "string" && s.argumentRole ? { argumentRole: s.argumentRole.slice(0, 40) } : {}),
      ...(typeof s.servesBelief === "string" && s.servesBelief ? { servesBelief: s.servesBelief.slice(0, 240) } : {}),
      ...(canvas ? { canvas } : {}),
    });
  }
  return out;
}

/** Re-resolves a client-supplied design-strategy payload through
 *  resolveDesignStrategy() rather than trusting it verbatim — the client
 *  only ever needs to send the archetype + which axes it wants to
 *  override; every derived token (cardStyle, iconStyle, backgroundRhythm,
 *  etc.) always comes from the server's own archetype catalog, never from
 *  the request body, so a malformed/forged payload can't smuggle an
 *  unapproved combination onto a live page. Returns `undefined` for an
 *  invalid/missing archetype (caller treats that as "field not present"),
 *  `null` when the client explicitly wants to clear it back to designPack.
 */
function sanitizeDesignStrategy(raw: unknown): ReturnType<typeof resolveDesignStrategy> | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const archetype = typeof r.visualArchetype === "string" && VISUAL_ARCHETYPE_IDS.includes(r.visualArchetype as VisualArchetype)
    ? (r.visualArchetype as VisualArchetype)
    : undefined;
  if (!archetype) return undefined;
  return resolveDesignStrategy(archetype, {
    paletteId: typeof r.paletteId === "string" ? r.paletteId : undefined,
    colorMode: r.colorMode === "light" || r.colorMode === "dark" || r.colorMode === "mixed" ? r.colorMode : undefined,
    typographyPairing: typeof r.typographyPairing === "string" ? (r.typographyPairing as TypographyPairingId) : undefined,
    heroLayout: typeof r.heroLayout === "string" ? (r.heroLayout as HeroLayoutId) : undefined,
    animationLevel: typeof r.animationLevel === "string" ? (r.animationLevel as AnimationLevel) : undefined,
    visualDensity: typeof r.visualDensity === "string" ? (r.visualDensity as VisualDensity) : undefined,
    mediaStrategy: typeof r.mediaStrategy === "string" ? (r.mediaStrategy as MediaStrategyId) : undefined,
    ctaStrategy: typeof r.ctaStrategy === "string" ? (r.ctaStrategy as CtaStrategyId) : undefined,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ funnel });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: FunnelPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.status === "draft" || body.status === "published") {
    patch.status = body.status;
  }
  if (body.theme === "light" || body.theme === "dark") patch.theme = body.theme;
  if (typeof body.accentColor === "string") patch.accentColor = body.accentColor;
  if (typeof body.designPack === "string" && body.designPack in DESIGN_PACKS) {
    patch.designPack = body.designPack as FunnelPatch["designPack"];
  }
  if ("designStrategy" in body) {
    const strategy = sanitizeDesignStrategy(body.designStrategy);
    if (strategy !== undefined) patch.designStrategy = strategy;
  }
  if (typeof body.logoUrl === "string") patch.logoUrl = body.logoUrl.trim().slice(0, 1000);
  if (body.bridge !== undefined && typeof body.bridge === "object" && body.bridge !== null) {
    // Thank-you/bridge page config (multistep journey). Undefined-valued keys
    // are stripped so the Firestore write never sees them.
    const b = body.bridge as Record<string, unknown>;
    const str = (v: unknown, cap: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : undefined;
    const bridge: NonNullable<FunnelPatch["bridge"]> = {};
    const headline = str(b.headline, 200);
    const message = str(b.message, 600);
    const nextCta = str(b.nextCta, 80);
    const nextLabel = str(b.nextLabel, 80);
    const nextHeadline = str(b.nextHeadline, 200);
    if (headline) bridge.headline = headline;
    if (message) bridge.message = message;
    if (nextCta) bridge.nextCta = nextCta;
    if (nextLabel) bridge.nextLabel = nextLabel;
    if (nextHeadline) bridge.nextHeadline = nextHeadline;
    bridge.nextFunnelId =
      typeof b.nextFunnelId === "string" && /^[A-Za-z0-9_-]{10,40}$/.test(b.nextFunnelId)
        ? b.nextFunnelId
        : null;
    patch.bridge = bridge;
  }
  if (body.seo !== undefined && typeof body.seo === "object" && body.seo !== null) {
    const o = body.seo as Record<string, unknown>;
    const str2 = (v: unknown, cap: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : undefined;
    const seo: NonNullable<FunnelPatch["seo"]> = {};
    const title = str2(o.title, 70);
    const description = str2(o.description, 170);
    const ogImage = typeof o.ogImage === "string" && /^https?:\/\//.test(o.ogImage) ? o.ogImage.slice(0, 1000) : undefined;
    if (title) seo.title = title;
    if (description) seo.description = description;
    if (ogImage) seo.ogImage = ogImage;
    patch.seo = seo;
  }
  if ("eventStartAt" in body) {
    const v = body.eventStartAt;
    patch.eventStartAt =
      typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
  }
  if (body.sections !== undefined) {
    const sections = sanitizeSections(body.sections);
    if (sections === null) {
      return NextResponse.json({ error: "Invalid sections" }, { status: 400 });
    }
    patch.sections = sections;
  }

  let ok: boolean;
  try {
    ok = await updateFunnelServerSide({ subAccountId, funnelId, patch });
  } catch (err) {
    if (err instanceof FunnelValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let ok: boolean;
  try {
    ok = await deleteFunnelServerSide(subAccountId, funnelId);
  } catch (err) {
    if (err instanceof FunnelValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
