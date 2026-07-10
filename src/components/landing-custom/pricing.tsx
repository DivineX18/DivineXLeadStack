"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
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
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Pricing
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Simple pricing.{" "}
            <span className="font-serif font-normal italic">
              Cancel anytime.
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
              "mx-auto mt-12 grid max-w-5xl gap-6",
              plans.length === 1
                ? "max-w-sm"
                : plans.length === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-3",
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
                    "flex flex-col",
                    highlighted &&
                      "relative border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/30",
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
          </div>
        )}
      </div>
    </section>
  );
}
