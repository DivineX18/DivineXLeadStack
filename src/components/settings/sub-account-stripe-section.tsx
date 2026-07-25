"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

/**
 * Sub-account Stripe settings panel — an alternative to PayPal for the
 * Products + Invoices payment flow. No OAuth, no Stripe Connect: card
 * payments run against the AGENCY'S OWN Stripe account (the same one
 * already configured for CRM billing), so there's nothing to "connect"
 * here, just an on/off switch. Auto-marks invoices paid via webhook —
 * unlike PayPal.me, which has no payment-status callback and stays
 * manual mark-paid.
 */

export function SubAccountStripeSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const enabled = subAccount?.stripeInvoicesEnabled === true;
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/stripe-invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to update.");
      }
      toast.success(
        next
          ? "Stripe card payments enabled for invoices."
          : "Stripe card payments disabled — PayPal still works if connected.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Payments — Stripe</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Let invoice recipients pay by card. Charges go to this
            deployment&apos;s own Stripe account — no separate signup, no
            keys to paste. Invoices auto-flip to paid the moment payment
            clears.
          </p>
        </div>
      </header>

      {enabled ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Enabled — invoices show a &ldquo;Pay with card&rdquo; button.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleToggle(false)}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Disable"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => handleToggle(true)}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Enable Stripe payments"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
