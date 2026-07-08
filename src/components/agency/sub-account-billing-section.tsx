"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, CreditCard, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BillingStatusBadge } from "@/components/agency/billing-status-badge";
import { effectiveBillingState, formatBillingPrice } from "@/lib/billing/status";
import type { SubAccountDoc } from "@/types";
import type { BillingPlanResponse } from "@/types/billing";

/**
 * Billing controls inside the agency Manage dialog (Client Billing v1).
 * Assign/switch a plan (with optional per-client special price), send or
 * copy the checkout link, or mark the client comped. Owner-only by
 * placement — the dialog itself only renders for the agency owner.
 */

interface Props {
  subAccount: SubAccountDoc;
  disabled?: boolean;
}

export function SubAccountBillingSection({ subAccount, disabled }: Props) {
  const billing = subAccount.billing ?? null;
  const state = effectiveBillingState(billing);

  const [plans, setPlans] = useState<BillingPlanResponse[] | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [planId, setPlanId] = useState("");
  const [specialPrice, setSpecialPrice] = useState("");
  const [emailTo, setEmailTo] = useState(
    subAccount.accountContact?.email ?? "",
  );
  const [busy, setBusy] = useState<null | "assign" | "link" | "email" | "comp">(
    null,
  );
  const [lastLink, setLastLink] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agency/plans")
      .then((r) => r.json())
      .then(
        (d: { plans?: BillingPlanResponse[]; stripeConfigured?: boolean }) => {
          if (cancelled) return;
          setPlans(d.plans ?? []);
          setStripeConfigured(d.stripeConfigured !== false);
        },
      )
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPlanId(billing?.planId ?? "");
    setSpecialPrice(
      billing?.specialPriceCents != null
        ? (billing.specialPriceCents / 100).toFixed(2).replace(/\.00$/, "")
        : "",
    );
    setLastLink(null);
    // Reset when the dialog re-targets another sub-account.
  }, [subAccount.id, billing?.planId, billing?.specialPriceCents]);

  const activePlans = useMemo(
    () => (plans ?? []).filter((p) => p.status === "active"),
    [plans],
  );

  const specialPriceCents = useMemo(() => {
    const trimmed = specialPrice.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }, [specialPrice]);

  const hasLiveSubscription = state === "active" || state === "grace";
  const anyBusy = busy !== null || disabled;

  async function patchBilling(body: Record<string, unknown>) {
    const res = await fetch(
      `/api/agency/sub-accounts/${subAccount.id}/billing`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      checkoutUrl?: string | null;
      emailed?: boolean;
      status?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Billing update failed.");
    return data;
  }

  async function handleAssign() {
    if (!planId) return;
    setBusy("assign");
    try {
      const data = await patchBilling({
        action: "assign",
        planId,
        specialPriceCents,
        ...(emailTo.trim() ? { emailTo: emailTo.trim() } : {}),
      });
      if (data.status === "pending" && data.checkoutUrl) {
        setLastLink(data.checkoutUrl);
        toast.success(
          data.emailed
            ? "Plan assigned — checkout link emailed to the client."
            : "Plan assigned — copy the checkout link below or email it.",
        );
      } else {
        toast.success(
          "Plan switched — the live subscription and features were updated.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign.");
    } finally {
      setBusy(null);
    }
  }

  async function handleLink(sendEmail: boolean) {
    setBusy(sendEmail ? "email" : "link");
    try {
      const data = await patchBilling({
        action: "sendLink",
        ...(sendEmail && emailTo.trim() ? { emailTo: emailTo.trim() } : {}),
      });
      if (data.checkoutUrl) {
        setLastLink(data.checkoutUrl);
        if (!sendEmail) {
          await navigator.clipboard
            .writeText(data.checkoutUrl)
            .catch(() => undefined);
          toast.success(
            "Fresh checkout link copied. Older links no longer work.",
          );
        } else {
          toast.success(
            data.emailed
              ? "Checkout link emailed to the client."
              : "Link minted, but email isn't configured — copy it instead.",
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mint a link.");
    } finally {
      setBusy(null);
    }
  }

  async function handleComp() {
    if (
      !window.confirm(
        hasLiveSubscription
          ? "Mark this client comped? Their Stripe subscription is canceled immediately and no further charges occur."
          : "Mark this client comped? They won't be billed through the platform.",
      )
    ) {
      return;
    }
    setBusy("comp");
    try {
      await patchBilling({ action: "comp" });
      setLastLink(null);
      toast.success("Marked comped — billing stopped, features stay manual.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to comp.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          Billing
          {/* Same Beta pill as the beta feature gates below. */}
          <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
            Beta
          </span>
          <BillingStatusBadge billing={billing} />
        </div>
        {billing && billing.status !== "comped" && (
          <span className="text-xs text-muted-foreground">
            {billing.planName ?? "—"} ·{" "}
            {formatBillingPrice(billing.priceCents, billing.currency)}/mo
          </span>
        )}
      </div>

      <div className="space-y-3 p-3">
        {!stripeConfigured ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Stripe isn&apos;t configured on this deployment — set{" "}
            <code>STRIPE_SECRET_KEY</code> to bill clients.
          </p>
        ) : plans === null ? (
          <p className="text-xs text-muted-foreground">Loading plans…</p>
        ) : activePlans.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No plans yet — create one under{" "}
            <span className="font-medium text-foreground">
              Agency → Client billing
            </span>{" "}
            first.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                disabled={anyBusy}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [&_option]:bg-background [&_option]:text-foreground"
              >
                <option value="">Choose a plan…</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBillingPrice(p.priceMonthlyCents, p.currency)}
                    /mo
                  </option>
                ))}
              </select>
              <Input
                value={specialPrice}
                onChange={(e) => setSpecialPrice(e.target.value)}
                placeholder="Special price"
                inputMode="decimal"
                disabled={anyBusy}
                title="Optional per-client monthly price override (in the plan's currency)"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={handleAssign}
                disabled={anyBusy || !planId}
              >
                {busy === "assign" ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Assigning…
                  </>
                ) : hasLiveSubscription && billing?.planId !== planId ? (
                  "Switch plan"
                ) : (
                  "Assign plan"
                )}
              </Button>
              {billing && billing.status !== "comped" && !hasLiveSubscription && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => handleLink(false)}
                    disabled={anyBusy}
                  >
                    {busy === "link" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5" />
                    )}
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => handleLink(true)}
                    disabled={anyBusy || !emailTo.trim()}
                  >
                    {busy === "email" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="mr-1 h-3.5 w-3.5" />
                    )}
                    Email link
                  </Button>
                </>
              )}
              {billing && billing.status !== "comped" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={handleComp}
                  disabled={anyBusy}
                >
                  {busy === "comp" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Mark comped
                </Button>
              )}
            </div>

            {(state === "pending" || state === "lapsed" || !billing || billing.status === "comped") && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Client email for the checkout link (optional)
                </label>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="client@business.com"
                  type="email"
                  disabled={anyBusy}
                  className="h-8 text-sm"
                />
              </div>
            )}

            {lastLink && (
              <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2">
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                  Checkout link (latest — older links are now invalid)
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-xs">{lastLink}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(lastLink)
                        .then(() => toast.success("Copied."))
                        .catch(() => toast.error("Couldn't copy — select it manually."));
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {hasLiveSubscription
                ? "This client has a live subscription — switching plans updates the charge (prorated) and re-applies the plan's features immediately. Card changes happen via “Manage billing” inside their workspace settings."
                : state === "pending"
                  ? "Awaiting payment: the workspace shows an activation screen to the client until checkout completes. The plan's features switch on automatically at payment."
                  : state === "lapsed"
                    ? "Payment lapsed: the workspace is behind a paywall. A fresh checkout link (or the in-app Pay button) reactivates it."
                    : "Assigning a plan puts this workspace behind an activation screen until the client pays. Use “Mark comped” for internal or off-platform-billed clients."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
