"use client";

import { Button } from "@/components/ui/button";
import { trackFunnelEvent } from "@/lib/analytics/track";

/**
 * The hero's acquisition paths — one primary, one quiet.
 *
 * Both destinations are plain links to EXISTING certified surfaces: the public
 * Growth Scanner, and `/start`, which is the first step of the trial and is
 * host-aware (resolveProductSurface picks Ascend Solo here, Flow's plan on
 * crm). No checkout is initiated from this component — `/start` owns that, so
 * there is exactly one place where a trial can begin.
 *
 * (It previously carried a client-side fetch to `/api/public/checkout` that
 * nothing ever called — the button was already a link. Removed rather than
 * left as a second, dormant billing path.)
 *
 * When no plan carries a trial (Stripe unconfigured, or plans not yet created),
 * the trial link degrades to the pricing section rather than offering a trial
 * that cannot start.
 */
export function HeroCtas({
  trialPlanId,
  scanHref,
  reassurance,
}: {
  trialPlanId: string | null;
  scanHref: string;
  /** Answers "what does this cost me" at the button, not further down. */
  reassurance?: string;
}) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-3">
      {/* THE SCAN IS THE OFFER ABOVE THE FOLD, AND IT IS THE ONLY ONE.
          Ascend's argument is that it starts with the diagnosis, so the first
          thing asked of a cold visitor has to BE the diagnosis. Leading with
          the trial inverted that: it asked for a card before the product had
          shown a visitor anything about their own business, and it put a
          paid decision in direct competition with the free proof of the
          claim the headline just made. One primary action, and it is the
          one the headline earns. */}
      <Button
        render={<a href={scanHref} />}
        size="lg"
        className="h-11 px-6 text-base"
        onClick={() => trackFunnelEvent("growth_scan_cta_clicked", { product: "ascend", source: "hero" })}
      >
        Run My Free Growth Scan
      </Button>

      {/* RISK REVERSAL, SIZED TO BE READ.
          At 14px and 80% opacity this was the quietest thing in the hero, and
          it answers the only question a cold visitor has at the button: what
          does this cost me. It now matches the button label's size at a
          heavier weight and full contrast, so it is scanned rather than
          skimmed past.

          Deliberately NOT larger than the button label. The reassurance
          removes the reason to hesitate; it is not the thing being asked for,
          and a risk-reversal line that outweighs its own call to action moves
          attention away from the click it exists to earn. */}
      {reassurance && (
        <p className="text-base font-semibold tracking-tight text-foreground">
          {reassurance}
        </p>
      )}

      {/* The trial stays reachable — a visitor who already knows they want it
          should never have to hunt, but as a quiet text link, not a second
          button competing for the same click. Its own terms travel with it so
          the card requirement is never something discovered later. */}
      {trialPlanId ? (
        <a
          href="/start"
          onClick={() => trackFunnelEvent("trial_cta_clicked", { product: "ascend", source: "hero" })}
          className="text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Or start your 14-day free trial
        </a>
      ) : (
        <a
          href="#pricing"
          className="text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Or see plans
        </a>
      )}
    </div>
  );
}
