import { notFound } from "next/navigation";
import { getCurrentAgencyOwner } from "@/lib/auth/require-agency-owner";
import { getOnboarding, listAccess } from "@/lib/server/client-onboarding-service";
import { listOnboardingAssets } from "@/lib/onboarding/assets";
import { outstandingRequirements } from "@/lib/onboarding/handoff";
import { OnboardingDetail } from "@/components/onboarding/onboarding-detail";

export const dynamic = "force-dynamic";

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const owner = await getCurrentAgencyOwner();
  if (!owner) notFound();
  const { id } = await params;

  const onboarding = await getOnboarding(owner.agencyId, id);
  if (!onboarding) notFound();

  const [access, assets] = await Promise.all([listAccess(id), listOnboardingAssets(id)]);
  const outstanding = outstandingRequirements(
    onboarding,
    [...new Set(assets.map((a) => a.key))],
    access,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <OnboardingDetail
        onboarding={JSON.parse(JSON.stringify(onboarding))}
        access={JSON.parse(JSON.stringify(access))}
        assets={JSON.parse(JSON.stringify(assets))}
        outstanding={outstanding}
      />
    </div>
  );
}
