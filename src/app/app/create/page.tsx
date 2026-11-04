import Link from "next/link";
import { AlertTriangle, ArrowRight, ExternalLink, Globe, LayoutTemplate } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendCreateContent } from "@/components/shell/ascend-create-content";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { MetricStrip } from "@/components/ascend/metric-card";
import { composeCreateSummary } from "@/lib/intelligence/compose-create-summary";
import { SubAccountProvider } from "@/context/sub-account-context";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * CREATE — P0.3, composed onto the band primitive.
 *
 * Campaigns is no longer a top-level concept: it lives inside Create, which
 * is the single library for everything Ascend builds. The execution band
 * renders the SAME AscendCreateContent (real Funnel Builder + Website
 * Builder, every existing gate intact) with a different section label and
 * funnel base href, deliberately not a second implementation. The legacy
 * /app/create route redirects here.
 *
 * What is new is everything ABOVE it. The North Star's Priority 2 names
 * this page by example: a lifecycle section carries context, insights and
 * recent projects BEFORE its tools, and this one went straight to the
 * builder hub, so "what have I built, and is any of it live" could only be
 * answered by picking a category tab and reading a list.
 */
export default async function CreatePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  const effectiveRole = shell?.workspace?.effectiveRole ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Create"
        description="No active workspace yet, once you're linked to one, everything you build will appear here."
        links={[]}
      />
    );
  }

  const [subSnap, summary] = await Promise.all([
    getAdminDb().doc(`subAccounts/${saId}`).get(),
    composeCreateSummary(saId),
  ]);
  const sub = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const isAdmin = effectiveRole === "admin" || effectiveRole === "agencyOwner";
  const data = summary.data;

  const DESCRIPTION =
    "Everything you're running to win business, funnels, pages and the sites behind them. Preview any draft before it goes live.";

  // Flow components mounted here (FunnelsList, WebsiteBuilder) resolve their
  // links through saPath(); inAscendShell keeps those links inside the
  // unified experience instead of bouncing the customer to /sa/{id}.
  const executionBand: AscendBand = {
    role: "execution",
    label: "Build something",
    content: (
      <SubAccountProvider subAccountId={saId} inAscendShell>
        {/* The section header above owns the <h1>. AscendCreateContent used
            to render its own, defaulted to "Create", which is why this
            document had two until the render test caught it. */}
        <AscendCreateContent
          saId={saId}
          isAdmin={isAdmin}
          websiteMaxSites={sub?.websiteMaxSites ?? null}
          funnelBaseHref="/create/funnel"
        />
      </SubAccountProvider>
    ),
  };

  // A read failure must not cost the customer the builder: it reads its own
  // data client-side and works regardless, so degrade to it rather than to
  // an error screen.
  if (!data) {
    return (
      <AscendSectionPage
        title="Create"
        description={DESCRIPTION}
        bands={[
          {
            role: "context",
            content: (
              <AscendCardShell title="We couldn't load your project list" emphasis="quiet">
                <p className="text-sm text-[var(--dx-text-secondary)]">
                  Your work is safe, this is a problem reading it. Everything you have built is still here and editable
                  below.
                </p>
              </AscendCardShell>
            ),
          },
          executionBand,
        ]}
      />
    );
  }

  const liveCount = data.funnelsLive + data.websitesLive;
  const totalCount = data.funnelsTotal + data.websitesTotal;

  // WHAT NEEDS ATTENTION, only from conditions actually read.
  const attention: { text: string; href: string; hrefLabel: string }[] = [];
  for (const p of data.recent) {
    if (p.needsAttention) {
      attention.push({ text: `${p.name} ${p.needsAttention}.`, href: p.href, hrefLabel: "Open it" });
    }
  }
  if (totalCount > 0 && liveCount === 0) {
    attention.push({
      text: "Nothing you have built is live yet, so none of it can bring you leads.",
      href: "/create",
      hrefLabel: "Review your drafts",
    });
  }

  const bands: AscendBand[] = [
    // 1 — CONTEXT. Is any of this working for me right now.
    {
      role: "context",
      content: (
        <AscendCardShell title={liveCount > 0 ? `${liveCount} of your pages ${liveCount === 1 ? "is" : "are"} live` : "Nothing is live yet"}>
          <p className="text-sm text-[var(--dx-text-secondary)]">
            {totalCount === 0
              ? "You haven't built anything here yet. Start with a funnel if you want leads this week, or a website if you need somewhere to point people."
              : liveCount > 0
                ? "Live pages are reachable by the public right now. Anything still in draft is private until you publish it."
                : "Everything here is still private. Publishing a page is what makes it reachable by the public."}
          </p>
        </AscendCardShell>
      ),
    },
  ];

  // 2 — INSIGHTS. Only once there is something to count.
  if (totalCount > 0) {
    bands.push({
      role: "insights",
      label: "Your library",
      content: (
        <MetricStrip
          meta={summary.meta}
          metrics={[
            { label: "Funnels live", value: String(data.funnelsLive), subLabel: `${data.funnelsTotal} total` },
            { label: "Funnels in draft", value: String(data.funnelsDraft) },
            { label: "Websites live", value: String(data.websitesLive), subLabel: `${data.websitesTotal} total` },
            {
              label: "Awaiting review",
              value: String(data.funnelsAwaitingReview + data.websitesNeedingReview),
            },
          ]}
        />
      ),
    });
  }

  // 3 — ACTIVITY. The band the North Star names by example. Omitted when
  // empty: an empty band teaches the customer the section is decorative.
  if (data.recent.length > 0) {
    bands.push({
      role: "activity",
      label: "Recent projects",
      content: (
        <AscendCardShell emphasis="quiet">
          <ul className="divide-y" style={{ borderColor: "var(--dx-border-subtle)" }}>
            {data.recent.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {p.kind === "website" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                ) : (
                  <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                )}
                <Link href={p.href} className="min-w-0 flex-1 truncate text-sm text-[var(--dx-text-primary)]">
                  {p.name}
                </Link>
                <span
                  className="shrink-0 text-xs"
                  style={{ color: p.live ? "var(--dx-primary)" : "var(--dx-text-muted)" }}
                >
                  {p.statusLabel}
                </span>
                {p.liveUrl && (
                  <Link
                    href={p.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[var(--dx-text-muted)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="sr-only">Open {p.name} in a new tab</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </AscendCardShell>
      ),
    });
  }

  // 4 — RECOMMENDATIONS. Only when something is genuinely waiting.
  if (attention.length > 0) {
    bands.push({
      role: "recommendations",
      label: "What needs attention",
      content: (
        <AscendCardShell emphasis="quiet">
          <ul className="space-y-2.5">
            {attention.map((a) => (
              <li key={a.text} className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                <p className="text-sm text-[var(--dx-text-secondary)]">
                  {a.text}
                  <Link
                    href={a.href}
                    className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: "var(--dx-primary)" }}
                  >
                    {a.hrefLabel} <ArrowRight className="h-3 w-3" />
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </AscendCardShell>
      ),
    });
  }

  bands.push(executionBand);

  return <AscendSectionPage title="Create" description={DESCRIPTION} bands={bands} />;
}
