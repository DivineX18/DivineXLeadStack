import { Quote, Sparkles } from "lucide-react";
import type { CalloutConfig } from "@/types/funnels";
import { SplitLayout } from "./composition";
import { BeatVisual } from "./concept-visual";

export function CalloutSection({
  config,
  accentColor,
}: {
  config: CalloutConfig;
  accentColor: string;
}) {
  if (!config.text) return null;
  const Icon = config.tone === "highlight" ? Sparkles : Quote;

  const statement = (
    <div
      className="flex items-start gap-4 border p-7"
      style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d`, borderRadius: "var(--flow-radius, 1rem)" }}
    >
      <Icon className="mt-1 h-6 w-6 shrink-0" style={{ color: accentColor }} />
      <p
        className="text-balance font-semibold tracking-tight"
        style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.375rem)", lineHeight: 1.4 }}
      >
        {config.text}
      </p>
    </div>
  );

  // A single statement is the one thing on a page that can take a visual
  // without competing with it — there is no list, no card and no form here for
  // the picture to argue with.
  if (config.beatVisual) {
    return (
      <section className="px-4 py-10">
        <SplitLayout
          className="mx-auto max-w-6xl"
          mediaSide={config.beatVisual.side ?? "right"}
          media={<BeatVisual visual={config.beatVisual} accentColor={accentColor} />}
        >
          {statement}
        </SplitLayout>
      </section>
    );
  }

  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-2xl">{statement}</div>
    </section>
  );
}
