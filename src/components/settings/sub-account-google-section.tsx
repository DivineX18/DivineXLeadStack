"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { BarChart3, Check, ExternalLink, Loader2, Link2Off, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { googleCan } from "@/lib/google/capabilities";
import type { GoogleConfig } from "@/types/tenancy";

/**
 * Google Analytics / Search Console connection for a workspace.
 *
 * Self-gating like the Meta card: renders nothing for a non-admin, since the
 * routes behind every control here are admin-only and showing a panel whose
 * every button 403s is worse than showing none.
 *
 * Ads is absent on purpose. The connect route drops it when no developer
 * token is configured, so offering a checkbox for it would ask a client to
 * grant write-capable access this deployment cannot use.
 */

interface PropertyOption {
  value: string;
  label: string;
  sub?: string;
}

export function SubAccountGoogleSection() {
  const { subAccount, isAdmin } = useSubAccount();
  const subAccountId = subAccount?.id ?? null;

  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [wantGa4, setWantGa4] = useState(true);
  const [wantGsc, setWantGsc] = useState(true);
  const [ga4Options, setGa4Options] = useState<PropertyOption[] | null>(null);
  const [gscOptions, setGscOptions] = useState<PropertyOption[] | null>(null);

  // Live, so the card updates the moment the OAuth callback writes the
  // connection — the admin returns from Google to a card that already
  // reflects what they just granted.
  useEffect(() => {
    if (!subAccountId) return;
    const db = getFirebaseDb();
    return onSnapshot(
      doc(db, "subAccounts", subAccountId),
      (s) => {
        setConfig(((s.data() ?? {}) as { googleConfig?: GoogleConfig }).googleConfig ?? null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [subAccountId]);

  // Surface the ?google=… status the callback redirects back with.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const status = p.get("google");
    if (!status) return;
    const MESSAGES: Record<string, string> = {
      connected: "Google connected.",
      cancelled: "Connection cancelled.",
      not_configured: "Google isn't configured on this deployment yet.",
      secrets_not_configured: "Encryption isn't configured on this deployment yet.",
      no_business_profile: "Link this workspace to a business profile before connecting Google.",
      no_refresh_token: "Google didn't return a refresh token. Try connecting again.",
      exchange_failed: "Google rejected the sign-in. Try again.",
      bad_state: "That connection link expired. Try again.",
    };
    if (status.startsWith("partial:")) {
      const missing = status.slice("partial:".length).split("-").join(", ");
      toast.warning(`Connected, but these weren't granted: ${missing}`);
    } else {
      const msg = MESSAGES[status] ?? "Couldn't connect Google.";
      if (status === "connected") toast.success(msg);
      else toast.error(msg);
    }
    p.delete("google");
    window.history.replaceState({}, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}`);
  }, []);

  // Load the pickers once connected, so the admin chooses a property by name
  // rather than pasting an id.
  useEffect(() => {
    if (!subAccountId || !config?.connected) return;
    void (async () => {
      try {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/google/properties`);
        if (!res.ok) return;
        const d = (await res.json()) as {
          ga4?: { propertyId: string; displayName: string; account: string }[];
          sites?: { siteUrl: string; permissionLevel: string }[];
        };
        setGa4Options((d.ga4 ?? []).map((p) => ({ value: p.propertyId, label: p.displayName, sub: p.account })));
        setGscOptions((d.sites ?? []).map((s) => ({ value: s.siteUrl, label: s.siteUrl })));
      } catch {
        // The card still works without pickers; the selects just stay empty.
      }
    })();
  }, [subAccountId, config?.connected]);

  if (!isAdmin || !subAccountId) return null;

  const connect = () => {
    const services = [wantGa4 ? "ga4" : null, wantGsc ? "searchConsole" : null].filter(Boolean).join(",");
    if (!services) {
      toast.error("Pick at least one service to connect.");
      return;
    }
    window.location.href = `/api/sub-accounts/${subAccountId}/google/connect?services=${services}`;
  };

  async function disconnect() {
    if (!confirm("Disconnect Google? This revokes our access and deletes the stored token.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/google`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { revokedAtGoogle?: boolean; revokeError?: string };
      if (!res.ok) throw new Error("Could not disconnect.");
      // Say which happened. "Disconnected" when the grant is still live in the
      // client's Google account would be a quiet untruth.
      if (d.revokedAtGoogle) toast.success("Disconnected and access revoked with Google.");
      else toast.warning("Disconnected here, but Google didn't confirm the revoke. Remove it at myaccount.google.com/permissions.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelection(patch: { ga4PropertyId?: string | null; gscSiteUrl?: string | null }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/google/properties`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save that selection.");
      toast.success("Saved. The next sync will use it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/google/sync`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { status?: string; reason?: string; services?: string[] };
      if (!res.ok) throw new Error(d.reason ?? "Sync failed.");
      if (d.status === "synced") toast.success(`Synced ${(d.services ?? []).join(" and ")}.`);
      else if (d.status === "skipped") toast.warning(`Nothing to sync yet (${d.reason}).`);
      else toast.error(`Sync failed: ${d.reason ?? "unknown"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  const connected = config?.connected === true;

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5" />
            Google Analytics &amp; Search Console
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect this workspace&rsquo;s Google account to pull traffic and search
            performance into Growth Intelligence. Read-only.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !connected ? (
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>What to connect</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={wantGa4} onCheckedChange={(v) => setWantGa4(!!v)} />
              Google Analytics (GA4) &mdash; sessions, users, conversions
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={wantGsc} onCheckedChange={(v) => setWantGsc(!!v)} />
              Search Console &mdash; clicks, impressions, average position
            </label>
            <p className="text-xs text-muted-foreground">
              Only the services you tick are requested. You can change this later by
              reconnecting.
            </p>
          </div>
          <Button onClick={connect} disabled={busy}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Connect Google
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Connected{config?.accountEmail ? ` as ${config.accountEmail}` : ""}
            </span>
            {/* Capability badges read from what Google GRANTED, not what we asked
                for — a client can accept Analytics and decline Search Console in
                the same dialog. */}
            <Badge on={googleCan(config, "ga4")} label="Analytics" />
            <Badge on={googleCan(config, "searchConsole")} label="Search Console" />
          </div>

          {config?.lastSyncError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Last sync failed</p>
                <p className="text-muted-foreground">{config.lastSyncError}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If this says the grant is invalid, the connection was revoked or
                  expired &mdash; reconnect below.
                </p>
              </div>
            </div>
          )}

          <Picker
            icon={<BarChart3 className="h-4 w-4" />}
            label="Analytics property"
            enabled={googleCan(config, "ga4")}
            options={ga4Options}
            value={config?.ga4PropertyId ?? ""}
            onChange={(v) => saveSelection({ ga4PropertyId: v || null })}
            disabled={busy}
          />
          <Picker
            icon={<Search className="h-4 w-4" />}
            label="Search Console site"
            enabled={googleCan(config, "searchConsole")}
            options={gscOptions}
            value={config?.gscSiteUrl ?? ""}
            onChange={(v) => saveSelection({ gscSiteUrl: v || null })}
            disabled={busy}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" onClick={syncNow} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync now
            </Button>
            <Button variant="outline" onClick={connect} disabled={busy}>
              Reconnect
            </Button>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              <Link2Off className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Syncs automatically once a day. Disconnecting revokes our access with
            Google and deletes the stored token.
          </p>
        </div>
      )}
    </section>
  );
}

function Badge({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={
        on
          ? "rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
          : "rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground line-through"
      }
    >
      {label}
    </span>
  );
}

function Picker({
  icon, label, enabled, options, value, onChange, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  options: PropertyOption[] | null;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (!enabled) return null;
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        {icon}
        {label}
      </Label>
      <select
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options === null}
      >
        <option value="">
          {options === null ? "Loading…" : options.length === 0 ? "Nothing available on this account" : "Not selected"}
        </option>
        {(options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.sub ? ` — ${o.sub}` : ""}
          </option>
        ))}
      </select>
      {value === "" && options !== null && options.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Pick one, or nothing will sync for this service.
        </p>
      )}
    </div>
  );
}
