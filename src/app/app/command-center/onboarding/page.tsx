import { notFound } from "next/navigation";
import { getCurrentAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  listOnboardings,
  listPackages,
} from "@/lib/server/client-onboarding-service";
import { OnboardingDashboard } from "@/components/onboarding/onboarding-dashboard";

export const dynamic = "force-dynamic";

/**
 * Client onboarding, inside the Command Center.
 *
 * Gated exactly like every other owner-only surface here: the page check plus
 * every API route's own `requireAgencyOwner()`. notFound() rather than a 403
 * for a non-owner, matching this codebase's "do not advertise admin routes"
 * convention.
 */
export default async function OnboardingAdminPage() {
  const owner = await getCurrentAgencyOwner();
  if (!owner) notFound();

  const [onboardings, packages] = await Promise.all([
    listOnboardings(owner.agencyId),
    listPackages(owner.agencyId),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8">
      <OnboardingDashboard
        initialOnboardings={JSON.parse(JSON.stringify(onboardings))}
        packages={JSON.parse(JSON.stringify(packages))}
      />
    </div>
  );
}
