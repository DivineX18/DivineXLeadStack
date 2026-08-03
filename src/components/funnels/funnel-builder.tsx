"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { subscribeToForms } from "@/lib/firestore/forms";
import { FunnelDomainsSection } from "@/components/funnels/funnel-domains-section";
import type { LeadForm } from "@/types/forms";
import type {
  AgendaConfig,
  BeforeAfterConfig,
  BenefitsGridConfig,
  CalloutConfig,
  CheckoutConfig,
  ComparisonConfig,
  CountdownConfig,
  CtaBannerConfig,
  FaqConfig,
  FunnelDoc,
  FunnelGenre,
  FunnelSection,
  FunnelSectionType,
  GuaranteeConfig,
  HeroConfig,
  ImageTextConfig,
  IncludedConfig,
  OfferConfig,
  PhotoGalleryConfig,
  ProblemSolutionConfig,
  ProofStripConfig,
  StatsConfig,
  StoryConfig,
  TeamConfig,
  TestimonialsConfig,
  TicketTiersConfig,
  TrustBadgesConfig,
  UpsellOfferConfig,
  VideoConfig,
} from "@/types/funnels";
import { DESIGN_PACKS, type DesignPackId } from "@/lib/funnels/design-packs";
import {
  VISUAL_ARCHETYPES,
  VISUAL_ARCHETYPE_IDS,
  TYPOGRAPHY_PAIRINGS,
  resolveDesignStrategy,
  type VisualArchetype,
  type DesignStrategy,
} from "@/lib/funnels/design-strategy";

const GENRE_LABELS: Record<FunnelGenre, string> = {
  lead_magnet: "Lead Magnet",
  vsl: "VSL",
  challenge: "Challenge",
  application: "Application",
  tripwire: "Tripwire",
  webinar: "Webinar",
  lead_gen: "Lead Gen",
};

const SECTION_LABELS: Record<FunnelSectionType, string> = {
  hero: "Hero",
  proof_strip: "Trust logos / rating",
  offer: "Offer",
  story: "Founder story",
  faq: "FAQ",
  cta_banner: "CTA banner",
  countdown: "Countdown",
  agenda: "Process timeline",
  ticket_tiers: "Ticket tiers",
  guarantee: "Guarantee",
  trust_badges: "Trust badges",
  checkout: "Checkout",
  upsell_offer: "Upsell/Downsell offer",
  video: "Video",
  benefits_grid: "Benefits grid",
  problem_solution: "Problem / solution split",
  before_after: "Before / after",
  included: "What's included",
  comparison: "Comparison",
  testimonials: "Testimonials",
  stats: "Stats",
  callout: "Callout banner",
  team: "Team",
  image_text: "Image + text",
  photo_gallery: "Photo gallery",
};

const SECTION_DEFAULTS: Record<FunnelSectionType, () => FunnelSection["config"]> = {
  hero: () => ({ headline: "New headline", mediaType: "none" }) satisfies HeroConfig,
  proof_strip: () => ({ variant: "rating", rating: { score: 5, reviewCount: 0 } }) satisfies ProofStripConfig,
  offer: () => ({ priceCents: 0, bullets: [], formId: null, ctaLabel: "Get started" }) satisfies OfferConfig,
  story: () => ({ byline: "From: Your Name, Your City", paragraphs: [] }) satisfies StoryConfig,
  faq: () => ({ items: [] }) satisfies FaqConfig,
  cta_banner: () => ({ headline: "Ready?", ctaLabel: "Get started", ctaHref: "" }) satisfies CtaBannerConfig,
  countdown: () => ({ endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }) satisfies CountdownConfig,
  agenda: () => ({ days: [] }) satisfies AgendaConfig,
  ticket_tiers: () => ({ tiers: [] }) satisfies TicketTiersConfig,
  guarantee: () => ({ headline: "30-day money-back guarantee", bodyText: "", badgeIcon: "shield" }) satisfies GuaranteeConfig,
  trust_badges: () => ({ badges: [] }) satisfies TrustBadgesConfig,
  checkout: () =>
    ({
      priceCents: 0,
      bullets: [],
      ctaLabel: "Buy now",
      checkoutMode: "external_link",
    }) satisfies CheckoutConfig,
  upsell_offer: () =>
    ({
      headline: "Wait — add this to your order?",
      bullets: [],
      priceCents: 0,
      acceptLabel: "Yes, add it!",
      declineLabel: "No thanks",
    }) satisfies UpsellOfferConfig,
  video: () => ({ embedUrl: "" }) satisfies VideoConfig,
  benefits_grid: () => ({ items: [] }) satisfies BenefitsGridConfig,
  problem_solution: () =>
    ({
      problemHeadline: "",
      problemText: "",
      solutionHeadline: "",
      solutionText: "",
    }) satisfies ProblemSolutionConfig,
  before_after: () => ({ beforeItems: [], afterItems: [] }) satisfies BeforeAfterConfig,
  included: () => ({ items: [] }) satisfies IncludedConfig,
  comparison: () => ({ usLabel: "Us", themLabel: "Doing it yourself", rows: [] }) satisfies ComparisonConfig,
  testimonials: () => ({ items: [] }) satisfies TestimonialsConfig,
  stats: () => ({ items: [] }) satisfies StatsConfig,
  callout: () => ({ text: "" }) satisfies CalloutConfig,
  team: () => ({ members: [] }) satisfies TeamConfig,
  image_text: () => ({ blocks: [] }) satisfies ImageTextConfig,
  photo_gallery: () => ({ images: [], layout: "grid" }) satisfies PhotoGalleryConfig,
};

// Deliberately does NOT trim each line. These textareas are controlled —
// onChange feeds straight back into `value` on every keystroke — so trimming
// the line the user is actively typing wipes out a trailing space the
// instant they press it (the very next character then lands with no space
// before it, fusing words together, e.g. "testing testing" -> "testingtesting").
// Only drop lines that are ENTIRELY blank (a blank separator line), and leave
// real content untouched; any incidental leading/trailing whitespace is
// cosmetically harmless in the rendered output.
function linesToArray(v: string): string[] {
  return v.split("\n").filter((s) => s.trim().length > 0);
}

const fieldClass =
  "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";

export function FunnelBuilder({
  saId,
  funnelId,
}: {
  saId: string;
  funnelId: string;
}) {
  const [funnel, setFunnel] = useState<FunnelDoc | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [accentColor, setAccentColor] = useState("#2563eb");
  const [designPack, setDesignPack] = useState<DesignPackId>("classic");
  // Flow Phase 2 — Design Intelligence. "" = no archetype (legacy
  // designPack path, the select above stays live). A real archetype id
  // takes over rendering; the whole strategy is re-resolved through
  // resolveDesignStrategy() on every change so the UI never sends a
  // hand-assembled/unvalidated token combination — same discipline as the
  // server-side PATCH route.
  const [archetype, setArchetype] = useState<VisualArchetype | "">("");
  const [paletteId, setPaletteId] = useState("");
  const [colorMode, setColorMode] = useState<DesignStrategy["colorMode"] | "">("");
  const [typographyPairing, setTypographyPairing] = useState<DesignStrategy["typographyPairing"] | "">("");
  const [animationLevel, setAnimationLevel] = useState<DesignStrategy["animationLevel"] | "">("");
  const [visualDensity, setVisualDensity] = useState<DesignStrategy["visualDensity"] | "">("");
  const [ctaStrategy, setCtaStrategy] = useState<DesignStrategy["ctaStrategy"] | "">("");
  const [logoUrl, setLogoUrl] = useState("");
  const [sections, setSections] = useState<FunnelSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [forms, setForms] = useState<LeadForm[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}`);
      const d = (await res.json().catch(() => ({}))) as { funnel?: FunnelDoc };
      if (!cancelled && d.funnel) {
        setFunnel(d.funnel);
        setName(d.funnel.name);
        setStatus(d.funnel.status);
        setTheme(d.funnel.theme);
        setAccentColor(d.funnel.accentColor);
        setDesignPack(d.funnel.designPack ?? "classic");
        const strategy = d.funnel.designStrategy;
        setArchetype(strategy?.visualArchetype ?? "");
        setPaletteId(strategy?.paletteId ?? "");
        setColorMode(strategy?.colorMode ?? "");
        setTypographyPairing(strategy?.typographyPairing ?? "");
        setAnimationLevel(strategy?.animationLevel ?? "");
        setVisualDensity(strategy?.visualDensity ?? "");
        setCtaStrategy(strategy?.ctaStrategy ?? "");
        setLogoUrl(d.funnel.logoUrl ?? "");
        setSections(d.funnel.sections);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saId, funnelId]);

  useEffect(() => {
    return subscribeToForms({ agencyId: "", subAccountId: saId }, setForms);
  }, [saId]);

  function updateSection(id: string, config: FunnelSection["config"]) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, config } : s)));
  }

  function move(index: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function addSection(type: FunnelSectionType) {
    const id = `s${Date.now()}`;
    setSections((prev) => [...prev, { id, type, config: SECTION_DEFAULTS[type]() }]);
    setExpanded(id);
  }

  async function save(patchStatus?: "draft" | "published") {
    setSaving(true);
    try {
      // Re-resolved client-side too (not just server-side) so the "Visual
      // style" panel's own accent/theme preview and the saved accentColor/
      // theme fields never drift apart — the PATCH route re-validates this
      // exact shape regardless, so a forged payload still can't smuggle an
      // unapproved combination through.
      const resolvedStrategy = archetype
        ? resolveDesignStrategy(archetype, {
            paletteId: paletteId || undefined,
            colorMode: colorMode || undefined,
            typographyPairing: typographyPairing || undefined,
            animationLevel: animationLevel || undefined,
            visualDensity: visualDensity || undefined,
            ctaStrategy: ctaStrategy || undefined,
          })
        : null;
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          status: patchStatus ?? status,
          theme,
          accentColor,
          designPack,
          designStrategy: resolvedStrategy,
          logoUrl,
          sections,
        }),
      });
      if (!res.ok) throw new Error();
      if (patchStatus) setStatus(patchStatus);
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save the funnel.");
    } finally {
      setSaving(false);
    }
  }

  if (!funnel) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {GENRE_LABELS[funnel.genre] ?? funnel.genre}
        </span>
        <div className="flex gap-2">
          {status === "published" && (
            <a
              href={`/lp/${funnelId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center text-sm text-primary underline-offset-2 hover:underline"
            >
              View live
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => save(status === "published" ? "draft" : "published")}
          >
            {status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-11 text-lg font-semibold"
        placeholder="Funnel name"
      />

      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className={labelClass}>Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark")}
            className={fieldClass}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Accent color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-9 rounded border"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Visual style</label>
          <select
            value={archetype}
            onChange={(e) => {
              const next = e.target.value as VisualArchetype | "";
              setArchetype(next);
              // Reset the sub-choices when switching archetype — a
              // palette/typography id from a DIFFERENT archetype would
              // just be silently ignored by resolveDesignStrategy anyway,
              // but starting clean avoids a confusing "selected but not
              // actually applied" state in the UI.
              if (next) {
                setPaletteId("");
                setColorMode("");
                setTypographyPairing("");
                setCtaStrategy("");
              }
            }}
            className={fieldClass}
          >
            <option value="">Legacy design pack (below)</option>
            {VISUAL_ARCHETYPE_IDS.map((id) => (
              <option key={id} value={id}>
                {VISUAL_ARCHETYPES[id].label}
              </option>
            ))}
          </select>
          {archetype ? (
            <p className="mt-1 text-xs text-muted-foreground">{VISUAL_ARCHETYPES[archetype].audienceHint}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Industry-aware design system — palette, typography, cards, motion, and CTA resolved together. Pick &ldquo;Legacy design pack&rdquo; to use the older single-token system instead.</p>
          )}
        </div>

        {archetype ? (
          <>
            <div>
              <label className={labelClass}>Palette</label>
              <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)} className={fieldClass}>
                <option value="">Default for this style</option>
                {VISUAL_ARCHETYPES[archetype].palettes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Color mode</label>
              <select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as DesignStrategy["colorMode"] | "")}
                className={fieldClass}
              >
                <option value="">Default for this palette</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Typography</label>
              <select
                value={typographyPairing}
                onChange={(e) => setTypographyPairing(e.target.value as DesignStrategy["typographyPairing"] | "")}
                className={fieldClass}
              >
                <option value="">Default for this style</option>
                {VISUAL_ARCHETYPES[archetype].typography.map((id) => (
                  <option key={id} value={id}>
                    {TYPOGRAPHY_PAIRINGS[id].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Animation</label>
              <select
                value={animationLevel}
                onChange={(e) => setAnimationLevel(e.target.value as DesignStrategy["animationLevel"] | "")}
                className={fieldClass}
              >
                <option value="">Default for this style</option>
                <option value="none">None</option>
                <option value="minimal">Minimal</option>
                <option value="moderate">Moderate</option>
                <option value="expressive">Expressive</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Density</label>
              <select
                value={visualDensity}
                onChange={(e) => setVisualDensity(e.target.value as DesignStrategy["visualDensity"] | "")}
                className={fieldClass}
              >
                <option value="">Default for this style</option>
                <option value="low">Low — spacious</option>
                <option value="medium">Medium</option>
                <option value="high">High — compact</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Default CTA</label>
              <select
                value={ctaStrategy}
                onChange={(e) => setCtaStrategy(e.target.value as DesignStrategy["ctaStrategy"] | "")}
                className={fieldClass}
              >
                <option value="">Default for this style</option>
                {VISUAL_ARCHETYPES[archetype].recommendedCtaStyles.map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <select
              value={designPack}
              onChange={(e) => setDesignPack(e.target.value as DesignPackId)}
              className={fieldClass}
            >
              {(Object.keys(DESIGN_PACKS) as DesignPackId[]).map((id) => (
                <option key={id} value={id}>
                  {DESIGN_PACKS[id].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{DESIGN_PACKS[designPack].audienceHint}</p>
          </div>
        )}

        <div className="col-span-2">
          <label className={labelClass}>Logo URL (optional)</label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="h-9"
          />
          <p className="mt-1 text-xs text-muted-foreground">Shown as a small mark above the hero. Never set by Zeno — your real logo, not a generated one.</p>
        </div>
      </div>

      <FunnelDomainsSection saId={saId} funnelId={funnelId} />

      <div className="space-y-3">
        {sections.map((section, i) => (
          <div key={section.id} className="rounded-xl border bg-card">
            <div className="flex items-center gap-2 p-3">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move section up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move section down"
                  disabled={i === sections.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="flex-1 text-left text-sm font-medium"
                onClick={() =>
                  setExpanded(expanded === section.id ? null : section.id)
                }
              >
                {SECTION_LABELS[section.type]}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Remove ${SECTION_LABELS[section.type]} section`}
                onClick={() => removeSection(section.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {expanded === section.id && (
              <div className="border-t p-4">
                <SectionFields
                  section={section}
                  forms={forms}
                  saId={saId}
                  funnelId={funnelId}
                  onChange={(config) => updateSection(section.id, config)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SECTION_LABELS) as FunnelSectionType[]).map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => addSection(type)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {SECTION_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SectionFields({
  section,
  forms,
  saId,
  funnelId,
  onChange,
}: {
  section: FunnelSection;
  forms: LeadForm[];
  saId: string;
  funnelId: string;
  onChange: (config: FunnelSection["config"]) => void;
}) {
  switch (section.type) {
    case "hero": {
      const c = section.config as HeroConfig;
      return (
        <div className="space-y-3">
          <Field label="Eyebrow">
            <Input
              value={c.eyebrow ?? ""}
              onChange={(e) => onChange({ ...c, eyebrow: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Headline">
            <Input
              value={c.headline}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Subheadline">
            <Input
              value={c.subheadline ?? ""}
              onChange={(e) => onChange({ ...c, subheadline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Media">
            <select
              value={c.mediaType}
              onChange={(e) =>
                onChange({ ...c, mediaType: e.target.value as HeroConfig["mediaType"] })
              }
              className={fieldClass}
            >
              <option value="none">None</option>
              <option value="video">Video (embed URL)</option>
              <option value="image">Image (URL)</option>
            </select>
          </Field>
          {c.mediaType !== "none" && (
            <>
              <Field label="Media URL">
                <Input
                  value={c.mediaUrl ?? ""}
                  onChange={(e) => onChange({ ...c, mediaUrl: e.target.value })}
                  className="h-9"
                />
              </Field>
              <Field label="Layout">
                <select
                  value={c.layout ?? "centered"}
                  onChange={(e) =>
                    onChange({ ...c, layout: e.target.value as HeroConfig["layout"] })
                  }
                  className={fieldClass}
                >
                  <option value="centered">Centered — media below text</option>
                  <option value="split">Split — media beside text</option>
                  <option value="background_image">Background — full-bleed media, text overlay</option>
                  <option value="founder_image">Founder — small framed photo above text</option>
                  <option value="browser_mockup">Browser mockup — media in a browser frame</option>
                  <option value="phone_mockup">Phone mockup — media in a phone frame</option>
                </select>
              </Field>
            </>
          )}
          {c.mediaType !== "none" && !c.mediaUrl && (
            <Field label="Media placeholder label (optional)">
              <Input
                value={c.mediaPlaceholderLabel ?? ""}
                onChange={(e) => onChange({ ...c, mediaPlaceholderLabel: e.target.value })}
                placeholder="e.g. Add a dashboard screenshot"
                className="h-9"
              />
              {c.mediaPlaceholderBrief && (
                <p className="mt-1.5 text-xs text-muted-foreground">{c.mediaPlaceholderBrief}</p>
              )}
            </Field>
          )}
          <Field label="Bullets (one per line, optional)">
            <Textarea
              value={(c.bullets ?? []).join("\n")}
              onChange={(e) => onChange({ ...c, bullets: linesToArray(e.target.value) })}
              rows={3}
              className="text-sm"
            />
          </Field>
          <Field label="CTA label (optional)">
            <Input
              value={c.ctaLabel ?? ""}
              onChange={(e) => onChange({ ...c, ctaLabel: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="CTA link">
            <Input
              value={c.ctaHref ?? ""}
              onChange={(e) => onChange({ ...c, ctaHref: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="CTA experience">
            <select
              value={c.cta?.style ?? "inline"}
              onChange={(e) =>
                onChange({
                  ...c,
                  cta: { ...c.cta, style: e.target.value as NonNullable<HeroConfig["cta"]>["style"] },
                })
              }
              className={fieldClass}
            >
              <option value="inline">Inline — form/button on the page</option>
              <option value="popup_form">Popup — opens the form in a modal</option>
              <option value="popup_calendar">Popup calendar — opens a booking page</option>
              <option value="dual">Dual — primary + secondary button</option>
              <option value="sticky_desktop">Sticky (desktop) — always-visible bar</option>
              <option value="floating_mobile">Floating (mobile) — persistent bottom button</option>
              <option value="phone">Phone — tel: link</option>
            </select>
          </Field>
          {c.cta?.style === "popup_calendar" && (
            <Field label="Booking page slug (from /b/[subAccountId]/[slug])">
              <Input
                value={c.cta?.bookingPageSlug ?? ""}
                onChange={(e) => onChange({ ...c, cta: { ...c.cta, bookingPageSlug: e.target.value } })}
                className="h-9"
              />
            </Field>
          )}
          {c.cta?.style === "phone" && (
            <Field label="Phone number (tel: link, e.g. +15551234567)">
              <Input
                value={c.cta?.phoneNumber ?? ""}
                onChange={(e) => onChange({ ...c, cta: { ...c.cta, phoneNumber: e.target.value } })}
                className="h-9"
              />
            </Field>
          )}
          {c.cta?.style === "dual" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Secondary label">
                <Input
                  value={c.cta?.secondaryLabel ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, secondaryLabel: e.target.value } })}
                  className="h-9"
                />
              </Field>
              <Field label="Secondary link">
                <Input
                  value={c.cta?.secondaryHref ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, secondaryHref: e.target.value } })}
                  className="h-9"
                />
              </Field>
            </div>
          )}
          {c.cta?.style === "popup_form" && (
            <>
              <Field label="Popup layout">
                <select
                  value={c.cta?.popupLayout ?? "centered"}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupLayout: e.target.value as NonNullable<HeroConfig["cta"]>["popupLayout"] } })}
                  className={fieldClass}
                >
                  <option value="centered">Centered — form only</option>
                  <option value="split_image">Split — real photo beside the form</option>
                  <option value="split_benefits">Split — benefit list beside the form</option>
                </select>
              </Field>
              <Field label="Popup headline (optional)">
                <Input
                  value={c.cta?.popupHeadline ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupHeadline: e.target.value } })}
                  className="h-9"
                />
              </Field>
              {c.cta?.popupLayout === "split_image" && (
                <Field label="Popup photo URL">
                  <Input
                    value={c.cta?.popupImageUrl ?? ""}
                    onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupImageUrl: e.target.value } })}
                    className="h-9"
                  />
                </Field>
              )}
              {c.cta?.popupLayout === "split_benefits" && (
                <Field label="Popup benefits (one per line)">
                  <Textarea
                    value={(c.cta?.popupBenefits ?? []).join("\n")}
                    onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupBenefits: linesToArray(e.target.value) } })}
                    rows={3}
                    className="text-sm"
                  />
                </Field>
              )}
            </>
          )}
        </div>
      );
    }
    case "proof_strip": {
      const c = section.config as ProofStripConfig;
      return (
        <div className="space-y-3">
          <Field label="Style">
            <select
              value={c.variant}
              onChange={(e) =>
                onChange({ ...c, variant: e.target.value as ProofStripConfig["variant"] })
              }
              className={fieldClass}
            >
              <option value="rating">Star rating</option>
              <option value="logos">Media/brand logos</option>
            </select>
          </Field>
          {c.variant === "rating" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Score (out of 5)">
                <Input
                  type="number"
                  step="0.1"
                  value={c.rating?.score ?? 5}
                  onChange={(e) =>
                    onChange({
                      ...c,
                      rating: { ...c.rating, score: Number(e.target.value), reviewCount: c.rating?.reviewCount ?? 0 },
                    })
                  }
                  className="h-9"
                />
              </Field>
              <Field label="Review count">
                <Input
                  type="number"
                  value={c.rating?.reviewCount ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...c,
                      rating: { score: c.rating?.score ?? 5, reviewCount: Number(e.target.value) },
                    })
                  }
                  className="h-9"
                />
              </Field>
            </div>
          ) : (
            <Field label="Logo image URLs, one per line">
              <Textarea
                rows={4}
                value={(c.logos ?? []).map((l) => l.url).join("\n")}
                onChange={(e) =>
                  onChange({
                    ...c,
                    logos: linesToArray(e.target.value).map((url) => ({ url, alt: "" })),
                  })
                }
              />
            </Field>
          )}
        </div>
      );
    }
    case "offer": {
      const c = section.config as OfferConfig;
      return (
        <div className="space-y-3">
          <Field label="Product image URL (optional)">
            <Input
              value={c.productImageUrl ?? ""}
              onChange={(e) => onChange({ ...c, productImageUrl: e.target.value })}
              placeholder="https://…"
              className="h-9"
            />
          </Field>
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USD)">
              <Input
                type="number"
                step="0.01"
                value={(c.priceCents ?? 0) / 100}
                onChange={(e) =>
                  onChange({ ...c, priceCents: Math.round(Number(e.target.value) * 100) })
                }
                className="h-9"
              />
            </Field>
            <Field label="Strikethrough price (optional)">
              <Input
                type="number"
                step="0.01"
                value={c.strikethroughPriceCents ? c.strikethroughPriceCents / 100 : ""}
                onChange={(e) =>
                  onChange({
                    ...c,
                    strikethroughPriceCents: e.target.value
                      ? Math.round(Number(e.target.value) * 100)
                      : null,
                  })
                }
                className="h-9"
              />
            </Field>
          </div>
          <Field label="Bullets, one per line">
            <Textarea
              rows={4}
              value={c.bullets.join("\n")}
              onChange={(e) => onChange({ ...c, bullets: linesToArray(e.target.value) })}
            />
          </Field>
          <Field label="Lead-capture form (optional — leave blank for a plain CTA link)">
            <select
              value={c.formId ?? ""}
              onChange={(e) => onChange({ ...c, formId: e.target.value || null })}
              className={fieldClass}
            >
              <option value="">No form — CTA button only</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          {!c.formId && (
            <Field label="CTA link (external checkout/booking)">
              <Input
                value={c.ctaHref ?? ""}
                onChange={(e) => onChange({ ...c, ctaHref: e.target.value })}
                className="h-9"
              />
            </Field>
          )}
          <Field label="CTA label">
            <Input
              value={c.ctaLabel}
              onChange={(e) => onChange({ ...c, ctaLabel: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="CTA experience">
            <select
              value={c.cta?.style ?? "inline"}
              onChange={(e) =>
                onChange({
                  ...c,
                  cta: { ...c.cta, style: e.target.value as NonNullable<OfferConfig["cta"]>["style"] },
                })
              }
              className={fieldClass}
            >
              <option value="inline">Inline — form/button on the page</option>
              <option value="popup_form">Popup — opens the form in a modal</option>
              <option value="popup_calendar">Popup calendar — opens a booking page</option>
              <option value="dual">Dual — primary + secondary button</option>
              <option value="sticky_desktop">Sticky (desktop) — always-visible bar</option>
              <option value="floating_mobile">Floating (mobile) — persistent bottom button</option>
              <option value="phone">Phone — tel: link</option>
            </select>
          </Field>
          {c.cta?.style === "popup_calendar" && (
            <Field label="Booking page slug (from /b/[subAccountId]/[slug])">
              <Input
                value={c.cta?.bookingPageSlug ?? ""}
                onChange={(e) => onChange({ ...c, cta: { ...c.cta, bookingPageSlug: e.target.value } })}
                className="h-9"
              />
            </Field>
          )}
          {c.cta?.style === "phone" && (
            <Field label="Phone number (tel: link, e.g. +15551234567)">
              <Input
                value={c.cta?.phoneNumber ?? ""}
                onChange={(e) => onChange({ ...c, cta: { ...c.cta, phoneNumber: e.target.value } })}
                className="h-9"
              />
            </Field>
          )}
          {c.cta?.style === "dual" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Secondary label">
                <Input
                  value={c.cta?.secondaryLabel ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, secondaryLabel: e.target.value } })}
                  className="h-9"
                />
              </Field>
              <Field label="Secondary link">
                <Input
                  value={c.cta?.secondaryHref ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, secondaryHref: e.target.value } })}
                  className="h-9"
                />
              </Field>
            </div>
          )}
          {c.cta?.style === "popup_form" && (
            <>
              <Field label="Popup layout">
                <select
                  value={c.cta?.popupLayout ?? "centered"}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupLayout: e.target.value as NonNullable<OfferConfig["cta"]>["popupLayout"] } })}
                  className={fieldClass}
                >
                  <option value="centered">Centered — form only</option>
                  <option value="split_image">Split — real photo beside the form</option>
                  <option value="split_benefits">Split — benefit list beside the form</option>
                </select>
              </Field>
              <Field label="Popup headline (optional)">
                <Input
                  value={c.cta?.popupHeadline ?? ""}
                  onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupHeadline: e.target.value } })}
                  className="h-9"
                />
              </Field>
              {c.cta?.popupLayout === "split_image" && (
                <Field label="Popup photo URL">
                  <Input
                    value={c.cta?.popupImageUrl ?? ""}
                    onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupImageUrl: e.target.value } })}
                    className="h-9"
                  />
                </Field>
              )}
              {c.cta?.popupLayout === "split_benefits" && (
                <Field label="Popup benefits (one per line)">
                  <Textarea
                    value={(c.cta?.popupBenefits ?? []).join("\n")}
                    onChange={(e) => onChange({ ...c, cta: { ...c.cta, popupBenefits: linesToArray(e.target.value) } })}
                    rows={3}
                    className="text-sm"
                  />
                </Field>
              )}
            </>
          )}
        </div>
      );
    }
    case "story": {
      const c = section.config as StoryConfig;
      return (
        <div className="space-y-3">
          <Field label='Byline (e.g. "From: Jane Doe, Austin, TX")'>
            <Input
              value={c.byline}
              onChange={(e) => onChange({ ...c, byline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Paragraphs, one per line">
            <Textarea
              rows={6}
              value={c.paragraphs.join("\n")}
              onChange={(e) => onChange({ ...c, paragraphs: linesToArray(e.target.value) })}
            />
          </Field>
          <Field label="Photo URL (optional)">
            <Input
              value={c.photoUrl ?? ""}
              onChange={(e) => onChange({ ...c, photoUrl: e.target.value })}
              placeholder="https://…"
              className="h-9"
            />
          </Field>
          {!c.photoUrl && (
            <Field label="Photo placeholder label (optional)">
              <Input
                value={c.photoPlaceholderLabel ?? ""}
                onChange={(e) => onChange({ ...c, photoPlaceholderLabel: e.target.value })}
                placeholder="e.g. Add your photo"
                className="h-9"
              />
              {c.photoPlaceholderBrief && (
                <p className="mt-1.5 text-xs text-muted-foreground">{c.photoPlaceholderBrief}</p>
              )}
            </Field>
          )}
        </div>
      );
    }
    case "faq": {
      const c = section.config as FaqConfig;
      return (
        <ListEditor
          items={c.items}
          onChange={(items) => onChange({ items })}
          empty={{ question: "", answer: "" }}
          renderRow={(item, update) => (
            <div className="space-y-2">
              <Input
                placeholder="Question"
                value={item.question}
                onChange={(e) => update({ ...item, question: e.target.value })}
                className="h-9"
              />
              <Textarea
                placeholder="Answer"
                rows={2}
                value={item.answer}
                onChange={(e) => update({ ...item, answer: e.target.value })}
              />
            </div>
          )}
          addLabel="Add FAQ item"
        />
      );
    }
    case "cta_banner": {
      const c = section.config as CtaBannerConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline">
            <Input
              value={c.headline}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Subtext (optional)">
            <Input
              value={c.subtext ?? ""}
              onChange={(e) => onChange({ ...c, subtext: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="CTA label">
            <Input
              value={c.ctaLabel}
              onChange={(e) => onChange({ ...c, ctaLabel: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="CTA link">
            <Input
              value={c.ctaHref}
              onChange={(e) => onChange({ ...c, ctaHref: e.target.value })}
              className="h-9"
            />
          </Field>
        </div>
      );
    }
    case "countdown": {
      const c = section.config as CountdownConfig;
      return (
        <div className="space-y-3">
          <Field label="Ends at">
            <Input
              type="datetime-local"
              value={c.endsAt.slice(0, 16)}
              onChange={(e) =>
                onChange({ ...c, endsAt: new Date(e.target.value).toISOString() })
              }
              className="h-9"
            />
          </Field>
          <Field label="When it expires">
            <select
              value={c.onExpireBehavior ?? "show_zero"}
              onChange={(e) =>
                onChange({
                  ...c,
                  onExpireBehavior: e.target.value as CountdownConfig["onExpireBehavior"],
                })
              }
              className={fieldClass}
            >
              <option value="show_zero">Show 00:00:00:00</option>
              <option value="hide">Hide the bar</option>
            </select>
          </Field>
        </div>
      );
    }
    case "agenda": {
      const c = section.config as AgendaConfig;
      return (
        <ListEditor
          items={c.days}
          onChange={(days) => onChange({ days })}
          empty={{ label: "Day 1", title: "", bullets: [] }}
          renderRow={(day, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Label (e.g. Day 1)"
                  value={day.label}
                  onChange={(e) => update({ ...day, label: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Title"
                  value={day.title}
                  onChange={(e) => update({ ...day, title: e.target.value })}
                  className="h-9"
                />
              </div>
              <Textarea
                placeholder="Bullets, one per line"
                rows={3}
                value={day.bullets.join("\n")}
                onChange={(e) => update({ ...day, bullets: linesToArray(e.target.value) })}
              />
            </div>
          )}
          addLabel="Add day"
        />
      );
    }
    case "ticket_tiers": {
      const c = section.config as TicketTiersConfig;
      return (
        <ListEditor
          items={c.tiers}
          onChange={(tiers) => onChange({ tiers })}
          empty={{ name: "", priceCents: 0, features: [], ctaLabel: "Join", ctaHref: "", formId: null, highlighted: false }}
          renderRow={(tier, update) => (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Tier name"
                  value={tier.name}
                  onChange={(e) => update({ ...tier, name: e.target.value })}
                  className="h-9"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price (USD)"
                  value={(tier.priceCents ?? 0) / 100}
                  onChange={(e) =>
                    update({ ...tier, priceCents: Math.round(Number(e.target.value) * 100) })
                  }
                  className="h-9"
                />
              </div>
              <Textarea
                placeholder="Features, one per line"
                rows={3}
                value={tier.features.join("\n")}
                onChange={(e) => update({ ...tier, features: linesToArray(e.target.value) })}
              />
              <select
                value={tier.formId ?? ""}
                onChange={(e) => update({ ...tier, formId: e.target.value || null })}
                className={fieldClass}
              >
                <option value="">No form — CTA button only</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              {!tier.formId && (
                <Input
                  placeholder="CTA link"
                  value={tier.ctaHref ?? ""}
                  onChange={(e) => update({ ...tier, ctaHref: e.target.value })}
                  className="h-9"
                />
              )}
              <Input
                placeholder="CTA label"
                value={tier.ctaLabel}
                onChange={(e) => update({ ...tier, ctaLabel: e.target.value })}
                className="h-9"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!tier.highlighted}
                  onChange={(e) => update({ ...tier, highlighted: e.target.checked })}
                />
                Highlight this tier
              </label>
            </div>
          )}
          addLabel="Add tier"
        />
      );
    }
    case "checkout": {
      const c = section.config as CheckoutConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USD)">
              <Input
                type="number"
                step="0.01"
                value={(c.priceCents ?? 0) / 100}
                onChange={(e) =>
                  onChange({ ...c, priceCents: Math.round(Number(e.target.value) * 100) })
                }
                className="h-9"
              />
            </Field>
            <Field label="Strikethrough price (optional)">
              <Input
                type="number"
                step="0.01"
                value={c.strikethroughPriceCents ? c.strikethroughPriceCents / 100 : ""}
                onChange={(e) =>
                  onChange({
                    ...c,
                    strikethroughPriceCents: e.target.value
                      ? Math.round(Number(e.target.value) * 100)
                      : null,
                  })
                }
                className="h-9"
              />
            </Field>
          </div>
          <Field label="Bullets, one per line">
            <Textarea
              rows={4}
              value={c.bullets.join("\n")}
              onChange={(e) => onChange({ ...c, bullets: linesToArray(e.target.value) })}
            />
          </Field>
          <Field label="Checkout mode">
            <select
              value={c.checkoutMode}
              onChange={(e) =>
                onChange({ ...c, checkoutMode: e.target.value as CheckoutConfig["checkoutMode"] })
              }
              className={fieldClass}
            >
              <option value="external_link">External link (e.g. Amazon, another checkout)</option>
              <option value="form_capture">Lead-capture form</option>
              <option value="stripe_checkout">Real checkout — your own Stripe</option>
            </select>
          </Field>

          {c.checkoutMode === "external_link" && (
            <Field label="CTA link">
              <Input
                value={c.ctaHref ?? ""}
                onChange={(e) => onChange({ ...c, ctaHref: e.target.value })}
                className="h-9"
              />
            </Field>
          )}

          {c.checkoutMode === "form_capture" && (
            <Field label="Lead-capture form">
              <select
                value={c.formId ?? ""}
                onChange={(e) => onChange({ ...c, formId: e.target.value || null })}
                className={fieldClass}
              >
                <option value="">Choose a form</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {c.checkoutMode === "stripe_checkout" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Currency">
                  <Input
                    value={c.currency ?? "usd"}
                    onChange={(e) => onChange({ ...c, currency: e.target.value.toLowerCase() })}
                    className="h-9"
                    maxLength={3}
                  />
                </Field>
                <Field label="Billing">
                  <select
                    value={c.billingMode ?? "one_time"}
                    onChange={(e) =>
                      onChange({
                        ...c,
                        billingMode: e.target.value as CheckoutConfig["billingMode"],
                      })
                    }
                    className={fieldClass}
                  >
                    <option value="one_time">One-time</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </Field>
              </div>
              {c.billingMode === "subscription" && (
                <Field label="Bills every">
                  <select
                    value={c.recurringInterval ?? "month"}
                    onChange={(e) =>
                      onChange({
                        ...c,
                        recurringInterval: e.target.value as CheckoutConfig["recurringInterval"],
                      })
                    }
                    className={fieldClass}
                  >
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </Field>
              )}
              <div className="rounded-lg border p-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!c.orderBump}
                    onChange={(e) =>
                      onChange({
                        ...c,
                        orderBump: e.target.checked
                          ? { headline: "", priceCents: 0, stripePriceId: null }
                          : null,
                      })
                    }
                  />
                  Add an order bump
                </label>
                {c.orderBump && (
                  <div className="mt-3 space-y-2">
                    <Input
                      placeholder="Bump headline"
                      value={c.orderBump.headline}
                      onChange={(e) =>
                        onChange({ ...c, orderBump: { ...c.orderBump!, headline: e.target.value } })
                      }
                      className="h-9"
                    />
                    <Input
                      placeholder="Bump description (optional)"
                      value={c.orderBump.description ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...c,
                          orderBump: { ...c.orderBump!, description: e.target.value },
                        })
                      }
                      className="h-9"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Bump price (USD)"
                      value={(c.orderBump.priceCents ?? 0) / 100}
                      onChange={(e) =>
                        onChange({
                          ...c,
                          orderBump: {
                            ...c.orderBump!,
                            priceCents: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                      className="h-9"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className={labelClass}>Post-purchase flow</p>
                <PostPurchaseFlowPanel
                  saId={saId}
                  parentFunnelId={funnelId}
                  label="Upsell (shown after a successful purchase)"
                  linkedFunnelId={c.upsellFunnelId}
                  chainRole="upsell"
                  onLink={(id) => onChange({ ...c, upsellFunnelId: id })}
                  onUnlink={() => onChange({ ...c, upsellFunnelId: null })}
                />
              </div>
            </>
          )}

          <Field label="CTA label">
            <Input
              value={c.ctaLabel}
              onChange={(e) => onChange({ ...c, ctaLabel: e.target.value })}
              className="h-9"
            />
          </Field>
        </div>
      );
    }
    case "upsell_offer": {
      const c = section.config as UpsellOfferConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline">
            <Input
              value={c.headline}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Price (USD)">
            <Input
              type="number"
              step="0.01"
              value={(c.priceCents ?? 0) / 100}
              onChange={(e) =>
                onChange({ ...c, priceCents: Math.round(Number(e.target.value) * 100) })
              }
              className="h-9"
            />
          </Field>
          <Field label="Bullets, one per line">
            <Textarea
              rows={4}
              value={c.bullets.join("\n")}
              onChange={(e) => onChange({ ...c, bullets: linesToArray(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Accept button label">
              <Input
                value={c.acceptLabel}
                onChange={(e) => onChange({ ...c, acceptLabel: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="Decline link label">
              <Input
                value={c.declineLabel}
                onChange={(e) => onChange({ ...c, declineLabel: e.target.value })}
                className="h-9"
              />
            </Field>
          </div>
          <div className="space-y-2">
            <p className={labelClass}>If they accept</p>
            <PostPurchaseFlowPanel
              saId={saId}
              parentFunnelId={funnelId}
              label="Chain another upsell after this one (optional)"
              linkedFunnelId={c.acceptNextFunnelId}
              chainRole="upsell"
              onLink={(id) => onChange({ ...c, acceptNextFunnelId: id })}
              onUnlink={() => onChange({ ...c, acceptNextFunnelId: null })}
            />
          </div>
          <div className="space-y-2">
            <p className={labelClass}>If they decline</p>
            <PostPurchaseFlowPanel
              saId={saId}
              parentFunnelId={funnelId}
              label="Offer a downsell instead (optional)"
              linkedFunnelId={c.declineFunnelId}
              chainRole="downsell"
              onLink={(id) => onChange({ ...c, declineFunnelId: id })}
              onUnlink={() => onChange({ ...c, declineFunnelId: null })}
            />
          </div>
        </div>
      );
    }
    case "guarantee": {
      const c = section.config as GuaranteeConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline">
            <Input
              value={c.headline}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Terms (your real guarantee — nothing pre-filled)">
            <Textarea
              rows={3}
              value={c.bodyText}
              onChange={(e) => onChange({ ...c, bodyText: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Badge icon">
              <select
                value={c.badgeIcon ?? "shield"}
                onChange={(e) =>
                  onChange({ ...c, badgeIcon: e.target.value as GuaranteeConfig["badgeIcon"] })
                }
                className={fieldClass}
              >
                <option value="shield">Shield</option>
                <option value="seal">Seal</option>
                <option value="check">Check</option>
              </select>
            </Field>
            <Field label='Duration label (e.g. "30 DAYS")'>
              <Input
                value={c.durationLabel ?? ""}
                onChange={(e) => onChange({ ...c, durationLabel: e.target.value })}
                className="h-9"
              />
            </Field>
          </div>
        </div>
      );
    }
    case "trust_badges": {
      const c = section.config as TrustBadgesConfig;
      return (
        <ListEditor
          items={c.badges}
          onChange={(badges) => onChange({ badges })}
          empty={{ label: "", iconType: "shield" } as TrustBadgesConfig["badges"][number]}
          renderRow={(badge, update) => (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Label (e.g. SSL Secured)"
                value={badge.label}
                onChange={(e) => update({ ...badge, label: e.target.value })}
                className="h-9"
              />
              <select
                value={badge.iconType}
                onChange={(e) =>
                  update({ ...badge, iconType: e.target.value as TrustBadgesConfig["badges"][number]["iconType"] })
                }
                className={fieldClass}
              >
                <option value="lock">Lock</option>
                <option value="card">Card</option>
                <option value="shield">Shield</option>
                <option value="star">Star</option>
              </select>
            </div>
          )}
          addLabel="Add badge"
        />
      );
    }
    case "video": {
      const c = section.config as VideoConfig;
      return (
        <div className="space-y-3">
          <Field label="Embed URL (YouTube/Vimeo/Wistia)">
            <Input
              value={c.embedUrl}
              onChange={(e) => onChange({ ...c, embedUrl: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Subtext (optional)">
            <Input
              value={c.subtext ?? ""}
              onChange={(e) => onChange({ ...c, subtext: e.target.value })}
              className="h-9"
            />
          </Field>
        </div>
      );
    }
    case "benefits_grid": {
      const c = section.config as BenefitsGridConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <ListEditor
            items={c.items}
            onChange={(items) => onChange({ ...c, items })}
            empty={{ title: "", description: "", iconType: "check" } as BenefitsGridConfig["items"][number]}
            renderRow={(item, update) => (
              <div className="space-y-2">
                <Input
                  placeholder="Title"
                  value={item.title}
                  onChange={(e) => update({ ...item, title: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Description (optional)"
                  value={item.description ?? ""}
                  onChange={(e) => update({ ...item, description: e.target.value })}
                  className="h-9"
                />
                <select
                  value={item.iconType ?? "check"}
                  onChange={(e) =>
                    update({ ...item, iconType: e.target.value as BenefitsGridConfig["items"][number]["iconType"] })
                  }
                  className={fieldClass}
                >
                  {["check", "clock", "target", "trending", "shield", "zap", "users", "star"].map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
            )}
            addLabel="Add benefit"
          />
        </div>
      );
    }
    case "problem_solution": {
      const c = section.config as ProblemSolutionConfig;
      return (
        <div className="space-y-3">
          <Field label="Problem headline">
            <Input
              value={c.problemHeadline}
              onChange={(e) => onChange({ ...c, problemHeadline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Problem text">
            <Textarea
              rows={3}
              value={c.problemText}
              onChange={(e) => onChange({ ...c, problemText: e.target.value })}
            />
          </Field>
          <Field label="Solution headline">
            <Input
              value={c.solutionHeadline}
              onChange={(e) => onChange({ ...c, solutionHeadline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Solution text">
            <Textarea
              rows={3}
              value={c.solutionText}
              onChange={(e) => onChange({ ...c, solutionText: e.target.value })}
            />
          </Field>
        </div>
      );
    }
    case "before_after": {
      const c = section.config as BeforeAfterConfig;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Before label">
              <Input
                value={c.beforeHeadline ?? ""}
                onChange={(e) => onChange({ ...c, beforeHeadline: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="After label">
              <Input
                value={c.afterHeadline ?? ""}
                onChange={(e) => onChange({ ...c, afterHeadline: e.target.value })}
                className="h-9"
              />
            </Field>
          </div>
          <Field label="Before items, one per line">
            <Textarea
              rows={4}
              value={c.beforeItems.join("\n")}
              onChange={(e) => onChange({ ...c, beforeItems: linesToArray(e.target.value) })}
            />
          </Field>
          <Field label="After items, one per line">
            <Textarea
              rows={4}
              value={c.afterItems.join("\n")}
              onChange={(e) => onChange({ ...c, afterItems: linesToArray(e.target.value) })}
            />
          </Field>
        </div>
      );
    }
    case "included": {
      const c = section.config as IncludedConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <ListEditor
            items={c.items}
            onChange={(items) => onChange({ ...c, items })}
            empty={{ title: "", description: "" } as IncludedConfig["items"][number]}
            renderRow={(item, update) => (
              <div className="space-y-2">
                <Input
                  placeholder="Title"
                  value={item.title}
                  onChange={(e) => update({ ...item, title: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Description (optional)"
                  value={item.description ?? ""}
                  onChange={(e) => update({ ...item, description: e.target.value })}
                  className="h-9"
                />
              </div>
            )}
            addLabel="Add item"
          />
        </div>
      );
    }
    case "comparison": {
      const c = section.config as ComparisonConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Our column label">
              <Input
                value={c.usLabel}
                onChange={(e) => onChange({ ...c, usLabel: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="Their column label">
              <Input
                value={c.themLabel}
                onChange={(e) => onChange({ ...c, themLabel: e.target.value })}
                className="h-9"
              />
            </Field>
          </div>
          <ListEditor
            items={c.rows}
            onChange={(rows) => onChange({ ...c, rows })}
            empty={{ feature: "", us: true, them: false } as ComparisonConfig["rows"][number]}
            renderRow={(row, update) => (
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <Input
                  placeholder="Feature"
                  value={row.feature}
                  onChange={(e) => update({ ...row, feature: e.target.value })}
                  className="h-9"
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={row.us}
                    onChange={(e) => update({ ...row, us: e.target.checked })}
                  />
                  Us
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={row.them}
                    onChange={(e) => update({ ...row, them: e.target.checked })}
                  />
                  Them
                </label>
              </div>
            )}
            addLabel="Add row"
          />
        </div>
      );
    }
    case "testimonials": {
      const c = section.config as TestimonialsConfig;
      return (
        <ListEditor
          items={c.items}
          onChange={(items) => onChange({ items })}
          empty={{ quote: "", name: "", detail: "" } as TestimonialsConfig["items"][number]}
          renderRow={(t, update) => (
            <div className="space-y-2">
              <Textarea
                placeholder="The real quote, as they said it"
                rows={2}
                value={t.quote}
                onChange={(e) => update({ ...t, quote: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Name"
                  value={t.name}
                  onChange={(e) => update({ ...t, name: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Detail (e.g. company, city)"
                  value={t.detail ?? ""}
                  onChange={(e) => update({ ...t, detail: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          )}
          addLabel="Add testimonial"
        />
      );
    }
    case "stats": {
      const c = section.config as StatsConfig;
      return (
        <ListEditor
          items={c.items}
          onChange={(items) => onChange({ items })}
          empty={{ value: "", label: "" } as StatsConfig["items"][number]}
          renderRow={(item, update) => (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Value (e.g. 500+)"
                value={item.value}
                onChange={(e) => update({ ...item, value: e.target.value })}
                className="h-9"
              />
              <Input
                placeholder="Label (e.g. Clients served)"
                value={item.label}
                onChange={(e) => update({ ...item, label: e.target.value })}
                className="h-9"
              />
            </div>
          )}
          addLabel="Add stat"
        />
      );
    }
    case "callout": {
      const c = section.config as CalloutConfig;
      return (
        <div className="space-y-3">
          <Field label="Text">
            <Textarea
              rows={2}
              value={c.text}
              onChange={(e) => onChange({ ...c, text: e.target.value })}
            />
          </Field>
          <Field label="Tone">
            <select
              value={c.tone ?? "highlight"}
              onChange={(e) => onChange({ ...c, tone: e.target.value as CalloutConfig["tone"] })}
              className={fieldClass}
            >
              <option value="highlight">Highlight</option>
              <option value="info">Info</option>
            </select>
          </Field>
        </div>
      );
    }
    case "team": {
      const c = section.config as TeamConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <ListEditor
            items={c.members}
            onChange={(members) => onChange({ ...c, members })}
            empty={{ name: "", role: "", photoUrl: "", bio: "" } as TeamConfig["members"][number]}
            renderRow={(m, update) => (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) => update({ ...m, name: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="Role"
                    value={m.role}
                    onChange={(e) => update({ ...m, role: e.target.value })}
                    className="h-9"
                  />
                </div>
                <Input
                  placeholder="Photo URL (optional — their real photo)"
                  value={m.photoUrl ?? ""}
                  onChange={(e) => update({ ...m, photoUrl: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Short bio (optional)"
                  value={m.bio ?? ""}
                  onChange={(e) => update({ ...m, bio: e.target.value })}
                  className="h-9"
                />
              </div>
            )}
            addLabel="Add team member"
          />
        </div>
      );
    }
    case "image_text": {
      const c = section.config as ImageTextConfig;
      return (
        <ListEditor
          items={c.blocks}
          onChange={(blocks) => onChange({ blocks })}
          empty={{ headline: "", text: "", imageUrl: "", imagePosition: "left" } as ImageTextConfig["blocks"][number]}
          renderRow={(b, update) => (
            <div className="space-y-2">
              <Input
                placeholder="Headline"
                value={b.headline}
                onChange={(e) => update({ ...b, headline: e.target.value })}
                className="h-9"
              />
              <Textarea
                placeholder="Text"
                rows={3}
                value={b.text}
                onChange={(e) => update({ ...b, text: e.target.value })}
              />
              <Input
                placeholder="Image URL (optional)"
                value={b.imageUrl ?? ""}
                onChange={(e) => update({ ...b, imageUrl: e.target.value })}
                className="h-9"
              />
              <select
                value={b.imagePosition}
                onChange={(e) => update({ ...b, imagePosition: e.target.value as ImageTextConfig["blocks"][number]["imagePosition"] })}
                className={fieldClass}
              >
                <option value="left">Image on the left</option>
                <option value="right">Image on the right</option>
              </select>
            </div>
          )}
          addLabel="Add block"
        />
      );
    }
    case "photo_gallery": {
      const c = section.config as PhotoGalleryConfig;
      return (
        <div className="space-y-3">
          <Field label="Headline (optional)">
            <Input
              value={c.headline ?? ""}
              onChange={(e) => onChange({ ...c, headline: e.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Layout">
            <select
              value={c.layout ?? "grid"}
              onChange={(e) => onChange({ ...c, layout: e.target.value as PhotoGalleryConfig["layout"] })}
              className={fieldClass}
            >
              <option value="grid">Grid — even columns</option>
              <option value="masonry">Masonry — varied-height columns</option>
              <option value="carousel">Carousel — horizontal scroll (best for 5+)</option>
              <option value="before_after">Before / After — exactly 2 photos</option>
            </select>
          </Field>
          {c.images.length === 0 && (
            <Field label="Placeholder label (shown until real photos are added)">
              <Input
                value={c.placeholderLabel ?? ""}
                onChange={(e) => onChange({ ...c, placeholderLabel: e.target.value })}
                placeholder="e.g. Add photos of your work"
                className="h-9"
              />
              {c.placeholderBrief && (
                <p className="mt-1.5 text-xs text-muted-foreground">{c.placeholderBrief}</p>
              )}
            </Field>
          )}
          <ListEditor
            items={c.images}
            onChange={(images) => onChange({ ...c, images })}
            empty={{ url: "", caption: "" } as PhotoGalleryConfig["images"][number]}
            renderRow={(img, update) => (
              <div className="space-y-2">
                <Input
                  placeholder="Photo URL"
                  value={img.url}
                  onChange={(e) => update({ ...img, url: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Caption (optional)"
                  value={img.caption ?? ""}
                  onChange={(e) => update({ ...img, caption: e.target.value })}
                  className="h-9"
                />
              </div>
            )}
            addLabel="Add photo"
          />
        </div>
      );
    }
    default:
      return null;
  }
}

/** Create-and-link (no reuse-existing in v1, keeps this simple) a
 *  post-purchase chain step — an upsell or downsell page. Shown inside
 *  a `checkout` section (linking upsellFunnelId) or an `upsell_offer`
 *  section (linking acceptNextFunnelId/declineFunnelId — chaining
 *  another step after this one). */
function PostPurchaseFlowPanel({
  saId,
  parentFunnelId,
  label,
  linkedFunnelId,
  chainRole,
  onLink,
  onUnlink,
}: {
  saId: string;
  parentFunnelId: string;
  label: string;
  linkedFunnelId: string | null | undefined;
  chainRole: "upsell" | "downsell";
  onLink: (funnelId: string) => void;
  onUnlink: () => void;
}) {
  const [creating, setCreating] = useState(false);

  async function createStep() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainRole, parentFunnelId }),
      });
      const d = (await res.json()) as { id?: string };
      if (!res.ok || !d.id) throw new Error();
      onLink(d.id);
    } catch {
      toast.error("Couldn't create the step.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <p className={labelClass}>{label}</p>
      {linkedFunnelId ? (
        <div className="flex items-center gap-2">
          <a
            href={`/sa/${saId}/funnels/${linkedFunnelId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            Edit step page
          </a>
          <Button type="button" variant="ghost" size="sm" onClick={onUnlink}>
            Remove
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={creating} onClick={createStep}>
          {creating ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Create {chainRole} step
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function ListEditor<T>({
  items,
  onChange,
  empty,
  renderRow,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  empty: T;
  renderRow: (item: T, update: (next: T) => void) => React.ReactNode;
  addLabel: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {renderRow(item, (next) =>
            onChange(items.map((it, j) => (j === i ? next : it))),
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, empty])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}
