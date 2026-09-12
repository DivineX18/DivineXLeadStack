import type { CSSProperties, ReactNode } from "react";

/**
 * SHARED COMPOSITION PRIMITIVES.
 *
 * Before this, every one of the 28 section components owned its own `<section>`
 * tag, its own padding, and its own hardcoded measure — 33 independent
 * `max-w-*` values ranging from `max-w-md` to `max-w-6xl`, with nothing naming
 * what any of them meant. Two things followed. Changing the page's measure
 * meant editing 33 files, and — the reason this module exists now — the
 * composition planner had no vocabulary to request a shape with. It could pick
 * between the layouts that happened to exist, and almost all of them were a
 * narrow centred column, which is why a generated page read as one silhouette
 * repeated however good its copy was.
 *
 * So this is deliberately NOT a redesign of 28 components. It is the smallest
 * set of shapes a page actually needs, expressed once, so a section can adopt
 * one instead of reinventing it and the planner can name one instead of hoping.
 *
 * WIDTH IS A SEMANTIC, NOT A NUMBER. `reading` is a measure chosen for
 * uninterrupted prose; `content` is the default for a section with structure in
 * it; `wide` is for a composition that needs the page; `full` is for a visual
 * that IS the page. A section asks for the one that matches its job, and the
 * numbers stay in one place.
 */

export type SectionWidth = "reading" | "content" | "wide" | "full";

const WIDTH_CLASS: Record<SectionWidth, string> = {
  // Long-form prose. Roughly 65 characters at the body size — past this a
  // reader loses the line return, which is the actual reason for the cap.
  reading: "mx-auto w-full max-w-2xl",
  // The default: enough room for a two-column list, a card, a form.
  content: "mx-auto w-full max-w-4xl",
  // A composition that needs the page — split rows, showcases, process flows.
  wide: "mx-auto w-full max-w-6xl",
  // Edge to edge. The shell drops its own horizontal padding so the child can
  // bleed; the child owns any inset it wants.
  full: "w-full",
};

/**
 * The outer frame of a section: the landmark element, the vertical rhythm, and
 * the measure. `--flow-py` is the page's density token, set once on the funnel
 * root — sections that hardcoded their padding ignored visual density entirely,
 * which is why several never responded to a campaign's density setting.
 */
export function SectionShell({
  width = "content",
  className = "",
  style,
  children,
}: {
  width?: SectionWidth;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const full = width === "full";
  return (
    <section
      className={full ? className : `px-4 ${className}`}
      style={{ paddingBlock: "var(--flow-py, 3rem)", ...style }}
    >
      <div className={WIDTH_CLASS[width]}>{children}</div>
    </section>
  );
}

/**
 * TEXT BESIDE MEDIA, and its mirror.
 *
 * `mediaSide` is the whole point: a page whose every media row opens on the
 * same side reads as a column of identical rows rather than a rhythm, so the
 * side is a decision the page-level planner makes across sections rather than a
 * constant baked into a component.
 *
 * `emphasis` sets which column gets the extra width. A media-led row gives the
 * picture the larger share; a text-led row does the opposite. An even split is
 * the neutral default and is usually right when both sides carry real weight.
 */
export function SplitLayout({
  media,
  children,
  mediaSide = "right",
  emphasis = "even",
  className = "",
}: {
  media: ReactNode;
  children: ReactNode;
  mediaSide?: "left" | "right";
  emphasis?: "even" | "media" | "text";
  className?: string;
}) {
  const cols =
    emphasis === "media"
      ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
      : emphasis === "text"
        ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
        : "lg:grid-cols-2";
  // Order is set on the MEDIA cell only, so the text always comes first in the
  // DOM. A reverse split must be a visual decision, never a reading-order one:
  // a screen reader and a mobile reader both get text then picture regardless
  // of which side the picture sits on at desktop width.
  const mediaOrder = mediaSide === "left" ? "lg:order-first" : "";
  return (
    <div className={`grid items-center gap-10 ${cols} lg:gap-16 ${className}`}>
      <div className="min-w-0">{children}</div>
      <div className={`min-w-0 ${mediaOrder}`}>{media}</div>
    </div>
  );
}

/**
 * A VISUAL THAT ANCHORS THE PAGE.
 *
 * There was no wide-media composition anywhere in the renderer — the widest
 * treatment any section had for a picture was a contained card — so a page
 * could never use an image as a structural element, only as decoration beside
 * text. This is the missing one: a single visual given real height and the
 * page's width, with an optional caption beneath it.
 *
 * `aspect` is capped in viewport height as well as ratio so a wide visual can
 * never push the rest of the page below a phone's fold.
 */
export function WideMedia({
  children,
  caption,
  accentColor,
  className = "",
}: {
  children: ReactNode;
  caption?: string;
  accentColor?: string;
  className?: string;
}) {
  return (
    <figure className={`m-0 ${className}`}>
      <div
        className="overflow-hidden ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
        style={{ borderRadius: "var(--flow-radius, 1rem)", maxHeight: "58svh" }}
      >
        {children}
      </div>
      {caption && (
        <figcaption
          className="mt-3 text-center text-sm opacity-70"
          style={accentColor ? { color: undefined } : undefined}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * THE DELIVERABLE, SHOWN.
 *
 * Some businesses cannot honestly use photography at all: a stock "product" for
 * a product nobody has seen, or a stock "coach" for a coach we cannot picture,
 * is invented evidence. Blocking the photograph was the right call and it left
 * those pages with no visual proof of any kind — three of five fixtures
 * rendered with zero images and nothing in their place, which is an absence
 * rather than honesty.
 *
 * This is the honest substitute: the REAL contents of what the buyer receives,
 * framed as a document. It is a presentation of facts the page already asserts
 * elsewhere, and the "Example preview" chip is not decoration — it is the
 * reason this is allowed to exist, because without it a framed artifact could
 * be mistaken for a historical customer document. Never remove the label.
 *
 * Lifted out of `included-section.tsx`, which had the only implementation, so
 * more than one section can present a deliverable without a second copy of it.
 */
export function DocumentShowcase({
  items,
  accentColor,
  label = "Example preview",
  className = "",
  theme,
}: {
  items: { title: string; description?: string }[];
  accentColor: string;
  /** What this artifact IS. Must never imply a real customer's document. */
  label?: string;
  className?: string;
  /**
   * THE PAGE'S OWN THEME, NOT THE BROWSER'S.
   *
   * These surfaces were painted with Tailwind `dark:` variants, which key off
   * the VIEWER's colour scheme. A funnel's dark theme is not that — it is set
   * per page and applied as inline colours on the root, so on a dark page in a
   * light-mode browser the `dark:` half never fired: the paper rendered as a
   * 60%-white wash over near-black (a flat mid grey) while the text kept the
   * page's near-white ink. The paid-offer page's only visual beat shipped as
   * light-grey copy on mid-grey, close to unreadable.
   *
   * So the surfaces read the page's theme, which is what they always meant.
   */
  theme?: "light" | "dark";
}) {
  const dark = theme === "dark";
  // A sheet of paper is a LIFT off whatever it sits on: near-white on a light
  // page, a faint white veil on a dark one. Same intent the `dark:` variants
  // carried, keyed to the right signal.
  const paper = dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.6)";
  const ink = dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
  const ruleLine = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)";
  return (
    <div
      // Marked so the rendered-quality harness can count composed proof as a
      // visual beat. A page whose category forbids photography is not visually
      // bare when it shows the deliverable; the check that asked "are there
      // images" was asking the wrong question.
      data-proof-visual="document_showcase"
      className={`overflow-hidden rounded-2xl border shadow-[0_18px_50px_-18px_rgba(0,0,0,0.25)] ${className}`}
      style={{ borderColor: `${accentColor}2e` }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: `${accentColor}22`, backgroundColor: `${accentColor}0d` }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ink }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ink }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ink }} />
        </div>
        <span
          className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest opacity-60"
          style={{ borderColor: `${accentColor}44` }}
        >
          {label}
        </span>
      </div>
      <div className="space-y-4 px-6 py-6" style={{ backgroundColor: paper }}>
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm leading-relaxed opacity-70">{item.description}</p>}
              {/* Suggests the body of a document without printing words nobody
                  wrote. Hidden from assistive technology: it carries no
                  information, and announcing it would imply content that is
                  not there. */}
              <div className="mt-2 space-y-1.5" aria-hidden>
                <div className="h-1.5 w-4/5 rounded-full" style={{ backgroundColor: ruleLine }} />
                <div className="h-1.5 w-3/5 rounded-full" style={{ backgroundColor: ruleLine }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * THE MECHANISM, DRAWN.
 *
 * The other honest visual for a page that cannot photograph anything: the
 * verified process, as a sequence. A business that states it performs three
 * steps may show those three steps — that is its own claim rendered, not a new
 * one. It fabricates nothing, needs no asset, and gives a text-only page a
 * shape that is not another checklist.
 *
 * Horizontal at desktop width so it reads as a flow rather than a list, and
 * stacked on a phone where a horizontal flow would shrink to nothing. The
 * connectors are decorative and hidden from assistive technology; the ordered
 * list underneath carries the real sequence.
 */
export function ProcessFlow({
  steps,
  accentColor,
  className = "",
}: {
  steps: { title: string; description?: string }[];
  accentColor: string;
  className?: string;
}) {
  return (
    // `repeat(auto-fit, minmax(...))` rather than a column count: a dynamic
    // `sm:grid-cols-${n}` class is never generated by Tailwind's scanner, and an
    // inline column count would apply on a phone too and squeeze four steps into
    // 390px. auto-fit stacks to one column when the tracks no longer fit, which
    // is the behaviour wanted at both ends without a breakpoint.
    <ol
      data-proof-visual="process_flow"
      className={`grid list-none gap-6 p-0 ${className}`}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
    >
      {steps.map((step, i) => (
        <li key={i} className="relative min-w-0 list-none">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span
                className="hidden h-px flex-1 sm:block"
                style={{ backgroundColor: `${accentColor}40` }}
                aria-hidden
              />
            )}
          </div>
          <p className="mt-3 font-bold tracking-tight">{step.title}</p>
          {step.description && <p className="mt-1 text-sm leading-relaxed opacity-70">{step.description}</p>}
        </li>
      ))}
    </ol>
  );
}
