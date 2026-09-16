import type { ConstructedShape } from "@/lib/funnels/visual-source";

/**
 * CONSTRUCTED VISUALS — rung 3 of the source hierarchy.
 *
 * For propositions photography is a poor medium for. "Every decision routes
 * back through the owner" is a relationship, not a scene: no honest photograph
 * shows it, and a generic business photo placed beside it communicates nothing
 * the headline has not already said. A diagram says it in one look.
 *
 * WHAT THESE ARE NOT. They are conceptual communication devices, and the line
 * they must not cross is asserting a FACT nobody stated. So there are no
 * metrics, no percentages, no counts, no dashboards dressed as real software,
 * no faces, no logos, no testimonials. A shape here says "work converges on
 * one person"; it never says "73% of your work does". The authenticity rules
 * that govern photography govern this rung too — see visual-source.ts, where
 * `establish_proof` deliberately cannot reach it.
 *
 * FIVE SHAPES, DELIBERATELY. Each maps to a persuasion job the argument
 * actually produces. This is not an illustration platform and must not grow
 * into one: a sixth shape needs a sixth job that the argument can name.
 *
 * Inline SVG with `currentColor` and the accent, so a shape is legible on a
 * light or dark page without a second implementation, and carries no asset to
 * load or fail.
 */

/** Deterministic node positions — no randomness, so a page renders identically
 *  on every build and a screenshot diff means something. */
const SPOKES = [
  { x: 26, y: 22 },
  { x: 74, y: 22 },
  { x: 14, y: 50 },
  { x: 86, y: 50 },
  { x: 26, y: 78 },
  { x: 74, y: 78 },
];

function Caption({ text }: { text: string }) {
  return (
    <figcaption className="mt-4 text-center text-sm leading-relaxed opacity-70">{text}</figcaption>
  );
}

/** Work converging on a single point — the bottleneck argument. */
function HubBottleneck({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
      {SPOKES.map((p, i) => (
        <line key={i} x1={p.x} y1={p.y} x2="50" y2="50" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.2" />
      ))}
      {SPOKES.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="5" fill="currentColor" fillOpacity="0.18" />
      ))}
      {/* The hub is heavier than everything it serves — that weight IS the
          argument, so it is drawn rather than labelled. */}
      <circle cx="50" cy="50" r="13" fill={accent} />
      <circle cx="50" cy="50" r="19" fill="none" stroke={accent} strokeOpacity="0.3" strokeWidth="1.5" />
    </svg>
  );
}

/** The same work, distributed — the future-state argument. */
function DistributedNetwork({ accent }: { accent: string }) {
  const ring = [
    { x: 50, y: 18 },
    { x: 82, y: 38 },
    { x: 74, y: 74 },
    { x: 26, y: 74 },
    { x: 18, y: 38 },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
      {ring.map((p, i) => {
        const n = ring[(i + 1) % ring.length];
        return <line key={i} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke={accent} strokeOpacity="0.45" strokeWidth="1.4" />;
      })}
      {ring.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="9" fill={accent} fillOpacity="0.16" />
          <circle cx={p.x} cy={p.y} r="9" fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}

/** Scattered pieces resolving into a line — recognition of the problem. */
function FragmentedToConnected({ accent }: { accent: string }) {
  const loose = [
    { x: 16, y: 26 },
    { x: 38, y: 16 },
    { x: 30, y: 42 },
    { x: 12, y: 52 },
  ];
  const joined = [
    { x: 62, y: 50 },
    { x: 74, y: 50 },
    { x: 86, y: 50 },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
      {loose.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width="9" height="9" rx="2" fill="currentColor" fillOpacity="0.2" transform={`rotate(${i * 17 - 20} ${p.x + 4} ${p.y + 4})`} />
      ))}
      <path d="M44 46 C52 46, 52 50, 58 50" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="3 3" />
      <line x1="62" y1="50" x2="86" y2="50" stroke={accent} strokeOpacity="0.5" strokeWidth="1.6" />
      {joined.map((p, i) => (
        <rect key={i} x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" fill={accent} fillOpacity="0.85" />
      ))}
    </svg>
  );
}

/** Two states side by side — the objection/contrast argument. */
function StateContrast({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
      <rect x="8" y="26" width="34" height="48" rx="4" fill="currentColor" fillOpacity="0.09" />
      {[36, 46, 56, 66].map((y, i) => (
        <line key={i} x1="15" y1={y} x2={i % 2 === 0 ? 34 : 28} y2={y} stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
      ))}
      <path d="M46 50 L56 50 M52 46 L56 50 L52 54" fill="none" stroke={accent} strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="60" y="26" width="34" height="48" rx="4" fill={accent} fillOpacity="0.12" stroke={accent} strokeOpacity="0.4" strokeWidth="1.2" />
      {[36, 46, 56, 66].map((y, i) => (
        <line key={i} x1="67" y1={y} x2="87" y2={y} stroke={accent} strokeOpacity="0.55" strokeWidth="2" />
      ))}
    </svg>
  );
}

/** Ordered steps — the mechanism argument. */
function Sequence({ accent }: { accent: string }) {
  const xs = [20, 50, 80];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="presentation">
      <line x1="20" y1="50" x2="80" y2="50" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.4" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="50" r="11" fill={accent} fillOpacity={0.16 + i * 0.18} />
          <circle cx={x} cy="50" r="11" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="1.4" />
          <text x={x} y="54" textAnchor="middle" fontSize="11" fontWeight="700" fill={accent}>
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

const SHAPES: Record<ConstructedShape, (p: { accent: string }) => React.ReactElement> = {
  hub_bottleneck: HubBottleneck,
  distributed_network: DistributedNetwork,
  fragmented_to_connected: FragmentedToConnected,
  state_contrast: StateContrast,
  sequence: Sequence,
};

/**
 * THE DRAWING, AS PART OF ITS SECTION.
 *
 * Sized to take a full column of a split rather than to sit as a small card in
 * a band of its own. The first render capped this at `max-w-md` and centred it
 * under the copy, which is what made a load-bearing diagram read as a
 * placeholder: a visual that is the other half of a beat has to hold the weight
 * of the half it is beside.
 *
 * The caption is not decoration either — it is the page's own proposition, so
 * the idea survives for a screen reader and for anyone who reads the picture
 * rather than studies it.
 */
export function ConceptVisual({
  shape,
  caption,
  accentColor,
  className = "",
}: {
  shape: ConstructedShape;
  /** The proposition this drawing communicates — the page's own words. Doubles
   *  as the accessible description, so the idea survives for a screen reader
   *  instead of being lost with the picture. */
  caption: string;
  accentColor: string;
  className?: string;
}) {
  const Shape = SHAPES[shape];
  if (!Shape) return null;
  return (
    <figure
      data-proof-visual={`constructed:${shape}`}
      className={`m-0 ${className}`}
      aria-label={caption}
      role="img"
    >
      <div
        className="aspect-[4/3] w-full overflow-hidden p-8 ring-1 ring-black/[0.06] dark:ring-white/[0.10]"
        style={{
          borderRadius: "var(--flow-radius, 1rem)",
          // Enough tint to read as a deliberate surface rather than as an empty
          // area the page forgot to fill, and a tint of the ACCENT so it
          // belongs to this page rather than to the component.
          backgroundColor: `color-mix(in oklab, ${accentColor} 7%, transparent)`,
        }}
      >
        <Shape accent={accentColor} />
      </div>
      <Caption text={caption} />
    </figure>
  );
}

/**
 * ONE BEAT'S VISUAL, WHATEVER MEDIUM WON IT.
 *
 * The section hosting a beat should not have to know which rung of the source
 * hierarchy answered — that decision was made upstream, and a section that
 * branched on it would be a second place the hierarchy is encoded. It renders a
 * photograph or a drawing through the same slot, at the same weight.
 */
export function BeatVisual({
  visual,
  accentColor,
  className = "",
}: {
  visual: { shape?: string; caption: string; url?: string; alt?: string };
  accentColor: string;
  className?: string;
}) {
  if (visual.url) {
    return (
      <figure className={`m-0 ${className}`}>
        <div
          className="overflow-hidden ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
          style={{ borderRadius: "var(--flow-radius, 1rem)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visual.url}
            alt={visual.alt ?? ""}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
      </figure>
    );
  }
  if (!visual.shape) return null;
  return (
    <ConceptVisual
      shape={visual.shape as ConstructedShape}
      caption={visual.caption}
      accentColor={accentColor}
      className={className}
    />
  );
}
