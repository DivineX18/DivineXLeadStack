import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Target, TrendingUp, Wrench } from "lucide-react";
import { ascend } from "@/lib/divinex/ascend-client";
import { getDivinexProfileSnapshot } from "@/lib/divinex/contract";

export const dynamic = "force-dynamic";

/**
 * "Your Growth System is Ready" (Slice 5) — the reveal uses REAL Ascend
 * intelligence only. When no scan exists the reveal degrades honestly to
 * what IS known (profile + brand + assets); it never fabricates findings.
 *
 * "Build It With Flow" carries structured Campaign Intent (offer/objective/
 * recommendation ids), not an empty builder and not a giant prompt.
 */
export default async function RevealPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const subAccountId = sp.w ?? cookieStore.get("active_workspace_id")?.value ?? "";
  if (!subAccountId) redirect("/agency");

  const snapshot = await getDivinexProfileSnapshot(subAccountId);
  const businessProfileId = snapshot?.businessProfileId ?? null;
  const intel = businessProfileId
    ? (await ascend.getIntelligence(businessProfileId)).data
    : null;
  const scan = (intel as { available?: boolean; scan?: Record<string, unknown> } | null)?.available
    ? ((intel as { scan: Record<string, unknown> }).scan)
    : null;

  const business = (snapshot?.business ?? {}) as { name?: string };
  const brand = (snapshot?.brand ?? {}) as { visual?: { tokens?: { palette?: string[] } } };
  const approvedAssets = (snapshot?.assets ?? []).filter((a) => a.status === "approved");
  const offers = snapshot?.offers ?? [];

  const opportunities = Array.isArray(scan?.topOpportunities)
    ? (scan!.topOpportunities as unknown[]).slice(0, 3)
    : [];

  const buildHref = `/app/create?intent=${encodeURIComponent(
    JSON.stringify({
      businessProfileId,
      objective: "leads",
      offerId: offers[0]?.id ?? null,
      ascendRecommendation: scan
        ? {
            scanId: scan.scanId,
            primaryConstraint: scan.primaryConstraint,
            recommendedFunnelType: scan.recommendedFunnelType,
            recommendedLeadMagnet: scan.recommendedLeadMagnet,
          }
        : null,
    }),
  )}`;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
        {business.name ? `${business.name} · ` : ""}Growth System
      </p>
      <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        Your Growth System is Ready
      </h1>

      {scan ? (
        <div className="mt-10 space-y-4">
          <Card
            icon={<Target className="h-5 w-5 text-emerald-400" />}
            label="Primary growth constraint"
            value={String(scan.primaryConstraint)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
              label="Growth score"
              value={`${scan.overallScore}/100 · ${scan.scoreLabel}`}
            />
            <Card
              icon={<Wrench className="h-5 w-5 text-emerald-400" />}
              label="Recommended next build"
              value={String(scan.recommendedFunnelType).replace(/_/g, " ")}
            />
          </div>
          {opportunities.length > 0 && (
            <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-40">
                Top opportunities
              </p>
              <ul className="mt-3 space-y-2">
                {opportunities.map((o, i) => (
                  <li key={i} className="flex gap-2.5 opacity-85">
                    <span className="text-emerald-400">{i + 1}.</span>
                    <span>{typeof o === "string" ? o : ((o as { title?: string }).title ?? JSON.stringify(o))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        /* HONEST REDUCED REVEAL — no scan intelligence available yet. */
        <div className="mt-10 space-y-4">
          <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6">
            <p className="opacity-80">
              DivineX now understands your business
              {business.name ? `, ${business.name}` : ""}
              {offers.length > 0 ? ` and your ${offers.length === 1 ? "offer" : `${offers.length} offers`}` : ""}
              {approvedAssets.length > 0 ? `, with ${approvedAssets.length} approved brand assets` : ""}.
            </p>
            <p className="mt-3 text-sm opacity-55">
              A full growth diagnosis needs a website scan. You can run one anytime, or start building now — everything
              you build will use your real business, brand and assets.
            </p>
          </div>
        </div>
      )}

      {(brand.visual?.tokens?.palette?.length ?? 0) > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-40">Your brand</span>
          <div className="flex gap-1.5">
            {brand.visual!.tokens!.palette!.slice(0, 5).map((c) => (
              <span key={c} className="h-6 w-6 rounded-md border border-[var(--dx-border-subtle)]" style={{ backgroundColor: c }} />
            ))}
          </div>
          {approvedAssets.length > 0 && (
            <span className="ml-auto text-sm opacity-60">{approvedAssets.length} assets ready</span>
          )}
        </div>
      )}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={buildHref}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 font-semibold text-black transition-transform hover:-translate-y-0.5"
        >
          Build it with Zeno <ArrowRight className="h-4 w-4" />
        </Link>
        {/* Assistance Recommendation — secondary by design; software first. */}
        <Link
          href="/assistance?context=post_reveal"
          className="dx-secondary-action inline-flex items-center justify-center rounded-[var(--dx-radius)] px-5 py-3.5 text-sm"
        >
          Get launch help
        </Link>
      </div>
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-40">{label}</p>
      </div>
      <p className="mt-2 text-lg font-semibold leading-snug">{value}</p>
    </div>
  );
}
