# Launch Blocker: Legal Pages Need a SaaS-Appropriate Rewrite

**Status:** Open
**Severity:** Critical — before accepting new paid subscriptions
**Affected routes:** `/terms`, `/privacy`
**Files:** `src/app/(legal)/terms/page.tsx`, `src/app/(legal)/privacy/page.tsx`

## Reason

Both documents describe a self-hosted, one-time-purchase software codebase
license (buy the source, run it yourself, we have no access to your data)
rather than DivineX operating Flow as a hosted subscription SaaS platform
(DivineX hosts the data, bills on a recurring basis, and is the
data controller/processor for customer data). The two models are direct
opposites on several material points — see the full clause-by-clause
breakdown delivered in the RC1.5 verification report (chat history,
2026-07-25) for specifics.

This is not hypothetical: real customer sub-accounts already exist on this
deployment (confirmed live in Firestore) and are currently bound by the
mismatched terms as written.

## Required next action

Replace both documents with SaaS-subscription-appropriate legal content and
obtain legal review before the next new paid signup. Do not treat the
RC1.5 checklist below as legal language to copy — it is a scope list for
whoever drafts the replacement (counsel, or a reviewed SaaS ToS/Privacy
template), not drafted text itself.

## Rewrite checklist (scope only — no language drafted)

- [ ] Reframe from "software license purchase" to "SaaS subscription service"
- [ ] State that DivineX hosts customer data and acts as data controller/processor (not the reverse)
- [ ] Replace one-time-purchase / no-refund / chargeback-on-source-code language with subscription billing terms (renewal, cancellation, data on downgrade/cancel)
- [ ] Remove the PolyForm Perimeter source-code license section — not applicable to a SaaS customer
- [ ] Remove "your responsibility to host/deploy/secure" language — replace with DivineX's actual uptime/security posture as host
- [ ] Add sections currently absent: data retention/deletion on cancellation, sub-processor list (Firebase, Stripe, Twilio, Resend, OpenRouter, etc.), incident/breach notification, real subscription refund/cancellation policy
- [ ] Correct who "the customer" is throughout — end-users of Flow, not developers buying a codebase
- [ ] Legal counsel review before relying on either document

## Explicitly not done here

No legal language has been drafted or modified. `/terms` and `/privacy`
remain untouched pending this rewrite.
