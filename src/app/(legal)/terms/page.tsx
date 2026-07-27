import Link from "next/link";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";

export const metadata = {
  title: "Terms of Service",
  description:
    "The terms governing your subscription to and use of Flow, DivineX's hosted Growth Operations Platform.",
};

/**
 * Public Terms of Service. Describes Flow as the hosted SaaS subscription
 * it actually is — replaces an earlier version that incorrectly described
 * a self-hosted, one-time-purchase software license (leftover from the
 * underlying template this deployment was built from). Legal entity name
 * and governing jurisdiction are intentionally not asserted below — see
 * Section 14 — pending confirmation from DivineX; everything else reflects
 * verified, current product behavior.
 */
export default async function TermsPage() {
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
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: July 26, 2026
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
          and use of {brand.name}, a Growth Operations Platform operated by
          Jade&rsquo;s Gems &amp; SOULutions LLC, doing business as DivineX
          (&ldquo;DivineX,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;). By creating an account, subscribing to a plan,
          or otherwise using {brand.name} (the &ldquo;Service&rdquo;), you
          agree to be bound by these Terms. If you do not agree, do not use
          the Service.
        </p>
        <p>
          If you are entering into these Terms on behalf of a company or
          other legal entity, you represent that you have the authority to
          bind that entity, in which case &ldquo;you&rdquo; refers to that
          entity.
        </p>

        <h2>2. The Service</h2>
        <p>
          {brand.name} is a hosted, multi-tenant Growth Operations Platform.
          DivineX operates the infrastructure, and you access it as a
          subscriber &mdash; this is a hosted SaaS service, not a software
          license. {brand.name} provides tools including but not limited to:
          contact and pipeline management, calendar and booking pages, email
          and SMS communication, hosted lead-capture forms, workflow
          automations, quotes and invoicing, a website builder, and optional
          AI-powered agents that can respond to messages and calls on your
          behalf.
        </p>
        <p>
          DivineX hosts your workspace, stores your data on infrastructure we
          operate (via our subprocessors &mdash; see our{" "}
          <Link href="/privacy">Privacy Policy</Link>), and is responsible
          for keeping the Service running. We are not licensing you software
          to run yourself.
        </p>

        <h3>2.1 Agencies and Sub-accounts</h3>
        <p>
          {brand.name} uses a two-level workspace model. An
          &ldquo;Agency&rdquo; is the top-level account (the entity that
          signs up and manages billing); a &ldquo;Sub-account&rdquo; is an
          individual workspace within an Agency (for example, a specific
          business or client). Agency owners can invite members to
          sub-accounts and assign roles. If you are a sub-account member
          invited by an Agency owner, your use of the Service may also be
          subject to that Agency&rsquo;s own policies, and the Agency owner
          &mdash; not DivineX &mdash; controls your access, role, and
          removal from that workspace.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          You must provide accurate, current information when creating an
          account and keep it up to date. You are responsible for
          safeguarding your account credentials and for all activity under
          your account. Notify us promptly of any unauthorized use.
        </p>

        <h2>4. Subscription, Billing &amp; Renewals</h2>

        <h3>4.1 Subscription plans</h3>
        <p>
          Access to {brand.name} (or to certain features within it) requires
          a paid monthly subscription. Available plans, pricing, and
          included features are described on our pricing page and may change
          from time to time; we will provide notice of material price
          changes before they take effect for existing subscribers.
        </p>

        <h3>4.2 Billing</h3>
        <p>
          Subscriptions are billed monthly in advance, through our payment
          processor, Stripe. By subscribing, you authorize us to charge your
          payment method on file for each billing period until you cancel.
        </p>

        <h3>4.3 Renewal &amp; cancellation</h3>
        <p>
          Subscriptions renew automatically each month unless cancelled
          before the renewal date. <strong>You may cancel at any time</strong>{" "}
          through your account billing settings or by contacting support;
          cancellation takes effect at the end of the current billing
          period, and you will retain access until then. See our{" "}
          <Link href="/refund-policy">Refund Policy</Link> for what happens
          to charges already made.
        </p>

        <h3>4.4 Non-payment</h3>
        <p>
          If a payment fails, we will attempt to notify you. You have a{" "}
          <strong>7-day grace period</strong> from the failed payment to
          update your payment method before access is restricted. Your data
          is preserved during this grace period and is not deleted for
          non-payment alone &mdash; access is paywalled, not your data
          destroyed. If payment is not resolved after the grace period, your
          workspace becomes inaccessible until payment is brought current,
          and standard data retention (Section 12) applies from that point
          if you do not resolve it.
        </p>

        <h3>4.5 Refunds</h3>
        <p>
          <strong>No refunds for the current billing period once charged.</strong>{" "}
          When you cancel, you keep access through the end of the period you
          already paid for, and you will not be charged again &mdash; but
          the charge already made for the current period is not refunded.
          See our full <Link href="/refund-policy">Refund Policy</Link> for
          details and exceptions required by law.
        </p>

        <h2>5. Your Responsibilities &amp; Acceptable Use</h2>
        <p>
          You are responsible for the accuracy of the data you enter into{" "}
          {brand.name} and for how you use its communication features
          (email, SMS, voice, AI agents) to contact your own leads and
          customers. You agree to:
        </p>
        <ul>
          <li>
            Comply with applicable law, including data-protection,
            electronic-communications, and consumer-protection law (for
            example, CAN-SPAM, TCPA, and equivalent laws in your
            jurisdiction) for every message, call, or campaign you send
            through the Service;
          </li>
          <li>
            Obtain any consent required before contacting a person by SMS,
            voice, or automated dialing, and honor opt-out requests
            (STOP/START) &mdash; {brand.name} provides opt-out handling and a
            native compliance gate for outbound voice campaigns, but you
            remain responsible for lawful use of these tools;
          </li>
          <li>
            Not use the Service to send unsolicited bulk messages, spam,
            phishing, or content that is unlawful, fraudulent, or
            infringing;
          </li>
          <li>
            Not attempt to circumvent rate limits, security controls, or the
            AI usage safeguards built into the Service;
          </li>
          <li>
            Not use the Service to build a product that competes with{" "}
            {brand.name} using data or access obtained through your account.
          </li>
        </ul>
        <p>
          We may suspend or restrict use of specific features (for example,
          outbound messaging) where we reasonably believe they are being
          used in violation of this section, without that constituting
          termination of your account.
        </p>

        <h2>6. AI-Generated Content</h2>
        <p>
          {brand.name} includes optional AI-powered features (an in-app
          assistant, and AI Agents that can reply to web chat, SMS,
          WhatsApp, and voice calls, and can place outbound calls on your
          behalf when you enable it). These features use third-party AI
          models (see our{" "}
          <Link href="/responsible-ai">Responsible AI Policy</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>) to generate responses.
        </p>
        <p>
          AI-generated content &mdash; including replies sent to your leads
          and customers, summaries, and suggested actions &mdash; may be
          inaccurate, incomplete, or inappropriate for your specific
          situation. You are responsible for reviewing and, where the
          Service requires your confirmation before an action is taken,
          approving AI-suggested actions before they take effect. Do not
          rely on AI-generated output for legal, medical, financial, or
          other advice requiring professional judgment. You are responsible
          for how you configure and deploy AI Agents, including compliance
          with laws governing automated communications and disclosure of AI
          use to the people you contact where required.
        </p>

        <h2>7. Third-Party Integrations</h2>
        <p>
          {brand.name} connects to third-party services to provide its
          features &mdash; for example, payment processing, email and SMS
          delivery, AI model inference, website content analysis, voice
          calling, mapping, and messaging platform connections. A current
          list of these services is in our{" "}
          <Link href="/privacy">Privacy Policy</Link>. Some features require
          you to supply your own account/credentials with a third party (for
          example, a dedicated Twilio number, a connected Meta Page, or a
          PayPal.me username) &mdash; in those cases, you are responsible
          for your relationship with, and any fees owed to, that third
          party. Each third-party service is governed by its own terms; we
          do not control and are not responsible for their availability,
          performance, or pricing. Features that depend on a given provider
          may be degraded or unavailable if that provider is not connected
          or is experiencing an outage.
        </p>

        <h2>8. Intellectual Property</h2>
        <p>
          You retain all rights to the content and data you submit to{" "}
          {brand.name} (&ldquo;Your Data&rdquo;) &mdash; your contacts,
          messages, files, and configuration. You grant DivineX a limited
          license to host, process, and transmit Your Data solely to
          provide the Service to you.
        </p>
        <p>
          DivineX and its licensors retain all rights to the {brand.name}{" "}
          platform itself &mdash; its software, design, and underlying
          technology. Nothing in these Terms transfers ownership of the
          Service to you.
        </p>

        <h2>9. Availability &amp; Security</h2>
        <p>
          We aim to keep {brand.name} available and reliable, but we do not
          guarantee uninterrupted or error-free operation. Scheduled
          maintenance, third-party outages, or unforeseen issues may cause
          downtime. No specific uptime SLA is offered today. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> (Section 7) for how we
          protect your data.
        </p>

        <h2>10. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranties of any kind, express or
          implied, including merchantability, fitness for a particular
          purpose, and non-infringement. We do not warrant that
          AI-generated content will be accurate or that the Service will
          meet your specific requirements.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, DivineX will not be liable
          for any indirect, incidental, special, consequential, or punitive
          damages, or for loss of profits, revenue, data, or goodwill,
          arising from your use of the Service.{" "}
          <strong>
            Our total aggregate liability for any claim will not exceed the
            amount you paid us in the 12 months preceding the claim.
          </strong>
        </p>

        <h2>12. Suspension &amp; Termination</h2>
        <p>
          We may suspend or terminate your access to the Service if you
          materially breach these Terms (including Section 5), fail to pay
          past the 7-day grace period in Section 4.4, or if required by
          law. You may stop using the Service and cancel your subscription
          at any time.
        </p>
        <p>
          Upon cancellation or termination, we retain Your Data for{" "}
          <strong>30 days</strong> to allow for export or reactivation.
          After that period, Your Data is deleted as part of our standard
          account-closure process. To request deletion sooner, or to
          request deletion of your account at any time, contact support
          &mdash; see our <Link href="/privacy">Privacy Policy</Link> for
          details on how to make that request and how deletion is carried
          out.
        </p>

        <h2>13. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the
          updated Terms on this page with a new &ldquo;Last updated&rdquo;
          date, and for material changes we will provide reasonable notice
          (for example, by email or in-app notice). Your continued use of
          the Service after changes take effect constitutes acceptance.
        </p>

        <h2>14. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of Texas, United
          States, without regard to conflict-of-laws principles.
        </p>

        <h2>15. Related Documents</h2>
        <p>
          These Terms should be read together with our{" "}
          <Link href="/privacy">Privacy Policy</Link>,{" "}
          <Link href="/refund-policy">Refund Policy</Link>, and{" "}
          <Link href="/responsible-ai">Responsible AI Policy</Link>.
        </p>

        <h2>16. Contact</h2>
        <p>
          For questions about these Terms,{" "}
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
