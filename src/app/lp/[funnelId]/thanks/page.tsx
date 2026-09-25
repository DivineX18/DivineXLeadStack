import { notFound } from "next/navigation";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";

export const dynamic = "force-dynamic";

/**
 * The THANK-YOU / BRIDGE step (Multistep Journey pass, increment 2) — the
 * real page a visitor lands on after signing up. It answers the four
 * thank-you questions (what happened / what's next / when / what now) and
 * carries the two bridge actions:
 *   1. DELIVERY — the lead magnet download button (funnel.leadMagnetAsset,
 *      uploaded by the operator; for the lead_magnet genre the same file is
 *      also sent by the follow-up email, which the publish contract enforces).
 *   2. THE NEXT STEP — a CTA into the funnel's next offer when
 *      funnel.bridge.nextFunnelId is set (the magnet -> offer chain link).
 * Renders in the funnel's own accent/theme; no dashboard chrome. Public via
 * the existing /lp path allowlist.
 */
export default async function FunnelThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { funnelId } = await params;
  const paid = (await searchParams).paid === "1";
  const data = await loadFunnelForRender(funnelId);
  if (!data) notFound();
  const { funnel } = data;
  const dark = funnel.theme === "dark";
  const accent = funnel.accentColor || "#2563eb";
  const bridge = funnel.bridge;
  const magnet = funnel.leadMagnetAsset;

  // paid=1 — the post-checkout order confirmation ("the thank you after the
  // checkout page"): purchase-toned defaults, and no next-offer card (the
  // upsell chain already ran inside the checkout flow itself).
  //
  // A SUCCESS PAGE MAY NOT PROMISE A MESSAGE NOBODY SENDS.
  //
  // Verified live against a real test-mode purchase: the payment, webhook,
  // funnelOrders record and contact association all worked, and NO email was
  // sent or even attempted. Funnel Checkout has no mailer in its path at all
  // (lib/funnels/checkout-webhook.ts imports none), `receipt_email` is never
  // set on the session or PaymentIntent, and `funnel.order.completed` only
  // adds a "purchased" tag. The old copy told the buyer to go and check an
  // inbox that was never going to receive anything, which is worse than the
  // same untruth on a landing page: they have already paid, so they wait.
  //
  // So the copy states only what the product actually did. Deliberately NOT
  // conditional on Stripe's "Successful payments" customer-email setting:
  // that is an operator-level Dashboard choice this code cannot see, and a
  // page whose honesty depends on an invisible external toggle is not honest.
  // When a real confirmation email exists, this copy changes with it.
  const headline = paid ? "Order confirmed, you're in!" : bridge?.headline || "You're in!";
  const message = paid
    ? "Your payment was successful and your order has been confirmed."
    : bridge?.message ||
      // Same rule for the capture path. A lead magnet IS emailed (the publish
      // contract in cta-integrity.ts refuses to publish one whose active
      // follow-up does not carry the download link), but the download sits
      // right here on this page, so pointing at the inbox adds nothing and
      // risks promising delivery for a funnel whose email never arrives. With
      // no magnet there is no guaranteed follow-up email at all, because the
      // delivery contract only binds the lead_magnet genre.
      (magnet
        ? "Your download is ready below."
        : "Thanks for signing up. Your details have been received.");

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center"
      style={{
        background: dark ? "#0a0a0a" : "#faf9f6",
        color: dark ? "#f5f5f5" : "#0a0a0a",
        backgroundImage: `radial-gradient(60% 42% at 50% 0%, ${accent}22, transparent 70%)`,
      }}
    >
      <span
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg"
        style={{ backgroundColor: accent, boxShadow: `0 14px 40px -12px ${accent}99` }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      </span>
      <h1 className="max-w-xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">{headline}</h1>
      <p className="mt-4 max-w-md text-lg leading-relaxed opacity-75">{message}</p>

      {magnet && (
        <a
          href={magnet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: accent, boxShadow: `0 14px 34px -12px ${accent}99` }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 21h16" />
          </svg>
          Download {magnet.filename}
        </a>
      )}

      {!paid && bridge?.nextFunnelId && (
        <div className="mt-10 w-full max-w-md rounded-2xl border p-6" style={{ borderColor: `${accent}33`, background: `linear-gradient(180deg, ${accent}0f, transparent)` }}>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
            {bridge.nextLabel || "One more thing"}
          </p>
          <p className="mt-2 text-lg font-bold tracking-tight">{bridge.nextHeadline || "A special offer for new subscribers"}</p>
          <a
            href={`/lp/${bridge.nextFunnelId}`}
            className="mt-4 inline-flex rounded-xl border px-6 py-3 text-sm font-bold transition-colors"
            style={{ borderColor: accent, color: accent }}
          >
            {bridge.nextCta || "Take a look"}
          </a>
        </div>
      )}
    </main>
  );
}
