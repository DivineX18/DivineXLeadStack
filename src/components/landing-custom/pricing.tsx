"use client";

import { useState } from "react";
import { Check, Headset, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { openCrispChat } from "@/lib/crisp";
import type { PublicPlanSummary } from "@/types/billing";

/**
 * Live, self-serve pricing — renders whatever plans the agency owner has
 * marked `publicSelfServeEnabled` in Agency → Client billing (real Stripe
 * prices, not hardcoded copy). "Get started" starts a real Stripe Checkout
 * session; on payment, the buyer's own workspace is provisioned
 * automatically (see `lib/server/public-signup-service.ts`).
 *
 * Shared between the homepage teaser section and the dedicated /pricing
 * page — same component, same data, so the numbers can never drift.
 */

export function Pricing({
  plans,
  configured,
}: {
  plans: PublicPlanSummary[];
  configured: boolean;
}) {
  const [startingPlanId, setStartingPlanId] = useState<string | null>(null);

  async function handleGetStarted(planId: string) {
    setStartingPlanId(planId);
    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start checkout.",
      );
      setStartingPlanId(null);
    }
  }

  return (
    <section id="pricing" className="border-t bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Pricing
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Simple pricing.{" "}
            <span className="font-serif font-normal italic">
              Real growth.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Pick a plan and you&apos;re in — no calls, no waiting on us.
          </p>
        </div>

        {!configured || plans.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Pricing is coming soon — check back shortly.
          </div>
        ) : (
          <div
            className={cn(
              "mx-auto mt-12 grid max-w-6xl gap-6",
              // Auto-fits any number of plans (unlimited tiers) instead of
              // branching on a fixed 1/2/3 count — a 4th, 5th, ... plan
              // just wraps to a new row instead of squeezing the grid.
              // A static "Enterprise — contact sales" card always joins
              // the live plans, so there are always at least 2 cards.
              "grid-cols-[repeat(auto-fit,minmax(260px,1fr))]",
            )}
          >
            {plans.map((plan, i) => {
              const highlighted = plans.length > 1 && i === 1;
              const isFree = plan.priceMonthlyCents === 0;
              const price = isFree
                ? "Free"
                : `$${(plan.priceMonthlyCents / 100).toFixed(
                    plan.priceMonthlyCents % 100 === 0 ? 0 : 2,
                  )}`;
              const starting = startingPlanId === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "flex flex-col transition-all duration-200",
                    highlighted
                      ? "relative border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/30 hover:shadow-2xl hover:shadow-primary/15"
                      : "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                  )}
                >
                  {highlighted && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3">
                      <Sparkles className="h-3 w-3" />
                      Most popular
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {plan.description && (
                      <CardDescription>{plan.description}</CardDescription>
                    )}
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight">
                        {price}
                      </span>
                      {!isFree && (
                        <span className="text-muted-foreground">/mo</span>
                      )}
                    </div>
                    {!isFree && (
                      <p className="text-xs text-muted-foreground">
                        Billed monthly · cancel anytime
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                              highlighted
                                ? "bg-primary text-primary-foreground"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="button"
                      variant={highlighted ? "default" : "outline"}
                      className="w-full"
                      disabled={starting}
                      onClick={() => handleGetStarted(plan.id)}
                    >
                      {starting ? (
                        <>
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          Starting checkout…
                        </>
                      ) : (
                        "Get started"
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
            <Card className="flex flex-col justify-between border-dashed transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <CardHeader>
                <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Headset className="h-4 w-4" />
                </span>
                <CardTitle className="text-lg">Enterprise</CardTitle>
                <CardDescription>
                  Higher volume, custom limits, or a white-label reseller setup.
                </CardDescription>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tracking-tight">
                    Let&apos;s talk
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {["Custom contact & usage limits", "Dedicated onboarding", "Priority support"].map(
                    (feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="h-3 w-3" />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ),
                  )}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={openCrispChat}
                >
                  Contact sales
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
