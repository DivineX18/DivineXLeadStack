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
import type { LeadForm } from "@/types/forms";
import type {
  AgendaConfig,
  CountdownConfig,
  CtaBannerConfig,
  FaqConfig,
  FunnelDoc,
  FunnelSection,
  FunnelSectionType,
  HeroConfig,
  OfferConfig,
  ProofStripConfig,
  StoryConfig,
  TicketTiersConfig,
} from "@/types/funnels";

const SECTION_LABELS: Record<FunnelSectionType, string> = {
  hero: "Hero",
  proof_strip: "Proof strip",
  offer: "Offer",
  story: "Story",
  faq: "FAQ",
  cta_banner: "CTA banner",
  countdown: "Countdown",
  agenda: "Agenda",
  ticket_tiers: "Ticket tiers",
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
};

function linesToArray(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
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
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          status: patchStatus ?? status,
          theme,
          accentColor,
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
          {funnel.genre === "lead_magnet"
            ? "Lead Magnet"
            : funnel.genre === "vsl"
              ? "VSL"
              : "Challenge"}
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
      </div>

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
  onChange,
}: {
  section: FunnelSection;
  forms: LeadForm[];
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
            <Field label="Media URL">
              <Input
                value={c.mediaUrl ?? ""}
                onChange={(e) => onChange({ ...c, mediaUrl: e.target.value })}
                className="h-9"
              />
            </Field>
          )}
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
    default:
      return null;
  }
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
