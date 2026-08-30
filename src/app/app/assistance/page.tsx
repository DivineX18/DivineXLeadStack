import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { SERVICE_CATALOG, recommendAssistance, type AssistanceTrigger } from "@/lib/divinex/assistance";
import { getDivinexProfileSnapshot } from "@/lib/divinex/contract";
import { ascend } from "@/lib/divinex/ascend-client";

export const dynamic = "force-dynamic";

/**
 * Assistance Recommendations surface. Software is the default path — this
 * page only ever shows what is actually appropriate for the customer's
 * situation, and shows NOTHING when no paid assistance is warranted.
 */
export default async function AssistancePage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; w?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const subAccountId = sp.w ?? cookieStore.get("active_workspace_id")?.value ?? "";
  const trigger = (sp.context as AssistanceTrigger) ?? "post_reveal";

  const snapshot = subAccountId ? await getDivinexProfileSnapshot(subAccountId) : null;
  const business = (snapshot?.business ?? {}) as { monthlyRevenue?: string };
  const intel = snapshot?.businessProfileId
    ? (await ascend.getIntelligence(snapshot.businessProfileId)).data
    : null;
  const scan = (intel as { available?: boolean; scan?: { primaryConstraint?: string; overallScore?: number } } | null)?.scan;

  const recommendations = recommendAssistance(trigger, {
    primaryConstraint: scan?.primaryConstraint ?? null,
    growthScore: scan?.overallScore ?? null,
    monthlyRevenueBand: business.monthlyRevenue ?? null,
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Getting help</h1>

      {recommendations.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6">
          <p className="font-semibold">Nothing here is worth your money right now.</p>
          <p className="mt-2 opacity-70">
            Based on where your business is, paid assistance would not be the highest-leverage spend. Keep building with
            Zeno — we will tell you when a specialist would genuinely help.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {recommendations.map((rec) => {
            const service = rec.service ? SERVICE_CATALOG[rec.service] : null;
            if (!service) return null;
            return (
              <div key={rec.trigger + service.key} className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6">
                <p className="text-lg font-semibold">{rec.headline}</p>
                <p className="mt-2 opacity-70">{rec.explanation}</p>
                <div className="mt-5 rounded-xl border border-[var(--dx-border-subtle)] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{service.name}</p>
                    <p className="text-sm opacity-70">{service.price}</p>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm opacity-75">
                    {service.includes.map((line) => (
                      <li key={line}>· {line}</li>
                    ))}
                  </ul>
                  {service.humanWindow && (
                    <p className="mt-3 rounded-lg bg-[var(--dx-surface-2)] p-3 text-xs opacity-70">{service.humanWindow}</p>
                  )}
                  {service.qualificationOnly && (
                    <p className="mt-3 text-xs opacity-60">Available by qualification only.</p>
                  )}
                </div>
                <Link
                  href={service.ctaHref}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black"
                >
                  {service.ctaLabel} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-sm opacity-50">
        Software first. We recommend human help only when it removes real friction or supplies judgment you would
        otherwise have to buy elsewhere.
      </p>
    </div>
  );
}
