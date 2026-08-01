"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Lock, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomDomainDoc } from "@/types/custom-domains";

function StatusBadge({ status }: { status: CustomDomainDoc["status"] }) {
  const styles =
    status === "verified"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  const label =
    status === "verified" ? "Live" : status === "failed" ? "Failed" : "Pending DNS";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

export function FunnelDomainsSection({
  saId,
  funnelId,
}: {
  saId: string;
  funnelId: string;
}) {
  const [gate, setGate] = useState<boolean | null>(null);
  const [domains, setDomains] = useState<CustomDomainDoc[] | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyDomain, setBusyDomain] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", saId),
      (snap) => setGate(snap.data()?.customDomainsEnabledByAgency === true),
      () => setGate(null),
    );
  }, [saId]);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}/domains`);
    const d = (await res.json().catch(() => ({}))) as { domains?: CustomDomainDoc[] };
    setDomains(d.domains ?? []);
  }
  useEffect(() => {
    if (gate) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, saId, funnelId]);

  async function addDomain() {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${saId}/funnels/${funnelId}/domains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: newDomain.trim() }),
        },
      );
      const d = (await res.json().catch(() => ({}))) as {
        domain?: CustomDomainDoc;
        error?: string;
      };
      if (!res.ok || !d.domain) throw new Error(d.error ?? "Couldn't add domain");
      setNewDomain("");
      toast.success("Domain added — add the DNS record below to verify it.");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add domain");
    } finally {
      setAdding(false);
    }
  }

  async function recheck(domain: string) {
    setBusyDomain(domain);
    try {
      await fetch(
        `/api/sub-accounts/${saId}/funnels/${funnelId}/domains/${encodeURIComponent(domain)}`,
        { method: "POST" },
      );
      void load();
    } finally {
      setBusyDomain(null);
    }
  }

  async function remove(domain: string) {
    setBusyDomain(domain);
    try {
      const res = await fetch(
        `/api/sub-accounts/${saId}/funnels/${funnelId}/domains/${encodeURIComponent(domain)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      void load();
    } catch {
      toast.error("Couldn't remove domain");
    } finally {
      setBusyDomain(null);
    }
  }

  if (gate === null) return null;

  if (!gate) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-center">
        <Lock className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Custom domains are locked by your agency.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Globe className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        Custom domain
      </div>
      <p className="text-xs text-muted-foreground">
        Point your own domain at this funnel instead of the platform URL.
      </p>

      {domains === null ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        domains.map((d) => (
          <div key={d.domain} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{d.domain}</span>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={d.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Recheck ${d.domain}`}
                  disabled={busyDomain === d.domain}
                  onClick={() => recheck(d.domain)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Remove ${d.domain}`}
                  disabled={busyDomain === d.domain}
                  onClick={() => remove(d.domain)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {d.status !== "verified" && d.verificationRecords.length > 0 && (
              <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                <p className="text-muted-foreground">Add this DNS record:</p>
                {d.verificationRecords.map((r, i) => (
                  <p key={i} className="font-mono">
                    {r.type} {r.name} -{">"} {r.value}
                  </p>
                ))}
              </div>
            )}
            {d.status !== "verified" && d.verificationRecords.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Point a CNAME record at <code>cname.vercel-dns.com</code>, then
                click recheck.
              </p>
            )}
          </div>
        ))
      )}

      <div className="flex gap-2">
        <Input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="leads.yourbrand.com"
          className="h-9"
        />
        <Button size="sm" disabled={adding} onClick={addDomain}>
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
