import { Lock, CreditCard, Shield, Star } from "lucide-react";
import type { TrustBadgesConfig } from "@/types/funnels";

const ICONS = { lock: Lock, card: CreditCard, shield: Shield, star: Star } as const;

export function TrustBadgesSection({
  config,
  accentColor,
}: {
  config: TrustBadgesConfig;
  accentColor: string;
}) {
  if (config.badges.length === 0) return null;
  return (
    <section className="px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {config.badges.map((badge, i) => {
          const Icon = ICONS[badge.iconType];
          return (
            <div
              key={i}
              className="flex items-center gap-2 text-sm font-medium opacity-70"
            >
              <Icon className="h-4 w-4" style={{ color: accentColor }} />
              {badge.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}
