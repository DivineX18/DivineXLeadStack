"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Plus, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Affiliate } from "@/types/affiliate";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AffiliatesListPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [commissionPct, setCommissionPct] = useState("25");
  const [creating, setCreating] = useState(false);
  const isAgencyOwner = agencyRole === "owner";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/agency/affiliates");
      if (!res.ok) throw new Error(await res.text());
      const { data } = await res.json();
      setAffiliates(data);
    } catch (err) {
      console.error("[agency/affiliates] load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAgencyOwner) load();
    else setLoading(false);
  }, [isAgencyOwner]);

  async function handleCreate() {
    if (!email.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agency/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: displayName || undefined,
          commissionPct: Number(commissionPct) || 25,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Affiliate created");
      setCreateOpen(false);
      setEmail("");
      setDisplayName("");
      setCommissionPct("25");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create affiliate");
    } finally {
      setCreating(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!isAgencyOwner) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-muted-foreground">Only the agency owner can manage affiliates.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Affiliates</h1>
          <p className="text-sm text-muted-foreground">
            Manually managed — 25% recurring commission by default, per-affiliate configurable. Log a referred
            sale from the affiliate&rsquo;s detail page, then mark it paid once you&rsquo;ve sent the money.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          New affiliate
        </Button>
      </div>

      {affiliates.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No affiliates yet. Create one to get started.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Affiliate</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Rate</th>
                <th className="px-4 py-3 font-medium">Referrals</th>
                <th className="px-4 py-3 font-medium">Pending</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {affiliates.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.displayName || a.email}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.code}</td>
                  <td className="px-4 py-3">{a.commissionPct}%</td>
                  <td className="px-4 py-3">{a.referralCount}</td>
                  <td className="px-4 py-3">{formatCents(a.pendingCommissionCents)}</td>
                  <td className="px-4 py-3">{formatCents(a.paidCommissionCents)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "active"
                          ? "bg-primary/10 text-primary"
                          : a.status === "paused"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/agency/affiliates/${a.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Manage <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New affiliate</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="aff-email">Email</Label>
              <Input id="aff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="affiliate@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aff-name">Display name (optional)</Label>
              <Input id="aff-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aff-rate">Commission rate (%)</Label>
              <Input id="aff-rate" type="number" min={0} max={100} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={creating || !email.trim()}>
              {creating ? "Creating…" : "Create affiliate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
