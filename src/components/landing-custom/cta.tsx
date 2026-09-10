import { Button } from "@/components/ui/button";
import type { ResolvedBrand } from "@/config/landing";
import type { PlanProduct } from "@/types/billing";

export function CTA({
  brand,
  pricingHref = "/pricing",
  product = "flow",
  scanHref = "/growth-scanner",
}: {
  brand: ResolvedBrand;
  /** Ascend closes on the scan, not on pricing: the visitor has just been
   *  shown the mechanism, and the lowest-friction way to act on it is to see
   *  it run against their own site. Flow keeps its existing close. */
  product?: PlanProduct;
  scanHref?: string;
  /**
   * Where "Get started" goes. Defaults to the real /pricing page — the only
   * destination that's valid from every page this component is rendered on.
   * Pass "#pricing" only from a page that actually renders a
   * <Pricing id="pricing"/> section itself (the homepage, /pricing) for a
   * same-page scroll instead of a full navigation. Getting this wrong
   * produces a real bug: clicking the button appends "#pricing" to whatever
   * page you're on and silently does nothing.
   */
  pricingHref?: string;
}) {
  if (product === "unified") {
    return (
      <section className="relative overflow-hidden border-t py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.16_165)_/_14%,transparent_60%)]" />
        <div className="container mx-auto px-4 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tighter sm:text-5xl">
            See what&rsquo;s costing you leads.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            The scan is free and takes a few minutes. You&rsquo;ll know your biggest constraint
            before you decide anything.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button render={<a href={scanHref} />} size="lg" className="px-6 text-base">
              Run My Free Growth Scan
            </Button>
            <Button
              render={<a href={pricingHref} />}
              variant="outline"
              size="lg"
              className="px-6 text-base"
            >
              See plans
            </Button>
          </div>
          <p className="mx-auto mt-10 max-w-xl font-serif text-xl italic text-muted-foreground">
            Amplify your message. Turn more traffic into leads.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.16_165)_/_14%,transparent_60%)]" />

      <div className="container mx-auto px-4 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tighter sm:text-5xl">
          Give your mission{" "}
          <span className="font-serif font-normal italic">
            the systems to scale
          </span>
          .
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Pick a plan and get set up yourself, or tell us about your business
          and we&apos;ll walk you through it — either way, contacts imported,
          pipeline configured, ready to run in days, not months.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<a href={pricingHref} />}
            size="lg"
            className="px-6 text-base"
          >
            Get started
          </Button>
          <Button
            render={<a href={`mailto:${brand.supportEmail}`} />}
            variant="outline"
            size="lg"
            className="px-6 text-base"
          >
            Talk to us
          </Button>
        </div>
      </div>
    </section>
  );
}
