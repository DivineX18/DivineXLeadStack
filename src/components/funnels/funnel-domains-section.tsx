"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { describeError } from "@/lib/errors/describe";
import { Check, Copy, Globe, Lock, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomDomainDoc } from "@/types/custom-domains";

/**
 * Three states a customer can act on, not four engineering ones.
 * "Waiting for DNS" means the ball is in their court; "Verifying" means it is
 * in ours and they should wait; "Live" means done. `misconfigured` is what
 * separates the first two — the poll sets it when a check ran and the record
 * was not right yet.
 */
function StatusBadge({ domain }: { domain: CustomDomainDoc }) {
  const state =
    domain.status === "verified"
      ? { label: "Live", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
      : domain.status === "failed"
        ? { label: "Needs attention", cls: "bg-destructive/10 text-destructive" }
        : domain.misconfigured
          ? { label: "Waiting for DNS", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
          : { label: "Verifying", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.cls}`}>
      {state.label}
    </span>
  );
}

/** Copy control. The values are ones we already know — nobody should be
 *  retyping a hostname into a registrar form from monospace text. */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
              () => toast.error("Couldn't copy — select the text instead."),
            );
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}


/**
 * Turns "Failed" into an instruction. Runs a real DNS lookup server-side and
 * reports only what the lookup proved — see lib/domains/diagnose.ts. Manual,
 * not automatic, so opening the page never fans out lookups for every domain.
 */
function DomainDiagnosis({ saId, funnelId, domain }: { saId: string; funnelId: string; domain: string }) {
  const [state, setState] = useState<{ advice: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 border-t pt-2.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch(
              `/api/sub-accounts/${saId}/funnels/${funnelId}/domains/${encodeURIComponent(domain)}/diagnose`,
            );
            const j = (await res.json().catch(() => ({}))) as {
              advice?: string; diagnosis?: { detail?: string }; error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Couldn't check DNS.");
            setState({ advice: j.advice ?? "", detail: j.diagnosis?.detail ?? "" });
          } catch (err) {
            toast.error(describeError(err, "Couldn't check your DNS just now."));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
        Check my DNS
      </Button>
      {state && (
        <div className="mt-2 text-xs">
          <p className="font-medium">{state.advice}</p>
          <p className="mt-0.5 text-muted-foreground">{state.detail}</p>
        </div>
      )}
    </div>
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
    } catch (err) { toast.error(describeError(err, "Couldn't remove domain"), { duration: 12_000 });
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
                <StatusBadge domain={d} />
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
            {d.status === "verified" && (
              <div className="mt-2 space-y-1 rounded-md bg-emerald-500/5 p-2.5 text-xs">
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Domain connected
                </p>
                {/* Render issues and renews the certificate; the customer does
                    nothing. Saying so removes the most common "is it safe
                    yet?" support question. */}
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Secure HTTPS active, renewed automatically
                </p>
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Page live at {d.domain}
                </p>
              </div>
            )}

            {d.status !== "verified" && d.verificationRecords.length > 0 && (
              <div className="mt-2 rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium">Add this record where your domain is managed</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  That is the company you bought the domain from, or whoever runs its DNS.
                  Look for a DNS, Records or Advanced DNS screen, add a new record, and
                  copy these three values across. Nothing else needs changing.
                </p>
                {d.verificationRecords.map((r, i) => (
                  <div key={i} className="mt-3 grid gap-3 sm:grid-cols-3">
                    <CopyField label="Type" value={r.type} hint="Choose this record type" />
                    <CopyField label="Name / Host" value={r.name} hint="Some providers want only the part before your domain" />
                    <CopyField label="Value / Target" value={r.value} hint="Points your name at your page" />
                  </div>
                ))}
                <DomainDiagnosis saId={saId} funnelId={funnelId} domain={d.domain} />
              </div>
            )}
            {/* WAS OPERATOR-DEBUGGING INSTRUCTIONS SHOWN TO A CUSTOMER.
                It told them to open a hosting dashboard they have no account
                for and read a hostname they cannot see. This path only
                happens when we failed to compute the target, which is ours to
                fix, not theirs. */}
            {d.status !== "verified" && d.verificationRecords.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                We couldn&apos;t generate the DNS details for this domain just
                yet. Try the recheck button above in a minute. If it keeps
                happening, contact support and we&apos;ll sort it out.
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
