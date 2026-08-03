import { Quote, Sparkles } from "lucide-react";
import type { CalloutConfig } from "@/types/funnels";

export function CalloutSection({
  config,
  accentColor,
}: {
  config: CalloutConfig;
  accentColor: string;
}) {
  if (!config.text) return null;
  const Icon = config.tone === "highlight" ? Sparkles : Quote;

  return (
    <section className="px-4 py-10">
      <div
        className="mx-auto flex max-w-2xl items-start gap-4 rounded-2xl border p-7"
        style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d` }}
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
