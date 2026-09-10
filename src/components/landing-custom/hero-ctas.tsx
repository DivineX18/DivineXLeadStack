"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The hero's two acquisition paths.
 *
 * The trial button starts the SAME certified checkout the pricing section
 * uses (`/api/public/checkout` with a plan id) rather than a second billing
 * path — one endpoint, one set of billing semantics, nothing new on Stripe's
 * side. It is a client component only because starting checkout is a fetch;
 * the hero around it stays a server component.
 *
 * When no plan carries a trial (Stripe unconfigured, or plans not yet
 * created), the trial button degrades to the pricing section rather than
 * offering a trial that cannot start.
 */
export function HeroCtas({
  trialPlanId,
  scanHref,
}: {
  trialPlanId: string | null;
  scanHref: string;
}) {
  const [starting, setStarting] = useState(false);

  async function startTrial() {
    if (!trialPlanId) return;
    setStarting(true);
    try {
      const res = await fetch("/api/public/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: trialPlanId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start your trial.");
      }
      window.location.href = data.url;
    } catch (err) {
      setStarting(false);
      toast.error(err instanceof Error ? err.message : "Could not start your trial.");
    }
  }

  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
      {trialPlanId ? (
        <Button size="lg" className="px-6 text-base" onClick={startTrial} disabled={starting}>
          {starting ? "Starting…" : "Start My 14-Day Free Trial"}
        </Button>
      ) : (
        <Button render={<a href="#pricing" />} size="lg" className="px-6 text-base">
          See plans
        </Button>
      )}
      <Button
        render={<a href={scanHref} />}
        variant="outline"
        size="lg"
        className="px-6 text-base"
      >
        Run a Free Growth Scan
      </Button>
    </div>
  );
}
