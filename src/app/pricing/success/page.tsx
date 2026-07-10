import Link from "next/link";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Post-checkout landing for public self-serve signup. Stripe's success_url
 * points here with `?session_id={CHECKOUT_SESSION_ID}`. Server-rendered
 * with the Admin SDK so the buyer sees LIVE provisioning status — the
 * webhook usually finishes within a few seconds, but this page is
 * refresh-safe if it hasn't yet. Mirrors `/pay/[token]/status/page.tsx`
 * (Client Billing's equivalent landing).
 */
export default async function PricingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const query = await searchParams;
  const sessionId = query.session_id;

  type SignupStatus = "processing" | "ready" | "failed" | "unknown";
  let status: SignupStatus = "unknown";
  let workspaceName: string | null = null;
  let planName: string | null = null;
  let requiresActivation = false;

  if (sessionId) {
    const snap = await getAdminDb().doc(`publicSignups/${sessionId}`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      status = (data.status as SignupStatus) ?? "unknown";
      workspaceName = (data.workspaceName as string | undefined) ?? null;
      planName = (data.planName as string | undefined) ?? null;
      requiresActivation = data.requiresActivation === true;
    }
  }

  const cancelled = query.cancelled === "1" && status !== "ready";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        {status === "ready" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-900/40">
              ✓
            </div>
            <h1 className="text-xl font-semibold">
              {workspaceName ? `${workspaceName} is ready` : "Payment received"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {planName ? `Your ${planName} subscription is live. ` : ""}
              {requiresActivation
                ? "Check your email for a link to set your password and log in."
                : "You already had an account — just log in and it'll be in your workspace switcher."}
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Log in
            </Link>
          </>
        ) : status === "failed" ? (
          <>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment went through, but we hit a snag setting up your
              workspace. We&apos;ve been notified and will sort it out — reach
              out to support if you don&apos;t hear from us shortly.
            </p>
          </>
        ) : cancelled ? (
          <>
            <h1 className="text-xl font-semibold">Checkout not completed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No charge was made. You can try again whenever you&apos;re ready.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Back to pricing
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Payment received</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;re setting up your workspace — this usually takes a few
              seconds. Refresh this page in a moment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
