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
import type { PlanProduct, PublicPlanSummary } from "@/types/billing";

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

/**
 * Who each tier is for, keyed by the tier NAME so it works for both products
 * (Ascend and Flow ship the same Solo/Team/Agency ladder at different prices).
 * Positioning only — no counts, no outcomes, nothing a plan could fail to
 * deliver. Used only when the plan doc carries no description of its own.
 */
function audienceFor(planName: string): string | null {
  switch (planName.trim().toLowerCase()) {
    case "solo":
      return "Perfect for one person running the whole business.";
    case "team":
      return "Built for a small team working one shared pipeline.";
    case "agency":
      return "For agencies running growth across multiple clients.";
    default:
      return null;
  }
}


/**
 * FOUR BUCKETS, SO A FOURTEEN-ITEM LIST CAN BE SCANNED.
 *
 * The feature lists grew accurate and unreadable at the same time: a buyer
 * comparing tiers was reading fourteen unsorted lines per card and holding
 * three cards in their head. Grouping is PRESENTATION ONLY — it sorts the
 * exact strings the plan already produced and invents nothing. A label this
 * map does not recognise is not dropped; it falls through to the ungrouped
 * remainder below the buckets, so a new feature can never silently vanish
 * from a card.
 */
const FEATURE_GROUPS: { label: string; match: (s: string) => boolean }[] = [
  {
    label: "Growth",
    match: (t) =>
      /Growth Scans?|Growth Intelligence|Zeno|Asset Studio|marketing assets|Reporting & conversion/i.test(t),
  },
  {
    label: "Marketing",
    match: (t) =>
      /funnels|websites?|landing pages|broadcast emails|Email broadcasts|Forms|Social planner|Facebook & Instagram|custom domains|Funnel checkout|Website builder|sending domain|courses & community|visitors/i.test(t),
  },
  {
    label: "Sales & CRM",
    match: (t) => /CRM|pipelines?|Booking|follow-up|contacts|business workspaces?/i.test(t),
  },
  {
    label: "Automation",
    match: (t) => /Workflows|automations|SMS|WhatsApp|outbound calling|Missed-call|API access/i.test(t),
  },
];

/** Assigns each line to the FIRST bucket that claims it, so a line naming two
 *  domains lands in one place rather than appearing twice. */
function groupFeatures(items: string[]): { label: string; items: string[] }[] {
  const out = FEATURE_GROUPS.map((g) => ({ label: g.label, items: [] as string[] }));
  const rest: string[] = [];
  for (const item of items) {
    const i = FEATURE_GROUPS.findIndex((g) => g.match(item));
    if (i >= 0) out[i].items.push(item);
    else rest.push(item);
  }
  const groups = out.filter((g) => g.items.length > 0);
  if (rest.length) groups.push({ label: "Also included", items: rest });
  return groups;
}

export function Pricing({
  plans,
  configured,
  product = "flow",
}: {
  plans: PublicPlanSummary[];
  configured: boolean;
  /** Which surface this is. The last card differs by product — see below. */
  product?: PlanProduct;
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
            Pick a plan and you&apos;re in, no calls, no waiting on us.
          </p>
        </div>

        {!configured || plans.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Pricing is coming soon. Check back shortly.
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
              // DEFINED ONCE, RENDERED TWICE. These cards run long enough
              // that the button scrolls off before the feature list ends, so
              // it sits above the list and again below it. Building it here
              // rather than writing it out twice means the two copies cannot
              // drift into offering different things.
              const cta = plan.ctaHref ? (
                <Button
                  render={<a href={plan.ctaHref} />}
                  variant={highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {plan.trialDays
                    ? `Start ${plan.trialDays}-day free trial`
                    : "Get started"}
                </Button>
              ) : (
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
                  ) : plan.trialDays ? (
                    `Start ${plan.trialDays}-day free trial`
                  ) : (
                    "Get started"
                  )}
                </Button>
              );
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "flex flex-col transition-all duration-200",
                    highlighted
                      ? // overflow-visible is the fix for the clipped badge: Card's
                        // base class sets overflow-hidden, so the card was cropping
                        // its own "Most popular" pill at -top-3. tailwind-merge lets
                        // this override it without touching the shared primitive,
                        // and these cards contain no media that relied on clipping.
                        "relative overflow-visible border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/30 hover:shadow-2xl hover:shadow-primary/15"
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
                    {/* Who the tier is FOR, before what it costs. A price with no
                        audience makes the reader do the sorting themselves, which
                        is the work the page should be doing. The plan doc's own
                        description wins when the owner has written one; the
                        fallback is positioning by tier name, never a claim. */}
                    {(plan.description || audienceFor(plan.name)) && (
                      <CardDescription>
                        {plan.description || audienceFor(plan.name)}
                      </CardDescription>
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
                      // The trial and the price that begins after it are
                      // disclosed HERE, before checkout — a customer who only
                      // discovers the auto-conversion on the Stripe page is the
                      // kind of surprise that turns into a chargeback.
                      <p className="text-xs text-muted-foreground">
                        {plan.trialDays
                          ? `${plan.trialDays} days free, then ${price}/mo. Cancel anytime during the trial and you won't be charged.`
                          : "Billed monthly · cancel anytime"}
                      </p>
                    )}
                    <div className="mt-5">{cta}</div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-5">
                    <div className="space-y-4">
                      {groupFeatures(plan.highlights).map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </p>
                          <ul className="space-y-2">
                            {group.items.map((feature) => (
                              <li key={feature} className="flex items-start gap-2 text-sm">
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
                        </div>
                      ))}
                    </div>
                    {plan.alsoIncluded.length > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Also included:{" "}
                        </span>
                        {plan.alsoIncluded.join(" · ")}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter>{cta}</CardFooter>
                </Card>
              );
            })}
            {/* THE LAST CARD DIFFERS BY SURFACE.
                Ascend gets Done With You: a done-with-you engagement, styled
                apart from the ladder rather than as its final rung, because a
                dark card reads as a different kind of thing and stops a
                visitor comparing an annual figure against the monthly ones
                beside it. It takes an application, never a payment, a 1:1
                engagement a stranger could buy unseen would commit us to
                delivery nobody had scoped.

                Flow gets Enterprise back. Done With You promises Growth Scans
                and an Ascend engagement, and every Flow plan carries
                maxGrowthScansPerMonth: 0 with no Ascend gate, so on that
                surface it sold something the buyer cannot have. Flow's buyer
                is also a reseller who does the building for their own
                clients, which makes "we build it with you" a competitor's
                pitch rather than an upgrade. White-label is their real one. */}
            {product === "unified" ? (
            <Card className="flex flex-col justify-between border-transparent bg-slate-950 text-slate-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800">
              <CardHeader>
                <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-slate-50">
                  <Headset className="h-4 w-4" />
                </span>
                <CardTitle className="text-lg text-slate-50">Done With You</CardTitle>
                <CardDescription className="text-slate-300">
                  We build and optimize your growth system with you, from
                  strategy and marketing assets to funnels, automation and
                  ongoing optimization.
                </CardDescription>
                {/* A FLOOR, NOT A FLAT RATE.
                    $2,000 sets the minimum engagement and qualifies the call.
                    Publishing it as a flat price would cap what a complex
                    engagement can be scoped at; publishing nothing would stop
                    it filtering anyone. "Starting at" does both jobs. */}
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-sm text-slate-400">Starting at</span>
                  <span className="text-4xl font-bold tracking-tight text-slate-50">
                    $2,000
                  </span>
                  <span className="text-slate-400">/mo</span>
                </div>
                <p className="text-xs text-slate-400">
                  3-month minimum · ad spend separate, starting at $1,500/mo
                </p>
                <div className="mt-5">
                  <Button
                    type="button"
                    className="w-full bg-white text-slate-950 hover:bg-slate-200"
                    onClick={openCrispChat}
                  >
                    Book a Strategy Call
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {[
                    "Strategy",
                    "Marketing Assets",
                    "Funnels",
                    "Automation",
                    "Ongoing Optimization",
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-50">
                        <Check className="h-3 w-3" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {/* ACCOUNTABILITY STATED, NOT IMPLIED.
                    Traffic execution is delivered by a partner team. Saying
                    "we" about work someone else performs is only honest while
                    we own the strategy, the reporting and the result, so the
                    card says exactly that rather than leaving a buyer to
                    discover the arrangement after they have signed. */}
                <p className="mt-5 text-xs leading-relaxed text-slate-400">
                  Final scope and investment are confirmed before anything is
                  charged. Ad budget is paid straight to the platforms and is
                  not part of this fee. Traffic execution is delivered by our
                  partner team; the strategy, the reporting and the result stay
                  ours.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/25 bg-transparent text-slate-50 hover:bg-white/10 hover:text-slate-50"
                  onClick={openCrispChat}
                >
                  Book a Strategy Call
                </Button>
              </CardFooter>
            </Card>
            ) : (
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
                <div className="mt-5">
                  <Button type="button" variant="outline" className="w-full" onClick={openCrispChat}>
                    Contact sales
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {["Custom contact & usage limits", "White-label reseller setup", "Dedicated onboarding", "Priority support"].map(
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
                <Button type="button" variant="outline" className="w-full" onClick={openCrispChat}>
                  Contact sales
                </Button>
              </CardFooter>
            </Card>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
