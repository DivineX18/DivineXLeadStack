import { Quote, Sparkles } from "lucide-react";
import type { CalloutConfig } from "@/types/funnels";
import { MediaPlaceholder } from "./media-placeholder";

export function CalloutSection({
  config,
  accentColor,
}: {
  config: CalloutConfig;
  accentColor: string;
}) {
  if (!config.text) {
    return (
      <section className="px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <MediaPlaceholder
            label="This section has no content yet — add it in the builder"
            accentColor={accentColor}
            className="min-h-24"
          />
        </div>
      </section>
    );
  }
  const Icon = config.tone === "highlight" ? Sparkles : Quote;

  return (
    <section className="px-4 py-10">
      <div
        className="mx-auto flex max-w-2xl items-start gap-4 border p-7"
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
    </section>
  );
}
