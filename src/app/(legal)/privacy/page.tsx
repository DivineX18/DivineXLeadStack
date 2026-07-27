import Link from "next/link";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How DivineX collects, uses, and protects information in connection with Flow, our hosted Growth Operations Platform.",
};

/**
 * Public Privacy Policy. Describes Flow as the hosted SaaS it actually is —
 * DivineX hosts customer data and acts as processor for it, replacing an
 * earlier version that incorrectly claimed "we have no access to that
 * data." Every factual claim below (cookies, subprocessors, AI data flow)
 * was verified directly against the codebase and live production, not
 * assumed. Legal entity name and governing jurisdiction intentionally not
 * asserted — see Section 14 — pending confirmation from DivineX.
 */
export default async function PrivacyPage() {
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
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: July 26, 2026
        </p>

        <h2>1. Scope</h2>
        <p>
          This Privacy Policy describes how Jade&rsquo;s Gems &amp;
          SOULutions LLC, doing business as DivineX (&ldquo;DivineX,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects,
          uses, and protects information in connection with {brand.name},
          our hosted Growth Operations Platform, and our marketing website.
        </p>
        <p>
          {brand.name} is a hosted service: we host your workspace and your
          data on infrastructure we operate (through the subprocessors
          listed in Section 8). If you are a business using {brand.name} to
          manage your own customers or leads, you (or your organization) are
          generally the data controller for that customer/lead data, and
          DivineX acts as a data processor on your behalf for that data
          &mdash; while we are the controller for your own account
          information (Section 2 below).
        </p>

        <h2>2. Information We Collect</h2>

        <h3>2.1 Account information</h3>
        <p>
          When you create an account, we collect your name, email address,
          and (through our payment processor) billing information. Firebase
          Authentication is used to manage sign-in; we do not store your
          password directly &mdash; Firebase handles credential storage.
        </p>

        <h3>2.2 Customer/contact data you store in {brand.name}</h3>
        <p>
          {brand.name} lets you store and manage data about your own leads
          and customers &mdash; names, emails, phone numbers, notes,
          deal/pipeline information, calendar events, form submissions, and
          similar business records you or your team enter or import. This
          data is yours; we process it to provide the Service.
        </p>

        <h3>2.3 Communications sent and received through {brand.name}</h3>
        <p>
          If you use {brand.name}&rsquo;s email, SMS, WhatsApp, voice, or web
          chat features, we store the content of those messages/calls (and
          metadata such as timestamps and delivery status) so you can see
          your own conversation history. This includes:
        </p>
        <ul>
          <li>
            <strong>AI conversation content</strong> &mdash; if you enable an
            AI Agent (web chat, SMS, WhatsApp, voice) or use the in-app AI
            assistant, the messages exchanged are stored in our database,
            and the message content is sent to our AI model provider
            (OpenRouter) to generate a reply. Voice calls are additionally
            processed by our voice AI provider (Vapi), which converts speech
            to text and back and provides call summaries/transcripts that we
            store. See our{" "}
            <Link href="/responsible-ai">Responsible AI Policy</Link> for
            more on how these features work.
          </li>
          <li>
            Web chat sessions are tied to a session identifier stored in the
            visitor&rsquo;s browser (see Section 4) rather than to a login,
            until/unless the visitor provides their name, email, or phone
            during the conversation.
          </li>
        </ul>

        <h3>2.4 Files you upload</h3>
        <p>
          Most of {brand.name} does not involve file uploads. Where it does
          &mdash; currently, profile/cover images for the Community feature
          (group and course cover images, member avatars) &mdash; uploaded
          files are stored via Firebase Storage.
        </p>

        <h3>2.5 Location information</h3>
        <p>
          When someone submits a public hosted form, we derive an
          approximate location (city-level, from IP address via a
          third-party lookup service) and, as a fallback, a country-level
          location from the phone number&rsquo;s country code, to power
          features like the leads map. This is best-effort and may be null.
        </p>

        <h3>2.6 Website usage</h3>
        <p>
          When you visit our marketing site or use the app, we may collect
          basic technical information (IP address, browser type, pages
          viewed) through standard server logs.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We use the information above to: provide and operate the Service;
          process your subscription and payments; deliver the
          messages/calls/automations you configure; generate AI responses
          where you&rsquo;ve enabled AI features; provide customer support;
          maintain security and prevent abuse; and communicate with you
          about the Service. We do not sell your personal information.
        </p>

        <h2>4. Cookies</h2>
        <p>
          {brand.name} uses a small number of functional cookies, all
          necessary for the Service to work &mdash; we do not use
          advertising or cross-site tracking cookies:
        </p>
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Purpose</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>__session</code>
              </td>
              <td>Signed-in session (Firebase auth)</td>
              <td>~12 days</td>
            </tr>
            <tr>
              <td>Community member session</td>
              <td>Signed-in session for the Community feature</td>
              <td>~30 days</td>
            </tr>
            <tr>
              <td>SSO handoff cookies</td>
              <td>
                Short-lived, used only during the Ascend&rarr;{brand.name}{" "}
                sign-in handoff
              </td>
              <td>Seconds to 30 seconds, then cleared</td>
            </tr>
          </tbody>
        </table>
        <p>
          We also use <code>localStorage</code> (not a cookie, but similar
          in effect) for a few non-sensitive purposes: remembering an
          anonymous web-chat visitor&rsquo;s session ID, whether
          you&rsquo;ve dismissed certain in-app banners, and your
          conversation-view theme preference.
        </p>

        <h2>5. Analytics &amp; Tracking</h2>
        <p>
          <strong>
            We do not currently use any analytics, advertising, or tracking
            technology on {brand.name}.
          </strong>{" "}
          No analytics SDK, advertising pixel, session-replay tool, or
          error-monitoring service is active in production today. The
          platform has the underlying capability to optionally enable Meta
          (Facebook) Pixel, Google Tag Manager, and live chat in the future;
          if any of these are switched on, we will update this Privacy
          Policy first to describe what they collect before they go live.
        </p>

        <h2>6. Payment Processing</h2>
        <p>
          {brand.name}&rsquo;s own subscription billing (what you pay
          DivineX to use the Service) is processed by Stripe; we do not
          store your full card number ourselves.
        </p>
        <p>
          Separately, {brand.name} lets you (as a subscriber) invoice and
          collect payment from <em>your own</em> customers, using either
          your PayPal.me link or a Stripe payment option tied to this
          deployment&rsquo;s Stripe account. DivineX is not a party to those
          downstream payments between you and your customers, and is not
          responsible for disputes arising from them &mdash; but because
          card payments there run through the same shared Stripe account,
          that transaction data is processed by Stripe on our behalf as
          well.
        </p>

        <h2>7. Data Storage &amp; Security</h2>
        <p>
          Your data is stored using Firebase/Firestore and Firebase Storage
          (Google Cloud infrastructure), secured with authentication,
          per-workspace access rules, and encryption in transit (HTTPS) and
          at rest (as provided by Google Cloud). Workspace isolation is
          enforced at the data layer, not just the UI &mdash; one
          workspace&rsquo;s data is never readable by another
          workspace&rsquo;s users. Sensitive tokens (API keys, webhook
          secrets) are hashed or encrypted before storage. No security
          measure is perfect, and we cannot guarantee absolute security.
        </p>

        <h2>8. Third-Party Processors</h2>
        <p>
          Depending on which features you use, the following third parties
          may process data on our behalf:
        </p>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Purpose</th>
              <th>Data involved</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Firebase / Google Cloud</td>
              <td>Database, authentication, file storage</td>
              <td>All account and customer data</td>
            </tr>
            <tr>
              <td>Render</td>
              <td>Application hosting</td>
              <td>All data that passes through the application at runtime</td>
            </tr>
            <tr>
              <td>Stripe</td>
              <td>Payment processing</td>
              <td>Billing/payment details</td>
            </tr>
            <tr>
              <td>Twilio</td>
              <td>SMS, WhatsApp, and voice number provisioning</td>
              <td>Phone numbers, message/call content</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Transactional and bulk email delivery</td>
              <td>Email addresses, message content</td>
            </tr>
            <tr>
              <td>OpenRouter</td>
              <td>AI model inference (text)</td>
              <td>AI conversation content</td>
            </tr>
            <tr>
              <td>Vapi</td>
              <td>AI voice call handling</td>
              <td>Call audio, transcripts</td>
            </tr>
            <tr>
              <td>Deepgram</td>
              <td>Speech-to-text for AI voice calls, via Vapi</td>
              <td>Call audio (voice channel only)</td>
            </tr>
            <tr>
              <td>ElevenLabs</td>
              <td>Text-to-speech for AI voice calls, via Vapi</td>
              <td>AI-generated call audio (voice channel only)</td>
            </tr>
            <tr>
              <td>Firecrawl</td>
              <td>Optional website content scraping (AI knowledge base)</td>
              <td>Public website content you point it at</td>
            </tr>
            <tr>
              <td>Meta (Facebook/Instagram)</td>
              <td>Optional inbox + social posting integration</td>
              <td>Message content, connected Page data</td>
            </tr>
            <tr>
              <td>Mapbox</td>
              <td>Map rendering (leads map, booking)</td>
              <td>Approximate location data</td>
            </tr>
            <tr>
              <td>ipapi.co</td>
              <td>IP-based geolocation on form submissions</td>
              <td>IP address</td>
            </tr>
            <tr>
              <td>Web push provider (VAPID)</td>
              <td>Optional browser push notifications</td>
              <td>Push subscription endpoint</td>
            </tr>
          </tbody>
        </table>
        <p>
          Deepgram and ElevenLabs are Vapi&rsquo;s own default providers for
          the voice channel (speech-to-text and text-to-speech,
          respectively) &mdash; we don&rsquo;t connect to them directly, but
          voice call audio passes through them as part of how Vapi delivers
          the feature. Each provider processes only what&rsquo;s needed for
          the feature it powers, and features requiring a given provider are
          unavailable if it isn&rsquo;t configured.
        </p>

        <h2>9. Data Retention</h2>
        <p>
          We retain your account and customer data for as long as your
          account is active.{" "}
          <strong>
            If you cancel or your account is terminated, we retain Your Data
            for 30 days
          </strong>{" "}
          to allow for export or reactivation. After that period, Your Data
          is deleted from our production systems as part of our standard
          account-closure process.
        </p>

        <h2>10. Data Deletion &amp; Your Rights</h2>
        <p>
          You can delete individual contact records yourself from within the
          app at any time.{" "}
          <strong>
            Full account or workspace deletion is handled by support
            request
          </strong>{" "}
          &mdash; contact us to request deletion of your account or data,
          and we will act on verified requests. Depending on your location,
          you may have rights to access, correct, or delete your personal
          information, or to receive a copy of it, under applicable law (for
          example, GDPR or CCPA where they apply). Contact us to exercise
          these rights.
        </p>

        <h2>11. Children&rsquo;s Privacy</h2>
        <p>
          {brand.name} is a business tool and is not directed at, or
          intended for use by, children. We do not knowingly collect
          personal information from children under 13 (or the relevant
          minimum age in your jurisdiction). If you believe a child has
          provided us with personal information, contact us and we will
          delete it.
        </p>

        <h2>12. Related Documents</h2>
        <p>
          This Privacy Policy should be read together with our{" "}
          <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/responsible-ai">Responsible AI Policy</Link>.
        </p>

        <h2>13. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post
          the updated policy on this page with a new &ldquo;Last
          updated&rdquo; date and, for material changes &mdash; including
          turning on any new tracking technology (Section 5) &mdash;
          provide reasonable notice before the change takes effect.
        </p>

        <h2>14. Governing Law</h2>
        <p>
          This Policy is governed by the laws of the State of Texas, United
          States, without regard to conflict-of-laws principles.
        </p>

        <h2>15. Contact</h2>
        <p>
          For questions about this Privacy Policy or to exercise your data
          rights,{" "}
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
