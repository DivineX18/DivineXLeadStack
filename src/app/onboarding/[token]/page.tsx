import { notFound } from "next/navigation";
import { buildPortalView, resolvePortalToken } from "@/lib/onboarding/portal-service";
import { OnboardingPortal } from "@/components/onboarding/onboarding-portal";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";

export const dynamic = "force-dynamic";

/**
 * The client's onboarding page. Public by design: the token is the credential.
 *
 * An invalid or rotated token renders notFound(), the same answer a
 * nonexistent one gets, so the page cannot be used to probe whether a given
 * onboarding exists. An EXPIRED token is told apart, because that is a real
 * situation a client can act on by asking for a new link.
 */
export default async function OnboardingPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolvePortalToken(token);
  const brand = await resolveCustomBrand();

  if (!resolved.ok) {
    if (resolved.reason === "expired") {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16 text-center">
          <h1 className="text-2xl font-bold">This link has expired</h1>
          <p className="mt-3 text-muted-foreground">
            Onboarding links are time limited for your security. Ask your account manager
            for a fresh one and you will pick up exactly where you left off, nothing you
            have already filled in is lost.
          </p>
        </main>
      );
    }
    notFound();
  }

  const view = await buildPortalView(resolved.onboarding);
  return <OnboardingPortal token={token} initialView={view} brandName={brand.name} />;
}
