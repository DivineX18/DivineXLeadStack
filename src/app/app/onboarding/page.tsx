import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingExperience } from "@/components/divinex/onboarding-experience";
import type { OnboardingMode } from "@/lib/divinex/onboarding-manifest";

export const dynamic = "force-dynamic";

/**
 * DivineX guided onboarding (Slice 4) — lives in the unified /app shell.
 * Mode comes from ?mode= (complete default); the active workspace comes
 * from the same cookie the shell layout uses.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; w?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const subAccountId = sp.w ?? cookieStore.get("active_workspace_id")?.value ?? "";
  if (!subAccountId) redirect("/agency");

  const mode: OnboardingMode =
    sp.mode === "ascend" || sp.mode === "flow" ? sp.mode : "complete";

  return <OnboardingExperience subAccountId={subAccountId} mode={mode} />;
}
