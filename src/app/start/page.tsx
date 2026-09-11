import { notFound } from "next/navigation";
import { getPublicPlans } from "@/lib/server/public-signup-service";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { brandForProduct, resolveProductSurface } from "@/lib/landing/resolve-product-surface";
import { TrialSignupForm } from "@/components/landing-custom/trial-signup-form";
import { FunnelPageView } from "@/components/analytics/funnel-page-view";

export const metadata = {
  title: "Start your 14-day free trial",
  robots: { index: false, follow: true },
};

/**
 * Step 1 of the trial. Collects who they are, then hands off to the certified
 * Stripe Checkout, which takes the card and remains the only thing that can
 * create a customer.
 *
 * Noindex on purpose: this is a step inside a funnel, not a page anyone should
 * arrive at from search without the context the homepage gives them.
 */
export default async function StartTrialPage() {
  // Plans are product-scoped, so the surface must be resolved BEFORE fetching
  // them. Without this the Ascend host could offer a Flow plan's trial and
  // send the customer to the wrong subscription entirely.
  const product = await resolveProductSurface();
  const { plans } = await getPublicPlans(product);
  const trialPlan = plans.find((p) => (p.trialDays ?? 0) > 0) ?? null;

  // No plan carries a trial (Stripe unconfigured, or plans not created). Rather
  // than render a form that cannot finish, this page simply does not exist.
  if (!trialPlan) notFound();

  const brand = brandForProduct(await resolveCustomBrand(), product);
  const price = (trialPlan.priceMonthlyCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: trialPlan.currency.toUpperCase(),
    maximumFractionDigits: 0,
  });

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p className="text-center text-sm font-medium text-muted-foreground">{brand.name}</p>

        <h1 className="mt-3 text-balance text-center text-3xl font-semibold tracking-tight">
          Start your {trialPlan.trialDays}-day free trial
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          {trialPlan.name} · {price}/month after your trial
        </p>

        <FunnelPageView
          event="start_page_viewed"
          product={product === "unified" ? "ascend" : "flow"}
          plan={trialPlan.id}
        />
        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
          <TrialSignupForm planId={trialPlan.id} />
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {trialPlan.trialDays} days free. Card required to activate your trial. Cancel anytime.
        </p>

        <p className="mt-2 text-center text-xs text-muted-foreground/70">
          Step 1 of 2. No card on this step.
        </p>
      </div>
    </main>
  );
}
