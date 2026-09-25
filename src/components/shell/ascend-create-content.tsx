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
import { effectiveWebsiteCap, countConsumedWebsiteSlots } from "@/lib/website/limits";
import { AscendAssetsSection } from "@/components/shell/ascend-assets-section";
import { CampaignPlanPanel } from "@/components/divinex/campaign-plan-panel";
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

/**
 * CREATE IS A HUB, NOT A SCROLL.
 *
 * Every creation surface used to render at once, stacked: the full funnel
 * inventory, the asset library, a links block, and the website builder, whose
 * long sectioned form is per-site. Answering "what do I want to build?" meant
 * scrolling past three things you did not want first.
 *
 * Progressive disclosure fixes the information architecture without touching
 * any creation system. Each panel mounts only when its category is chosen, so
 * FunnelsList, AscendAssetsSection and WebsiteBuilder are the same proven
 * components with the same gates, props and routes as before. Nothing was
 * removed; the funnel/website/asset/links surfaces are all still here.
 *
 * LEAD MAGNETS EARNS ITS OWN TAB FOR A DISCOVERABILITY REASON, NOT A
 * TECHNICAL ONE. A lead magnet IS a funnel: `lead_magnet` is one of the
 * funnel genres, with two templates ("Guide download", "Buyer waitlist"), and
 * uploading a PDF to it wires `leadMagnetAsset` into the follow-up email. No
 * entitlement gates it separately — funnelsEnabledByAgency covers it, and
 * that is on. But the word "Lead Magnet" appeared nowhere on this page: it
 * was a genre inside a "New funnel" dropdown and a card inside a template
 * gallery hidden behind a "Start from a template" toggle. A customer looking
 * for the thing by name could not find it, and reasonably concluded they did
 * not have it. The tab names what already exists rather than adding anything.
 */
const CREATE_CATEGORIES = [
  { id: "funnels", label: "Funnels", blurb: "Landing pages and funnels that capture and convert." },
  { id: "websites", label: "Websites", blurb: "A full site, built and hosted for you." },
  { id: "lead-magnets", label: "Lead Magnets", blurb: "Trade something useful for an email address." },
  { id: "assets", label: "Marketing Assets", blurb: "Copy, sequences and documents drafted for review." },
] as const;

type CreateCategory = (typeof CREATE_CATEGORIES)[number]["id"];

export function AscendCreateContent({
  saId,
  isAdmin,
  websiteMaxSites,
  title = "Create",
  description = "Build funnels and websites — the same proven builders, native to Ascend.",
  // The canonical Ascend funnel editor is /create/funnel/{id} (singular). The
  // plural default sent every click through the /create/funnels/{id} legacy
  // shim, which exists only to redirect old links and costs a round trip; and
  // /create/funnels itself has no index page, so the default was one careless
  // `${baseHref}` away from a 404. The only real caller already passes the
  // singular form — this just stops the default disagreeing with it.
  funnelBaseHref = "/create/funnel",
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
  const [category, setCategory] = useState<CreateCategory>("funnels");
  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--dx-text-primary)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--dx-text-muted)]">{description}</p>
      </div>

      {/* The plan comes first when there is one: what was agreed, and what is
          waiting on the customer, before the library of things already built.
          Renders nothing at all when no campaign exists, so an individual
          build never gains an empty ceremony above it. */}
      <CampaignPlanPanel saId={saId} isAdmin={isAdmin} />

      {/* WHAT DO YOU WANT TO BUILD? — answered before anything is listed. */}
      <nav aria-label="What to create" className="flex flex-wrap gap-2">
        {CREATE_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              aria-current={active ? "true" : undefined}
              className="rounded-[var(--dx-radius-md)] border px-4 py-2.5 text-left text-sm transition-colors"
              style={{
                backgroundColor: active ? "var(--dx-surface-2)" : "var(--dx-surface-1)",
                borderColor: active ? "var(--dx-border-strong, var(--dx-border-subtle))" : "var(--dx-border-subtle)",
                color: active ? "var(--dx-text-primary)" : "var(--dx-text-secondary)",
              }}
            >
              <span className="font-medium">{c.label}</span>
            </button>
          );
        })}
      </nav>
      <p className="-mt-4 text-sm text-[var(--dx-text-muted)]">
        {CREATE_CATEGORIES.find((c) => c.id === category)?.blurb}
      </p>

      {category === "funnels" && (
        <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
          <FunnelsList saId={saId} baseHref={funnelBaseHref} />
        </section>
      )}

      {/* NAMES WHAT ALREADY EXISTS. A lead magnet is the `lead_magnet` funnel
          genre; this routes to the same builder with the same gate, and says
          out loud what the PDF upload does, which was the part nobody could
          discover. */}
      {category === "lead-magnets" && (
        <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
          <h2 className="text-xl font-semibold text-[var(--dx-text-primary)]">Lead magnets</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--dx-text-muted)]">
            A lead magnet is an opt-in page plus the file it delivers. Start from
            the <strong>Guide download</strong> or <strong>Buyer waitlist</strong> template
            below, or pick <strong>Lead magnet</strong> when you create a new funnel. Upload
            a PDF in the builder and it is attached to the follow-up email automatically.
          </p>
          {/* TWO THINGS SHARE THE NAME, SO SAY WHICH IS WHICH.
              This tab builds the opt-in page and the delivery. Writing the
              document itself is Marketing Assets, where "Lead Magnet" and
              "Lead Magnet Full Draft" are generation types. Without this line
              a customer sees the words twice and has to guess. */}
          <p className="mt-2 max-w-2xl text-sm text-[var(--dx-text-muted)]">
            Writing the document itself happens in{" "}
            <button
              type="button"
              onClick={() => setCategory("assets")}
              className="underline underline-offset-2 hover:text-[var(--dx-text-primary)]"
            >
              Marketing Assets
            </button>
            , where Zeno drafts it from your business. This tab is the page that
            delivers it.
          </p>
          <div className="mt-6">
            <FunnelsList saId={saId} baseHref={funnelBaseHref} />
          </div>
        </section>
      )}

      {category === "assets" && (
        <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
          <AscendAssetsSection saId={saId} isAdmin={isAdmin} />
        </section>
      )}

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

      {category === "websites" && (
      <section className="rounded-[var(--dx-radius-lg)] border p-6" style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}>
        {isAdmin ? (
          <AscendWebsitesSection saId={saId} websiteMaxSites={websiteMaxSites} />
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Only sub-account admins can build the website.
          </div>
        )}
      </section>
      )}
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
              {/* Published sites only — an unbuilt draft and a build that
                  failed upstream deliver nothing, so neither spends a slot.
                  Same helper the server enforces with, so the number a
                  customer reads can never disagree with the number that
                  blocks them. */}
              {countConsumedWebsiteSlots(orderedSites)} of {maxSitesLabel} websites used.
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
