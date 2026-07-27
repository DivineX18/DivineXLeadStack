import Link from "next/link";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";

export const metadata = {
  title: "Refund Policy",
  description:
    "How billing works when you cancel or downgrade your Flow subscription.",
};

export default async function RefundPolicyPage() {
  const brand = await resolveCustomBrand();
  const supportMailto = `mailto:${brand.supportEmail}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Refund Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: July 26, 2026
        </p>
        <p>
          This Refund Policy explains how billing works when you cancel your{" "}
          {brand.name} subscription, provided by Jade&rsquo;s Gems &amp;
          SOULutions LLC, doing business as DivineX. It should be read
          together with Section 4 of our{" "}
          <Link href="/terms">Terms of Service</Link>, and is governed by the
          laws of the State of Texas, United States, on the same terms as
          Section 14 of that document.
        </p>

        <h2>1. Monthly subscriptions, cancel anytime</h2>
        <p>
          {brand.name} is billed monthly, in advance. You can cancel at any
          time &mdash; there&rsquo;s no minimum commitment and no
          cancellation fee.
        </p>

        <h2>2. No refunds for the current billing period</h2>
        <p>
          <strong>Once a monthly charge has been made, it is not refunded</strong>{" "}
          &mdash; including if you cancel partway through the period, use
          the Service for only part of the month, or decide the Service
          isn&rsquo;t right for you after being charged. When you cancel,
          you keep full access through the end of the period you&rsquo;ve
          already paid for, and you will not be charged again after that.
        </p>
        <p>
          <strong>In practice:</strong> if your renewal date is the 1st and
          you cancel on the 15th, you keep access until the end of that
          billing period, are not charged again, but do not receive a
          partial refund for the second half of the month.
        </p>

        <h2>3. Failed payments and the grace period</h2>
        <p>
          If a payment fails, you have a <strong>7-day grace period</strong>{" "}
          to update your payment method before access is restricted &mdash;
          see Section 4.4 of the <Link href="/terms">Terms of Service</Link>.
          No charge is refunded during this process; the grace period exists
          to give you time to fix a payment issue before losing access, not
          to reverse a successful charge.
        </p>

        <h2>4. Exceptions</h2>
        <p>
          Nothing in this policy limits any refund right you have under law
          that cannot be waived by agreement &mdash; for example,
          consumer-protection law in your jurisdiction may require a refund
          in specific circumstances (such as a billing error on our part, or
          a legally mandated cooling-off period). If you believe
          you&rsquo;re entitled to a refund for a reason like this, contact
          us and we&rsquo;ll review it.
        </p>

        <h2>5. Billing errors</h2>
        <p>
          If you believe you were charged incorrectly (for example, charged
          twice for the same period, or charged after you&rsquo;d already
          cancelled), contact us immediately &mdash; this is different from
          a standard cancellation refund request, and we will correct
          genuine billing errors.
        </p>

        <h2>6. How to cancel</h2>
        <p>
          Cancel any time from your account&rsquo;s billing settings, or by
          contacting support. We do not require a reason, and there&rsquo;s
          no retention flow or required &ldquo;exit interview&rdquo; to get
          through &mdash; cancellation is self-service.
        </p>

        <h2>7. Related Documents</h2>
        <p>
          This Refund Policy should be read together with our{" "}
          <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>8. Contact</h2>
        <p>
          Questions about a specific charge or this policy &mdash;{" "}
          <a
            href={supportMailto}
            className="underline-offset-4 hover:underline"
          >
            email {brand.supportEmail}
          </a>
          , or write to us at:
        </p>
        <p>
          Jade&rsquo;s Gems &amp; SOULutions LLC
          <br />
          440 Louisiana St
          <br />
          Houston, TX 77002
          <br />
          United States
        </p>
      </article>
    </div>
  );
}
