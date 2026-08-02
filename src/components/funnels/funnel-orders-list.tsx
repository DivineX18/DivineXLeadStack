"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import type { FunnelOrderDoc } from "@/types/funnel-orders";

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const STATUS_STYLES: Record<FunnelOrderDoc["status"], string> = {
  paid: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
  refunded: "bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300",
  partially_refunded:
    "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300",
  disputed: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300",
};

export function FunnelOrdersList({ saId }: { saId: string }) {
  const { subAccount } = useSubAccount();
  const [orders, setOrders] = useState<FunnelOrderDoc[] | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${saId}/funnels/orders`);
    const d = (await res.json().catch(() => ({}))) as { orders?: FunnelOrderDoc[] };
    setOrders(d.orders ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId]);

  async function refund(orderId: string) {
    if (!confirm("Refund the remaining balance on this order?")) return;
    setRefundingId(orderId);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Refund failed");
      toast.success("Refund issued.");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setRefundingId(null);
    }
  }

  const dashboardBase =
    subAccount?.stripeConfig?.mode === "test"
      ? "https://dashboard.stripe.com/test"
      : "https://dashboard.stripe.com";

  if (orders === null) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <ReceiptText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No funnel orders yet. They&apos;ll show up here once a customer
          completes checkout on a funnel page.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((o) => {
        const total = o.mainOrderAmountCents + o.bumpAmountCents;
        const canRefund = o.status === "paid" || o.status === "partially_refunded";
        return (
          <li key={o.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">
                    {o.customerEmail ?? "Unknown buyer"}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[o.status]}`}
                  >
                    {o.status.replace("_", " ")}
                  </span>
                  {o.bumpIncluded && (
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      Bump
                    </span>
                  )}
                  {o.status === "disputed" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCents(total, o.currency)} · {formatRelativeTime(o.createdAt)}
                  {o.refundedAmountCents > 0 &&
                    ` · ${formatCents(o.refundedAmountCents, o.currency)} refunded`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {o.contactId && (
                  <Link
                    href={`/sa/${saId}/contacts/${o.contactId}`}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    View contact
                  </Link>
                )}
                {o.stripePaymentIntentId && (
                  <a
                    href={`${dashboardBase}/payments/${o.stripePaymentIntentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    View in Stripe
                  </a>
                )}
                {canRefund && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={refundingId === o.id}
                    onClick={() => refund(o.id)}
                  >
                    {refundingId === o.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Refund"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
