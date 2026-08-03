import { Play, User } from "lucide-react";
import type { HeroConfig } from "@/types/funnels";
import { CtaButton } from "./cta-button";

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
          <img src={config.mediaUrl} alt="" className="h-full w-full object-cover" />
        )
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

export function HeroSection({
  config,
  accentColor,
  subAccountId,
}: {
  config: HeroConfig;
  accentColor: string;
  theme?: "light" | "dark";
  subAccountId?: string;
}) {
  const hasMedia = config.mediaType !== "none" && !!config.mediaUrl;
  const layout = hasMedia ? (config.layout ?? "centered") : "centered";

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

  const cta = config.ctaLabel && (
    <div className="mt-10">
      <CtaButton
        label={config.ctaLabel}
        href={config.ctaHref}
        cta={config.cta}
        accentColor={accentColor}
        subAccountId={subAccountId}
      />
    </div>
  );

  if (layout === "background_image" && config.mediaUrl) {
    return (
      <section className="relative overflow-hidden px-4 py-24 sm:py-32">
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
            style={{ fontSize: "clamp(2.25rem, 6vw, 4.25rem)", lineHeight: 1.08 }}
          >
            {config.headline}
          </h1>
          {config.subheadline && (
            <p
              className="mx-auto mt-5 max-w-xl leading-relaxed opacity-90"
              style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
            >
              {config.subheadline}
            </p>
          )}
          {cta}
        </div>
      </section>
    );
  }

  if (layout === "founder_image") {
    return (
      <section
        className="relative overflow-hidden px-4 pb-16 pt-20 sm:pt-28"
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
            style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", lineHeight: 1.1 }}
          >
            {config.headline}
          </h1>
          {config.subheadline && (
            <p
              className="mx-auto mt-5 max-w-xl leading-relaxed opacity-70"
              style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
            >
              {config.subheadline}
            </p>
          )}
          {cta}
        </div>
      </section>
    );
  }

  if (layout === "split") {
    return (
      <section
        className="relative overflow-hidden px-4 pb-16 pt-20 sm:pt-28"
        style={{
          backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
        }}
      >
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            {eyebrow}
            <h1
              className="text-balance font-extrabold tracking-tight"
              style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", lineHeight: 1.08 }}
            >
              {config.headline}
            </h1>
            {config.subheadline && (
              <p
                className="mx-auto mt-5 max-w-xl opacity-70 lg:mx-0"
                style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)" }}
              >
                {config.subheadline}
              </p>
            )}
            {cta}
          </div>
          <MediaBlock config={config} accentColor={accentColor} className="aspect-video w-full" />
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative overflow-hidden px-4 pb-16 pt-20 sm:pt-28"
      style={{
        backgroundImage: `linear-gradient(180deg, ${accentColor}22 0%, ${accentColor}0a 45%, transparent 80%), radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}30, transparent)`,
      }}
    >
      <div className="relative mx-auto max-w-3xl text-center">
        {eyebrow}
        <h1
          className="text-balance font-extrabold tracking-tight"
          style={{ fontSize: "clamp(2.25rem, 6vw, 4.25rem)", lineHeight: 1.08 }}
        >
          {config.headline}
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
          <MediaBlock
            config={config}
            accentColor={accentColor}
            className="mx-auto mt-10 aspect-video max-w-2xl"
          />
        )}

        {cta}
      </div>
    </section>
  );
}
