"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2, Lock } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * BYO-Stripe settings panel for Funnel Checkout — the sub-account pastes
 * its OWN Stripe secret key (not the agency's) so real checkout, order
 * bump, and one-click upsell/downsell can run on funnel pages with the
 * sub-account as merchant of record. Distinct from SubAccountStripeSection
 * (Payments — Stripe, invoices, agency's own Stripe — do not confuse).
 *
 * Pasting a key while one is already connected replaces it in place — that
 * IS the rotate/reconnect path, no separate "rotate" UI.
 */
export function SubAccountStripeCheckoutSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  if (!isAdmin) return null;

  const gateOn = subAccount?.funnelCheckoutEnabledByAgency === true;
  const stripeConfig = subAccount?.stripeConfig ?? null;

  async function connect() {
    const secretKey = key.trim();
    if (!secretKey) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/stripe-checkout/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretKey }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to connect.");
      toast.success("Stripe connected — real checkout is now live on this workspace's funnels.");
      setKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/stripe-checkout/connect`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to disconnect.");
      toast.success("Stripe disconnected. Existing orders are preserved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!gateOn) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <header className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Funnel checkout (Stripe)</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Locked by your agency. Ask your agency owner to enable Funnel
              checkout for this workspace.
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Funnel checkout — Stripe</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your OWN Stripe account to sell products directly on
            funnel pages — real checkout, order bump, one-click upsell. You
            are the merchant of record; payments go straight to your Stripe
            account, never through this platform.
          </p>
        </div>
      </header>

      {stripeConfig ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected — {stripeConfig.mode === "live" ? "Live" : "Test"} mode,
            key ending in •••• {stripeConfig.secretKeyLast4}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="password"
              placeholder="Paste a new key to reconnect/rotate"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-9"
            />
            <Button size="sm" disabled={saving || !key.trim()} onClick={connect}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reconnect"}
            </Button>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={disconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder="sk_live_... or sk_test_..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-9"
          />
          <Button size="sm" disabled={saving || !key.trim()} onClick={connect}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Connect
          </Button>
        </div>
      )}
    </section>
  );
}
