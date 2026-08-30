import { Check, Play, User } from "lucide-react";
import type { HeroConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";
import { CtaButton } from "./cta-button";

/**
 * ABOVE-THE-FOLD DECISION COMPLETENESS.
 *
 * The invariant is not "the hero is N pixels tall". It is that on a typical
 * viewport a visitor can understand what this is, why it matters, what to do,
 * and see enough evidence to trust it — WITHOUT scrolling. Observed failing on
 * a real page: the headline consumed the whole first screen, the media sat
 * below it, and the CTA plus the trust row fell off the fold entirely.
 *
 * Expressed in viewport units so it adapts rather than being tuned to one
 * device. `svh` (small viewport height) is deliberate: on mobile it excludes
 * the browser chrome that `vh` ignores, which is exactly where the CTA was
 * being pushed out of sight.
 *
 * The rule when space is tight: MEDIA YIELDS. Imagery supports the decision;
 * it never outranks the CTA or the trust evidence. This is why the hero is
 * allowed to carry no image at all — a logo, a strong headline, a CTA and a
 * trust row can satisfy the invariant on their own, and the composition
 * engine decides per business rather than obeying a "hero needs a photo" rule.
 */
const FOLD_SECTION = "flex min-h-[100svh] flex-col justify-center px-4 py-12 sm:py-16";
/** Headline scales with the SHORTER axis too, so a long headline shrinks on a
 *  short screen instead of pushing the CTA under the fold. */
const FOLD_HEADLINE = "clamp(1.875rem, min(5.5vw, 7.2svh), 3.5rem)";
/** Hero media is capped in viewport height and contained, never cropped to a
 *  fixed box — it gives up space first. */
const FOLD_MEDIA = "max-h-[32svh] w-auto object-contain";
import { DeviceFrame } from "./device-frame";
import { MediaPlaceholder } from "./media-placeholder";

function MediaBlock({
  config,
  accentColor,
  className,
}: {
  config: HeroConfig;
  accentColor: string;
  className: string;
}) {
  const hasMedia = config.mediaType !== "none" && config.mediaUrl;
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10 ${className}`}
      style={
        !hasMedia
          ? { background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}0d)` }
          : undefined
      }
    >
      {hasMedia ? (
        config.mediaType === "video" ? (
          <iframe
            src={config.mediaUrl}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.mediaUrl} alt="" className={`h-full w-full object-cover ${FOLD_MEDIA}`} />
        )
      ) : config.mediaPlaceholderLabel ? (
        <MediaPlaceholder label={config.mediaPlaceholderLabel} accentColor={accentColor} className="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg ring-4 ring-white/40 transition-transform group-hover:scale-110 dark:ring-black/30"
            style={{ backgroundColor: accentColor }}
          >
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </span>
        </div>
      )}
    </div>
  );
}

/** Renders `headline`, wrapping `accentPhrase` (if it's a real substring) in
 *  the design pack's gradient. Falls back to plain text when there's no
 *  gradient token or no match — never breaks the headline. */
function GradientHeadline({
  headline,
  accentPhrase,
  gradient,
}: {
  headline: string;
  accentPhrase?: string;
  gradient?: [string, string];
}) {
  if (!accentPhrase || !gradient) return <>{headline}</>;
  const idx = headline.indexOf(accentPhrase);
  if (idx === -1) return <>{headline}</>;
  const before = headline.slice(0, idx);
  const after = headline.slice(idx + accentPhrase.length);
  return (
    <>
      {before}
      <span
        style={{
          backgroundImage: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {accentPhrase}
      </span>
      {after}
    </>
  );
}

export function HeroSection({
  config,
  accentColor,
  theme,
  forms,
  subAccountId,
  headlineGradient,
  ctaAnimationLevel,
  successRedirect,
  captureSuccess,
  previewMode,
  published,
}: {
  config: HeroConfig;
  accentColor: string;
  theme?: "light" | "dark";
  forms?: Record<string, LeadForm>;
  subAccountId?: string;
  headlineGradient?: [string, string];
  ctaAnimationLevel?: "none" | "minimal" | "moderate" | "expressive";
  successRedirect?: string;
  captureSuccess?: { message: string; downloadUrl?: string; downloadName?: string };
  previewMode?: boolean;
  /** True on the live published render. A placeholder-only media slot
   *  (label but no real URL) renders in the builder/preview as an honest
   *  "add your asset" frame — but on a LIVE page it's a dead dark block
   *  that eats most of the first fold (Story-Fold Law violation) and reads
   *  like unfinished scaffolding to a visitor. Published pages drop it. */
  published?: boolean;
}) {
  if (published && !config.mediaUrl && config.mediaType !== "none") {
    config = { ...config, mediaType: "none", mediaPlaceholderLabel: undefined };
  }
  // A device-mockup/split/background/founder layout still renders (with an
  // honest labeled placeholder) when Zeno set mediaPlaceholderLabel but has
  // no real asset yet — but never for a plain funnel with neither signal,
  // which stays the exact today's-behavior centered fallback.
  const hasMediaIntent = config.mediaType !== "none" && (!!config.mediaUrl || !!config.mediaPlaceholderLabel);
  const layout = hasMediaIntent ? (config.layout ?? "centered") : "centered";
  const form = config.formId && forms ? forms[config.formId] : null;

  const eyebrow = config.eyebrow && (
    <p
      className="mb-6 inline-block rounded-full border px-4 py-1.5 text-sm font-semibold tracking-tight"
      style={{
        backgroundColor: `${accentColor}14`,
        color: accentColor,
        borderColor: `${accentColor}33`,
      }}
    >
      {config.eyebrow}
    </p>
  );

  const headlineNode = (
    <GradientHeadline headline={config.headline} accentPhrase={config.headlineAccent} gradient={headlineGradient} />
  );

  const bulletsNode = config.bullets && config.bullets.length > 0 && (
    <ul className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-2 text-left sm:items-start">
      {config.bullets.map((b, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm opacity-85">
          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );

  const trustNode = config.trustBadges && config.trustBadges.length > 0 && (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm opacity-70">
      {config.trustBadges.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
          <span>{b}</span>
        </span>
      ))}
    </div>
  );

  const cta = (config.ctaLabel || form) && (
    <div className="mt-7">
      <CtaButton
        label={config.ctaLabel || "Get it now"}
        href={config.ctaHref}
        form={form}
        cta={config.cta}
        accentColor={accentColor}
        subAccountId={subAccountId}
        pageTheme={theme}
        animationLevel={ctaAnimationLevel}
              successRedirect={successRedirect}
              captureSuccess={captureSuccess}
              previewMode={previewMode}
      />
      {trustNode}
    </div>
  );

  if (layout === "background_image" && config.mediaUrl) {
    return (
      <section className={`relative overflow-hidden ${FOLD_SECTION}`}>
        {config.mediaType === "video" ? (
          <video
            src={config.mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative mx-auto max-w-3xl text-center text-white">
          {eyebrow}
          <h1
            className="text-balance font-extrabold tracking-tight"
            style={{ fontSize: FOLD_HEADLINE, lineHeight: 1.08 }}
          >
            {headlineNode}
          </h1>
          {config.subheadline && (
            <p
              className="mx-auto mt-5 max-w-xl leading-relaxed opacity-90"
              style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
            >
              {config.subheadline}
            </p>
          )}
          {bulletsNode}
          {cta}
        </div>
      </section>
    );
  }

  if (layout === "founder_image") {
    return (
      <section
        className={`relative overflow-hidden ${FOLD_SECTION}`}
        style={{
          backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
        }}
      >
        <div className="relative mx-auto max-w-2xl text-center">
          {config.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.mediaUrl}
              alt=""
              className="mx-auto mb-6 h-20 w-20 rounded-full object-cover shadow-lg ring-4 ring-white/40 dark:ring-black/30"
            />
          ) : config.mediaPlaceholderLabel ? (
            <MediaPlaceholder
              label={config.mediaPlaceholderLabel}
              accentColor={accentColor}
              shape="circle"
              className="mx-auto mb-6 h-20 w-20"
            />
          ) : (
            <span
              className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
              style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
            >
              <User className="h-9 w-9" />
            </span>
          )}
          {eyebrow}
          <h1
            className="text-balance font-extrabold tracking-tight"
            style={{ fontSize: FOLD_HEADLINE, lineHeight: 1.1 }}
          >
            {headlineNode}
          </h1>
          {config.subheadline && (
            <p
              className="mx-auto mt-5 max-w-xl leading-relaxed opacity-70"
              style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
            >
              {config.subheadline}
            </p>
          )}
          {bulletsNode}
          {cta}
        </div>
      </section>
    );
  }

  if (layout === "split") {
    return (
      <section
        className={`relative overflow-hidden ${FOLD_SECTION}`}
        style={{
          backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
        }}
      >
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            {eyebrow}
            <h1
              className="text-balance font-extrabold tracking-tight"
              style={{ fontSize: FOLD_HEADLINE, lineHeight: 1.08 }}
            >
              {headlineNode}
            </h1>
            {config.subheadline && (
              <p
                className="mx-auto mt-5 max-w-xl opacity-70 lg:mx-0"
                style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
              >
                {config.subheadline}
              </p>
            )}
            {bulletsNode}
            {cta}
          </div>
          <MediaBlock config={config} accentColor={accentColor} className="aspect-video w-full" />
        </div>
      </section>
    );
  }

  if (layout === "browser_mockup" || layout === "phone_mockup") {
    return (
      <section
        className={`relative overflow-hidden ${FOLD_SECTION}`}
        style={{
          backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
        }}
      >
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            {eyebrow}
            <h1
              className="text-balance font-extrabold tracking-tight"
              style={{ fontSize: FOLD_HEADLINE, lineHeight: 1.08 }}
            >
              {headlineNode}
            </h1>
            {config.subheadline && (
              <p
                className="mx-auto mt-5 max-w-xl opacity-70 lg:mx-0"
                style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
              >
                {config.subheadline}
              </p>
            )}
            {bulletsNode}
            {cta}
          </div>
          <DeviceFrame
            kind={layout === "phone_mockup" ? "phone" : "browser"}
            mediaUrl={config.mediaUrl}
            mediaType={config.mediaType === "video" ? "video" : "image"}
            placeholderLabel={config.mediaPlaceholderLabel || "Add a product screenshot"}
            accentColor={accentColor}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className={`relative overflow-hidden ${FOLD_SECTION}`}
      style={{
        backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
      }}
    >
      <div className="relative mx-auto max-w-3xl text-center">
        {eyebrow}
        <h1
          className="text-balance font-extrabold tracking-tight"
          /* Bulleted (one-fold squeeze) heroes cap the display size a step
             lower — the fold has to hold headline + sub + CTA + proof line
             + bullets, and 4.25rem across three lines alone eats half of it. */
          style={{ fontSize: config.bullets?.length ? "clamp(2rem, 4.5vw, 3.1rem)" : "clamp(2.25rem, 6vw, 4.25rem)", lineHeight: 1.08 }}
        >
          {headlineNode}
        </h1>
        {config.subheadline && (
          <p
            className="mx-auto mt-5 max-w-xl leading-relaxed opacity-70"
            style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
          >
            {config.subheadline}
          </p>
        )}

        {config.mediaType !== "none" && (
          // max-h keeps the whole first fold intact: with CSS aspect-ratio the
          // box shrinks its width to honor the height cap, so headline + media
          // + CTA all land in one viewport instead of forcing a scroll to act.
          <MediaBlock
            config={config}
            accentColor={accentColor}
            className="mx-auto mt-6 aspect-video max-h-[38vh] max-w-2xl"
          />
        )}

        {config.bullets && config.bullets.length > 0 ? (
          // One-fold/squeeze order: the CTA stays in the FIRST frame (no
          // scrolling to act on a short free-offer page); bullets support
          // the decision underneath.
          <>
            {cta}
            {bulletsNode}
          </>
        ) : (
          <>
            {bulletsNode}
            {cta}
          </>
        )}
      </div>
    </section>
  );
}
