"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Affiliate, Referral } from "@/types/affiliate";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AffiliateDetailPage() {
  const params = useParams<{ id: string }>();
  const { agencyRole, loading: authLoading } = useAuth();
  const isAgencyOwner = agencyRole === "owner";

  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  const [commissionPct, setCommissionPct] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [buyerEmail, setBuyerEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [logging, setLogging] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agency/affiliates/${params.id}`);
      if (!res.ok) throw new Error(await res.text());
      const { data } = await res.json();
      setAffiliate(data.affiliate);
      setReferrals(data.referrals);
      setCommissionPct(String(data.affiliate.commissionPct));
      setPayoutEmail(data.affiliate.payoutEmail ?? "");
    } catch (err) {
      console.error("[affiliate detail] load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAgencyOwner && params.id) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgencyOwner, params.id]);

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/agency/affiliates/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionPct: Number(commissionPct) || 0,
          payoutEmail: payoutEmail || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: "active" | "paused" | "banned") {
    try {
      const res = await fetch(`/api/agency/affiliates/${params.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Status set to ${status}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update status");
    }
  }

  async function handleLogReferral() {
    if (!buyerEmail.trim() || !amount) return;
    setLogging(true);
    try {
      const res = await fetch(`/api/agency/affiliates/${params.id}/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail,
          amountPaidCents: Math.round(Number(amount) * 100),
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to log referral");
      }
      toast.success("Referral logged");
      setBuyerEmail("");
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't log referral");
    } finally {
      setLogging(false);
    }
  }

  async function handleMarkPaid(referralId: string) {
    const paidNote = window.prompt("Payout reference (e.g. \"PayPal txn ABC123\")") ?? "";
    try {
      const res = await fetch("/api/agency/affiliates/payouts/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, note: paidNote }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to mark paid");
      }
      toast.success("Marked paid");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark paid");
    }
  }

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!isAgencyOwner) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Only the agency owner can manage affiliates.</p>
      </div>
    );
  }

  if (!affiliate) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Affiliate not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/agency/affiliates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Affiliates
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{affiliate.displayName || affiliate.email}</h1>
          <p className="text-sm text-muted-foreground">
            {affiliate.email} · code <span className="font-mono">{affiliate.code}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {(["active", "paused", "banned"] as const).map((s) => (
            <Button key={s} size="sm" variant={affiliate.status === s ? "default" : "outline"} onClick={() => handleStatusChange(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Referrals</p>
          <p className="text-xl font-bold">{affiliate.referralCount}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-xl font-bold">{formatCents(affiliate.pendingCommissionCents)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Paid out</p>
          <p className="text-xl font-bold">{formatCents(affiliate.paidCommissionCents)}</p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rate">Commission rate (%)</Label>
            <Input id="rate" type="number" min={0} max={100} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payout">Payout email (PayPal)</Label>
            <Input id="payout" type="email" value={payoutEmail} onChange={(e) => setPayoutEmail(e.target.value)} placeholder="Set by the affiliate, or enter it here" />
          </div>
        </div>
        <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </section>

      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Log a referred sale</h2>
        <p className="text-xs text-muted-foreground">
          Commission is calculated automatically from this affiliate&rsquo;s rate ({affiliate.commissionPct}%).
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="buyer">Buyer email</Label>
            <Input id="buyer" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount paid ($)</Label>
            <Input id="amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. subscription #1234" />
          </div>
        </div>
        <Button size="sm" onClick={handleLogReferral} disabled={logging || !buyerEmail.trim() || !amount}>
          {logging ? "Logging…" : "Log referral"}
        </Button>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">Referral history</h2>
        </div>
        {referrals.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No referrals logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Commission</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.buyerEmail}</td>
                  <td className="px-4 py-3">{formatCents(r.amountPaidCents)}</td>
                  <td className="px-4 py-3">{formatCents(r.commissionCents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "paid"
                          ? "bg-primary/10 text-primary"
                          : r.status === "voided"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkPaid(r.id)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
