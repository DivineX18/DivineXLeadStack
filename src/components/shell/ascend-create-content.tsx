"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ExternalLink, Globe, Loader2, Lock, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getFirebaseDb } from "@/lib/firebase/client";
import { GITPAGE_SUBSCRIBE_URL, useGitpageStatus, type GitpageGateState } from "@/hooks/use-gitpage-status";
import { Button } from "@/components/ui/button";
import { FunnelsList } from "@/components/funnels/funnels-list";
import { WebsiteBuilder } from "@/components/website/website-builder";
import { effectiveWebsiteCap } from "@/lib/website/limits";
import { AscendAssetsSection } from "@/components/shell/ascend-assets-section";
import type { WebsiteDoc } from "@/types/website";

/**
 * Ascend OS launch pass, Task B. Mounts the REAL, proven Funnel Builder
 * (FunnelsList/FunnelBuilder) and Website Builder (WebsiteBuilder) directly
 * inside the Ascend shell — reused as-is, not rebuilt, matching every gate
 * (funnelsEnabledByAgency / websiteEnabledByAgency) and server-side
 * enforcement those components already carry (see funnels-list.tsx's own
 * live onSnapshot gate check, and websites-service.ts's
 * requireWebsiteEnabledSub() re-enforced on every write regardless of which
 * page the request came from).
 *
 * The Websites section here is a prop-driven port of
 * src/app/(dashboard)/sa/[subAccountId]/website/page.tsx's client logic —
 * that page pulls subAccountId/isAdmin/the site-cap doc from
 * useSubAccount(), which only exists inside /sa/[id]/... layouts; this
 * component takes the same inputs as props instead, resolved server-side
 * by app/create/page.tsx. No new backend logic, no new Firestore shape —
 * same collection (subAccounts/{id}/website), same create/build API route,
 * same effectiveWebsiteCap() helper.
 *
 * The original /sa/{id}/funnels and /sa/{id}/website pages are completely
 * untouched — this is an additive second consumer of the same components.
 */
export function AscendCreateContent({
  saId,
  isAdmin,
  websiteMaxSites,
  title = "Create",
  description = "Build funnels and websites — the same proven builders, native to Ascend.",
  funnelBaseHref = "/create/funnels",
}: {
  saId: string;
  isAdmin: boolean;
  websiteMaxSites: number | null;
  /** Production Experience 2.0: the same content renders under the
   *  customer-facing "Campaigns" section. Title/href are props so there is
   *  exactly ONE implementation, not a second copy per section name. */
  title?: string;
  description?: string;
  funnelBaseHref?: string;
}) {
  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--dx-text-primary)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--dx-text-muted)]">{description}</p>
      </div>

      <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
        <FunnelsList saId={saId} baseHref={funnelBaseHref} />
      </section>

      <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
        <AscendAssetsSection saId={saId} isAdmin={isAdmin} />
      </section>

      {/* The rest of what a business builds. Each links to a unified route
          that mounts the SAME Flow page component (components/shell/
          unified-feature.tsx), so none of these leave the DivineX shell. */}
      <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
        <h2 className="text-xl font-semibold text-[var(--dx-text-primary)]">Everything else you sell with</h2>
        <p className="mt-1 text-sm text-[var(--dx-text-muted)]">
          Forms and booking pages you can share anywhere, the products and quotes behind your offers,
          and the orders that come in.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/create/forms", label: "Forms", desc: "Build a form and embed it on any site." },
            { href: "/create/booking", label: "Booking pages", desc: "Share a link people can book from." },
            { href: "/create/products", label: "Products", desc: "The catalogue behind your offers." },
            { href: "/create/quotes", label: "Quotes & invoices", desc: "Send, track and mark paid." },
            { href: "/create/orders", label: "Orders", desc: "Payments taken through your funnels." },
            { href: "/create/templates", label: "Templates", desc: "Reusable email and SMS copy." },
            { href: "/create/workflows", label: "Automations", desc: "Follow up without doing it by hand." },
            { href: "/create/broadcasts", label: "Broadcasts", desc: "Send to a segment of your list." },
          ].map((x) => (
            <a
              key={x.href}
              href={x.href}
              className="rounded-[var(--dx-radius-md)] border p-4 transition-colors hover:bg-[var(--dx-hover)]"
              style={{ borderColor: "var(--dx-border-subtle)" }}
            >
              <span className="block text-sm font-medium text-[var(--dx-text-primary)]">{x.label}</span>
              <span className="mt-1 block text-xs text-[var(--dx-text-muted)]">{x.desc}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
        {isAdmin ? (
          <AscendWebsitesSection saId={saId} websiteMaxSites={websiteMaxSites} />
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Only sub-account admins can build the website.
          </div>
        )}
      </section>
    </div>
  );
}

function AscendWebsitesSection({
  saId,
  websiteMaxSites,
}: {
  saId: string;
  websiteMaxSites: number | null;
}) {
  const maxSites = effectiveWebsiteCap({ websiteMaxSites });
  const [sites, setSites] = useState<WebsiteDoc[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const { state: gateState, refresh: refreshGate } = useGitpageStatus();

  useEffect(() => {
    function onFocus() {
      void refreshGate();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshGate]);

  useEffect(() => {
    const ref = collection(getFirebaseDb(), `subAccounts/${saId}/website`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSites(snap.docs.map((d) => ({ ...(d.data() as WebsiteDoc), id: d.id })));
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, [saId]);

  const orderedSites = useMemo(() => {
    const toMillis = (s: WebsiteDoc) => {
      const v = s.createdAt as { toMillis?: () => number } | null | undefined;
      return v?.toMillis?.() ?? 0;
    };
    return [...sites].sort((a, b) => toMillis(a) - toMillis(b));
  }, [sites]);

  const atCap = orderedSites.length >= maxSites;
  const maxSitesLabel = Number.isFinite(maxSites) ? String(maxSites) : "unlimited";
  const gateBlocked = gateState.kind === "subscribe-needed";

  const handleAdd = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/website`, { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not add website.");
      toast.success("New website draft added — fill it in and build.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add website.");
    } finally {
      setCreating(false);
    }
  }, [saId]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Globe className="h-4 w-4" />
          </span>
          <h2 className="text-xl font-semibold">Websites</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Build up to {maxSitesLabel} marketing sites for this client via gitpage.site.
        </p>
      </header>

      {gateBlocked && <ActivationGate state={gateState} onRefresh={refreshGate} />}

      {orderedSites.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="text-sm font-medium">No websites yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Add your first site to get started. You can build up to {maxSitesLabel} per client.
          </p>
          <Button type="button" className="mt-4" onClick={handleAdd} disabled={creating || gateBlocked}>
            {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add website
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orderedSites.map((site) => (
            <WebsiteBuilder key={site.id} subAccountId={saId} doc={site} gateBlocked={gateBlocked} />
          ))}
          <div className="flex items-center justify-between rounded-2xl border border-dashed bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">
              {orderedSites.length} of {maxSitesLabel} websites used.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={creating || atCap || gateBlocked}
              title={atCap ? "Remove a website to add another." : undefined}
            >
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              {atCap ? "Limit reached" : "Add website"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivationGate({ state, onRefresh }: { state: GitpageGateState; onRefresh: () => Promise<boolean> }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const ok = await onRefresh();
      toast[ok ? "success" : "error"](ok ? "Status refreshed." : "Couldn't refresh — try again.");
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  if (state.kind !== "subscribe-needed") return null;
  const keyInvalid = state.lastError === "401_invalid_api_key";

  return (
    <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">
            {keyInvalid ? "Re-paste your API key" : "Add a website-builder key"}
          </h3>
          {keyInvalid ? (
            <p className="mt-1 text-sm text-muted-foreground">
              The website-builder API key was rejected — it may have been rotated upstream. Update{" "}
              <code>GITPAGE_API_KEY</code> in your hosting env vars and redeploy.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Spin up a marketing site for this client once you&apos;ve dropped a website-builder API key
              into your env vars. Already have one? Set <code>GITPAGE_API_KEY</code> and redeploy.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" render={<a href={GITPAGE_SUBSCRIBE_URL} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Get a key
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Re-check
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
