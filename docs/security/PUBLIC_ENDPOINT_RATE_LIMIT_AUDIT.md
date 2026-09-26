# Public endpoint audit: spoofable client IP and rate limiting

Date: 2026-09-26. Repo: DivineXLeadStack (Flow), worktree at HEAD `7de43df`.
Scope: every public route that derives a client identity from `X-Forwarded-For` (XFF) / `X-Real-IP`, plus other routes that trust client-supplied forwarding headers. Read-only review; no production traffic was generated. Nothing here was exercised at runtime; all findings are from reading the code.

## Severity scale used in this document

- CRITICAL: unauthenticated exploitation exposes private data or moves money with no further prerequisite.
- HIGH: an unauthenticated request can cause durable state change, real-world side effects (email to third parties, payments) or tenant-wide denial of service, and the only per-caller control is spoofable.
- MEDIUM: the spoofable limiter is the only thing standing between an anonymous caller and a paid third-party API call, a mail send to the platform inbox, or unbounded reads/writes.
- LOW: the impact is inflated metrics or self-inflicted only.

"Bypass" below means: send a different `X-Forwarded-For: <anything>` value on every request, so each request lands in a fresh per-IP bucket.

## Summary

| # | Route | Severity | One-line reason |
|---|---|---|---|
| 1 | `GET /api/booking/[saId]/[slug]/availability` | MEDIUM | Query window is not clamped to the page horizon, so each call can read every event of the tenant; the only per-caller cap is spoofable. |
| 2 | `POST /api/booking/[saId]/[slug]/book` | HIGH | Anonymous durable writes plus a confirmation email to an attacker-chosen address from the shared platform sender; junk requests can lock a tenant out of booking. |
| 3 | `POST /api/lp/[funnelId]/track` | MEDIUM | Anonymous counter writes into tenant stats docs, and attacker-chosen `step` keys are stored as map keys without any allowlist. |
| 4 | `POST /api/lp/[funnelId]/upsell/[sectionId]/charge` | HIGH | Unauthenticated off-session card charge whose only credential is a URL-borne Checkout Session id; no server-side check that the order is paid, belongs to this funnel, or has not already accepted this upsell. |
| 5 | `POST /api/lp/[funnelId]/checkout/session` | MEDIUM | Each call makes a live Stripe API call on the tenant's own account; the spoofable limiter is the only control and its bucket map is never pruned. |
| 6 | `POST /api/public/contact` | MEDIUM | Each call sends an email through the platform Resend key; spoofable limiter is the only control. Recipient is fixed, so it is not a relay. |
| 7 | `POST /api/public/checkout` | MEDIUM | Each call makes a live Stripe API call on the platform Stripe account plus Firestore reads; spoofable limiter is the only control. |

No CRITICAL findings. Two HIGH findings (#2, #4). Routes 1, 3 and 5 also contain issues that are independent of the limiter and are listed in "Immediate remediation candidates".

## Reference: the fix already applied

Hosted forms (commit `7de43df`, `src/app/api/forms/[id]/submit/route.ts:137-138` calls `resolveFormClientIp(request.headers)` from `src/lib/forms/client-ip.ts`) and web chat (commit `d0d25f6`, `trustedClientIp(request.headers)` from `src/lib/comms/web-chat/client-ip.ts`, called at `src/app/api/web-chat/message/route.ts:106` and `src/lib/comms/web-chat/guard.ts:83`).

What the fix does:

1. Web chat (`src/lib/comms/web-chat/client-ip.ts:14-21`): return `CF-Connecting-IP` if present (truncated to 64 chars). Only when `NODE_ENV !== "production"` fall back to the first XFF entry. Otherwise return `"unknown"`.
2. Forms (`src/lib/forms/client-ip.ts:41-66`), in order of trust:
   - A visitor IP attested by a trusted proxy: headers `x-divinex-client-ip`, `x-divinex-client-ip-ts`, `x-divinex-client-ip-sig` (`ATTEST_HEADERS`, lines 29-33). Honoured only when `FORMS_PROXY_SECRET` is set and at least 16 chars, the IP passes `isIP`, the timestamp is within 5 minutes (`MAX_SKEW_SECONDS`, line 27), and the HMAC-SHA256 over `forms-client-ip-v1|<ip>|<ts>` matches by `timingSafeEqual`. This exists because the divinex.io website forwards submissions server-to-server, so Flow otherwise only sees the website's own address.
   - `CF-Connecting-IP`, validated with `isIP`.
   - Development only: first XFF entry, validated with `isIP`.
   - Otherwise `"unknown"`.
3. The forms fix also feeds the same value to geolocation (the old code used `ipFromRequest` for the contact's location).

Assumptions the fix relies on, which this audit could NOT verify from code:

- UNKNOWN: that every production request reaches Flow through Cloudflare, and that the origin (Render service URL) is not directly reachable. If the origin is directly reachable, a caller can send its own `CF-Connecting-IP` and the fix is bypassed the same way. This is a deployment question (origin lock to Cloudflare IPs or authenticated origin pulls), not a code question.
- Limiters remain in-memory per instance (see each section), so the fix hardens the key but does not make the cap global.

Suggested reuse for the remaining routes: the web-chat helper is the smaller change (one function, no secret). `trustedClientIp` lives under `src/lib/comms/web-chat/`; a neutral shared copy (for example `src/lib/http/client-ip.ts`) would avoid importing from the chat module, but that is a naming choice, not a requirement. Same-origin browser calls (booking pages, funnel pages, pricing page on the Flow host) are proxied by Cloudflare and need no attestation. Only calls forwarded server-to-server from another host (as divinex.io does for forms) need the signed-header path. Whether divinex.io forwards to any of the routes below is UNKNOWN.

## Shared facts (apply to every section)

- Public status: confirmed in `src/middleware.ts` `PUBLIC_PATHS`. `/api/lp` (line 132), `/api/booking` (line 150), `/api/public` (line 194) are prefix entries matched by `pathname === path || pathname.startsWith(path + "/")` in `isPublicPath` (lines 248-257). Middleware is therefore a pass-through for all seven routes. The `handleInvalidToken` and `handleError` paths also return `NextResponse.next()` for public paths (lines 442-466).
- `handleValidToken` sets `x-user-uid` (line 412). None of the seven routes read it.
- Limiter storage: every limiter below is an in-memory `Map` in the Node process. Limits are per instance, reset on deploy or restart, and multiply with instance count. None is persistent. (Web chat, by contrast, has a persistent hashed-IP limiter, `src/lib/comms/web-chat/usage-limits.ts:165`.)
- Whether the platform runs more than one instance: UNKNOWN.

---

## 1. `GET /api/booking/[saId]/[slug]/availability`

File: `src/app/api/booking/[saId]/[slug]/availability/route.ts`

- Purpose: return open slots for a published booking page.
- Public: yes (`/api/booking` in `PUBLIC_PATHS`).
- Authentication: none. Credential is knowledge of `saId` + `slug`. Draft and missing pages both return 404 (lines 80-86).
- Rate limit: local in-memory `ipHits` Map (line 33), per IP only, `HOURLY_CAP = 120` per rolling hour (lines 31-51), map capped at 5000 keys by evicting the first-inserted key (lines 46-49). No per-page or per-sub-account cap.
- Spoofable header use: `getClientIp` (lines 53-59) returns the first XFF entry verbatim, else `x-real-ip`, else `"unknown"`. Called at line 67 before any other work. Any value, including non-IP strings, is accepted.
- Potential abuse:
  - Bypass gives unlimited calls. Each call performs one Firestore page read (line 75) and one `events` query (lines 131-136).
  - The query window is attacker-controlled: `from` and `to` are parsed at lines 92-98 and used to build `horizonEnd` (line 117) and `queryFrom` (lines 123-125) with no clamp. The `visibleDays` clamp exists only later, inside `computeAvailability` (`src/lib/booking/availability.ts:176-187`) and applies to slot computation, not to the Firestore query. A caller sending `from=1970-01-01&to=9999-12-31` makes the query read every event with `subAccountId == saId` in that range (all event types, not only booking-page events), then loops over them in memory (lines 138-152). Read cost scales with the tenant's event count per request.
  - Rotating map keys via spoofed XFF churns the LRU at line 46-49 and evicts other visitors' counters (they get more headroom, not less).
- Handles money: no.
- Exposes private data: no PII. Response is `{ ok, slots, timezone, durationMinutes }` (lines 214-222). It does reveal the free/busy pattern of the whole sub-account calendar (busy events are not limited to this page, line 131-136), which is inherent to the feature. `excludeEventId` (line 95, 143) lets a caller who already knows an event id see that event's slot as free; event ids are Firestore auto ids, so this discloses nothing without the id.
- Mutation: none.
- Severity: MEDIUM. The unclamped query window is a code-level cost amplifier, and the only per-caller cap is spoofable.
- Remediation:
  1. Clamp `queryFrom` and `horizonEnd` to `[now - lookback, now + page.visibleDays days]` before the Firestore query (same clamp `computeAvailability` applies later).
  2. Replace `getClientIp` with the trusted-IP helper.

## 2. `POST /api/booking/[saId]/[slug]/book`

File: `src/app/api/booking/[saId]/[slug]/book/route.ts`

- Purpose: create a booking (Firestore `events` doc, contact, confirmation email, reminders, automation trigger).
- Public: yes (`/api/booking`).
- Authentication: none. Credential is knowledge of `saId` + `slug`; page must be `published` (lines 194-200).
- Rate limit: two local in-memory Maps, both rolling one hour (lines 74-100):
  - per IP `ipHits`, `IP_HOURLY_CAP = 10`, keyed by `getClientIp`.
  - per sub-account `subHits`, `SUB_HOURLY_CAP = 100`, keyed by the `saId` path segment (not spoofable, but the segment is attacker-chosen, so it also creates map entries for non-existent tenants).
  - Both caps are consumed at lines 129-140, before body parse, validation and page lookup, so invalid requests count.
  - Maps are bounded at 5000 keys by evicting the first-inserted key (lines 95-98).
- Spoofable header use: `getClientIp` (lines 102-106), first XFF entry verbatim, else `x-real-ip`, else `"unknown"`, used at line 128 as the IP bucket key.
- Potential abuse:
  - IP cap bypass: one client can drive the tenant cap (100/hour per instance) instead of 10/hour.
  - Tenant-wide booking lockout: because the sub-account cap (lines 135-140) is consumed by any request including malformed ones, 100 junk POSTs per hour from one spoofing client make every real visitor receive `429 "Booking page is busy"`. Without spoofing the attacker needs about ten distinct source IPs.
  - Calendar squatting: each successful POST occupies a real slot (transaction at lines 281-442). On payment pages the hold lasts `page.payment.holdHours` (lines 380-382, status `awaiting_payment`). Slot must match a computed slot exactly (`isSlotAvailable`, `src/lib/booking/availability.ts:360-369`), so the client cannot invent times or lengths.
  - Third-party email: `email` is attacker-supplied and only regex-checked (lines 108, 158). A confirmation or payment-pending email goes to it (lines 468-535) using `workspaceSender(sub)`, which falls back to the shared platform `EMAIL_FROM` (`src/lib/comms/resend.ts:102-123`) and the shared `RESEND_API_KEY` (line 683-684). The attacker controls the greeting first-word (`name`, `src/lib/booking/email.ts:76`, HTML-escaped) and the victim receives an ICS attachment (confirmed bookings only). This is a spam vector from the tenant or platform identity, bounded only by the caps above.
  - Contact and automation side effects: creates or reuses a contact by email (`reconcileBookingContact`, called at lines 357-364), fires `contact.created` for new ones (`src/lib/booking/contact-reconcile.ts`, the `emitContactCreatedById` call), then `event_booked` trigger and outbound webhook (lines 567-580). What tenant workflows do on those triggers is tenant-configured: UNKNOWN.
  - Existing contacts are not overwritten: only missing `name`/`phone` are filled (contact-reconcile.ts, the `patch` block).
- Handles money: not directly. It does not charge. When the page requires payment and the sub-account has PayPal configured, it builds a PayPal amount link from server-side page config (lines 241, 374-379) and returns it. The amount is not client-controlled. Payment confirmation is out of band ("mark-paid" comment at line 537-538): UNKNOWN whether it is verified automatically.
- Exposes private data: no. Response returns the event id, status, a manage URL containing the raw token for the event just created, and the page's own confirmation text (lines 603-611). The token is minted per event (line 387), so it does not expose other bookings.
- Mutation: yes. Creates `events/{id}` (line 429), creates or updates a `contacts` doc, sends email, schedules QStash reminders (lines 539-555), writes an activity record (558-566), fires trigger and webhook.
- Severity: HIGH. Anonymous callers can cause durable writes and third-party email at a rate the spoofable limiter does not actually bound, and can lock a tenant out of its own booking page.
- Remediation:
  1. Replace `getClientIp` with the trusted-IP helper.
  2. Move the per-sub-account increment to after validation and page lookup (so malformed requests do not consume the tenant budget), or count only successful bookings against `SUB_HOURLY_CAP`.
  3. Consider a per-recipient-email cap (for example one confirmation per email per page per hour) since the email address is the third-party surface. Small change, same in-memory pattern.

## 3. `POST /api/lp/[funnelId]/track`

File: `src/app/api/lp/[funnelId]/track/route.ts`; limiter and writer in `src/lib/funnels/telemetry.ts`.

- Purpose: funnel view/submission telemetry beacon.
- Public: yes (`/api/lp`).
- Authentication: none. `funnelId` is the credential. Funnel must be `published` (`isPubliclyRenderable`, lines 54-58). Route always returns 204 and swallows errors (lines 24, 80-83).
- Rate limit: `checkBeaconRateLimit(ip)` (`telemetry.ts:49-62`), in-memory `beaconBuckets`, `BEACON_HOURLY_LIMIT = 240` per IP per hour (line 45). Pruning of expired entries happens only when the map exceeds 5000 keys (line 56), so live entries are never evicted: the map grows without bound within one hour under key rotation.
- Spoofable header use: lines 31-35 take the first XFF entry, else `x-real-ip`, else `"unknown"`, and pass it to the limiter at line 36. The rate-limit check happens before body parse and before the Firestore read.
- Potential abuse:
  - View/submission inflation. The route's own comment accepts "a wrong number in a marketing dashboard" (lines 9-12), but bypass removes the 240/hour bound entirely. Each accepted call does one funnel doc read (line 54) and two Firestore writes (`ref.set` rollup and `dayRef.set`, `telemetry.ts:132-133`). `submissions` is a conversion metric; UNKNOWN whether recommendation logic consumes it.
  - Unbounded map-key creation: `body.step` is only length-capped at 300 chars (route line 61, 68) and is written as a map key `steps: { [input.step]: totals }` in the day doc (`telemetry.ts:139`). No allowlist. Distinct attacker-chosen values create distinct nested fields in `funnelStats/{funnelId}/days/{day}`. Firestore's documented per-document size and index-entry limits are the only bound; the practical number of requests to wedge a day doc was not tested (UNKNOWN). Failure is swallowed (route line 80), so a wedged day doc would silently drop that day's stats.
  - `campaignId` comes from the stored funnel, not the request (route line 67), so it cannot be forged.
- Handles money: no.
- Exposes private data: no. Returns 204 unconditionally.
- Mutation: yes, counters and map keys in `funnelStats/{funnelId}` and `funnelStats/{funnelId}/days/{day}` for a tenant's published funnel. Funnel ids are visible in public `/lp/<id>` URLs.
- Severity: MEDIUM. Beyond inflating counts, the unbounded attacker-chosen `step` key lets an anonymous caller add arbitrary structure to a tenant's stats document.
- Remediation:
  1. Replace the IP derivation with the trusted-IP helper.
  2. Restrict `step` to a known charset and short length (or to the step ids actually present on the funnel) before `recordFunnelEvent`; drop the field otherwise.

## 4. `POST /api/lp/[funnelId]/upsell/[sectionId]/charge`

File: `src/app/api/lp/[funnelId]/upsell/[sectionId]/charge/route.ts`

- Purpose: one-click upsell or downsell accept. Charges the buyer's saved card off-session on the tenant's own Stripe account.
- Public: yes (`/api/lp`).
- Authentication: none. The only credential is `checkoutSessionId` in the JSON body (lines 26-28, 51-53). The legitimate client reads it from the page URL query string `session_id` (`src/components/funnels/sections/upsell-offer-section.tsx:36-42`), and the server builds every next-step URL with it appended as `?session_id=...` (route line 93; `checkout/session/route.ts:79`). It is a bearer credential that travels in page URLs. Whether third-party scripts on funnel pages can read it: UNKNOWN (depends on tenant-added scripts).
- Rate limit: `checkCheckoutRateLimit(ip)` (`src/lib/funnels/checkout-rate-limit.ts`), in-memory `ipBuckets`, `PER_IP_HOURLY_LIMIT = 20` per hour (line 11). The same module-level Map serves this route and route 5, so they share one bucket per IP. The Map is never pruned: entries are only added or replaced (line 40), no size cap or eviction anywhere in the file.
- Spoofable header use: `ipFromRequest(request) ?? "unknown"` at line 36, which returns the first XFF entry, else `x-real-ip` (`src/lib/contacts/location.ts:281-289`). Used only as the limiter key.
- Potential abuse:
  - Amount is server-side (`config.priceCents`, line 108) and currency comes from config or the order (line 109), so the caller cannot choose a price. The request can only trigger the charge of an upsell section that exists on a published funnel.
  - No paid-status check. The order is loaded by `stripeCheckoutSessionId` (lines 65-69) and only `subAccountId` equality, customer id and payment-method presence are checked (lines 76-84). `order.status` is never read, so an order in `refunded`, `partially_refunded` or `disputed` (`src/types/funnel-orders.ts`, `FunnelOrderStatus`) can still be charged.
  - No funnel-chain check. `order.funnelId` and `order.sectionId` are never compared to the `funnelId` and `sectionId` in the URL. Any published `upsell_offer` section belonging to the same sub-account can be charged against any of that sub-account's orders, not only the upsell configured after the checkout the buyer completed.
  - No server-side "already accepted" check. `order.upsells` is written (lines 126-133, 141-148) but never read before charging. The only duplicate protection is the Stripe idempotency key `funnel-upsell:<sessionId>:<sectionId>` (line 105). Per Stripe's documentation, idempotency keys can be pruned after 24 hours (documentation claim, not verifiable from this code); a replay after that window would be a fresh PaymentIntent, and the route would record a second `accepted` entry.
  - Charge integrity: if the charge succeeds but the subsequent Firestore update or webhook emission throws, the catch block (lines 159-178) records `failed_requires_action` and tells the client the card could not be charged, although the card was charged. This is a correctness defect, not attacker-controlled, and is listed for completeness.
  - Bypass of the 20/hour cap: allows unlimited Firestore queries with guessed session ids (each returns 404 before Stripe is touched, line 70-72) and unlimited attempts against a known session id. Real `cs_...` ids are not guessable, so the spoofable limiter is not what protects the charge; the missing server-side checks above are.
- Handles money: yes. Creates a live off-session PaymentIntent with `confirm: true` on the tenant's Stripe account (lines 106-123).
- Exposes private data: no. Response contains only `ok`, `requiresAction`, and a `nextUrl` that echoes the caller's own `checkoutSessionId` (lines 91-96, 134-138, 158, 173-177). No customer fields are returned.
- Mutation: yes. Stripe charge; `funnelOrders.upsells` append and `updatedAt` (lines 126-148); `funnel.upsell.accepted` webhook (150-156).
- Severity: HIGH. It is an unauthenticated route that can create a real charge against a saved card, and the server-side gates that would limit it to the buyer's own paid order and intended upsell chain are missing.
- Remediation (small, local):
  1. Require `order.status === "paid"` before charging.
  2. Require `order.funnelId` (or the funnel's declared upsell chain) to be consistent with the requested `funnelId`/`sectionId`; at minimum reject when the requested section is not referenced by the order's checkout section (`config.upsellFunnelId` chain).
  3. Refuse when `order.upsells` already contains an `accepted` entry for this `funnelId` (do the check and append in a Firestore transaction).
  4. Replace `ipFromRequest` with the trusted-IP helper.
  5. Prune or cap `ipBuckets` in `checkout-rate-limit.ts` (see Immediate remediation candidates, item 4).

## 5. `POST /api/lp/[funnelId]/checkout/session`

File: `src/app/api/lp/[funnelId]/checkout/session/route.ts`

- Purpose: create a Stripe Checkout Session on the tenant's own Stripe account and return the hosted-page URL.
- Public: yes (`/api/lp`).
- Authentication: none. `funnelId` (and optional `sectionId` in the body) is the credential; funnel must be published (`loadFunnelForRender`, `src/lib/funnels/load-funnel-for-render.ts`, uses `isPubliclyRenderable`).
- Rate limit: `checkCheckoutRateLimit(ip)`, in-memory, 20 per IP per hour, shared bucket with route 4, never pruned (see section 4).
- Spoofable header use: `ipFromRequest(request) ?? "unknown"` at line 32; used only as limiter key. Redirect URLs are built from `NEXT_PUBLIC_APP_URL` (line 73), not from request headers, so there is no header-controlled redirect here.
- Potential abuse:
  - Line items are fixed: price id from stored config, `quantity: 1`, optional bump from stored config (lines 92-101). The caller can only choose which `checkout` section of a published funnel to use (lines 54-60), so no price or quantity manipulation is possible.
  - Bypass allows unbounded `checkout.sessions.create` calls on a tenant's Stripe key (line 92). The limiter's own header comment names this exact risk ("could both rack up API usage and spam Checkout Session creation", `checkout-rate-limit.ts:4-6`). Effects on the tenant's Stripe API rate limit and dashboard clutter are plausible; whether they would degrade that tenant's real checkouts is UNKNOWN.
  - Each call also loads the funnel and its forms and workflows from Firestore before the Stripe call.
  - Memory growth: spoofed keys are added to `ipBuckets` and never removed (section 4).
- Handles money: creates checkout sessions but moves no money without the buyer completing payment on Stripe. Subscription and `setup_future_usage: "off_session"` are set from stored config (lines 93, 102-104).
- Exposes private data: no. Returns only the Stripe-hosted URL.
- Mutation: creates a Stripe Checkout Session (external). No Firestore writes.
- Severity: MEDIUM. The limiter is the only control on paid third-party API calls made against a tenant's account.
- Remediation: trusted-IP helper; prune or cap `ipBuckets`; optionally add a per-funnel hourly cap (in-memory, same pattern) so one funnel cannot drive unlimited calls on its tenant's Stripe key regardless of caller IP.

## 6. `POST /api/public/contact`

File: `src/app/api/public/contact/route.ts`; limiter `src/lib/public-contact-rate-limit.ts`.

- Purpose: marketing contact form; emails the resolved brand's support address.
- Public: yes (`/api/public` in `PUBLIC_PATHS`; the `/contact` page prefix is also public).
- Authentication: none. Only controls are the per-IP limiter and a honeypot field `_confirm` (lines 34-37). No CAPTCHA.
- Rate limit: `checkContactFormRateLimit(ip)` (`public-contact-rate-limit.ts:21-51`), in-memory `ipBuckets`, `PER_IP_HOURLY_LIMIT = 10` per hour (line 13). Expired entries are pruned only when the map exceeds 5000 keys (line 39), so live entries are never evicted within the window.
- Spoofable header use: line 16, `req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"`, no `x-real-ip` fallback. Used as the limiter key at line 17.
- Potential abuse:
  - Bypass gives unlimited emails to the support inbox through the shared `RESEND_API_KEY` and `EMAIL_FROM` (`src/lib/comms/resend.ts:11, 148`). The email `To` is fixed to `brand.supportEmail` (line 60), so the endpoint cannot be used to email third parties. `replyTo` is the caller-supplied `email` (line 61), validated only by `includes("@")` (line 48), so a support agent replying goes to whatever address the sender typed.
  - `name` (up to 200 chars) is placed in the subject line (line 62). Whether the Resend API rejects or normalises CR/LF in `subject`: UNKNOWN.
  - Because the API key and sender are shared platform-wide (the same variables are used by other routes' email, for example booking confirmations, `book/route.ts:468-535, 683-686`), a large enough flood would consume that shared sending quota. Provider plan limits: UNKNOWN.
- Handles money: no.
- Exposes private data: no. Returns `{ ok: true }` or a generic error (lines 68-74).
- Mutation: sends one email per call. No Firestore write.
- Severity: MEDIUM. Spoofable limiter is the only control on outbound email cost and inbox flooding, but recipient is fixed and no data is exposed.
- Remediation: trusted-IP helper (reuse the same helper, add the `x-real-ip` behavior only in dev); add a small global hourly cap on the route (single counter) so total sends are bounded regardless of IP; keep the honeypot.

## 7. `POST /api/public/checkout`

File: `src/app/api/public/checkout/route.ts`; limiter `src/lib/public-signup/rate-limit.ts`; service `src/lib/server/public-signup-service.ts`.

- Purpose: pricing-page "Get started" button; creates a Stripe Checkout Session (subscription mode) on the platform's own Stripe account and returns its URL.
- Public: yes (`/api/public`).
- Authentication: none. Body `planId` is validated server-side: plan doc must exist under the single resolved agency, `status === "active"` and `publicSelfServeEnabled === true`, and have a `stripePriceId` (`public-signup-service.ts:168-178`).
- Rate limit: `checkAndCount(ip)` (`src/lib/public-signup/rate-limit.ts`), in-memory `ipBuckets`, `PER_IP_HOURLY_LIMIT = 10` per hour (line 13), prunes only expired entries when the map exceeds 5000 keys (line 47).
- Spoofable header use: `getClientIp` (route lines 15-19) first XFF entry, else `x-real-ip`, else `"unknown"`; used at line 56 as limiter key. Additionally, `x-forwarded-proto` (line 49) is interpolated unvalidated into the Stripe success/cancel URLs, but only after the `Host` header matches a known own host (lines 42-48). A caller can therefore set the scheme of URLs in their own Checkout Session only; there is no effect on other users. LOW.
- Potential abuse:
  - Bypass gives unlimited `checkout.sessions.create` calls on the platform Stripe key (`public-signup-service.ts:196`) plus Firestore reads for agency and plan resolution per call. Effect on the platform's other Stripe operations (provisioning, webhooks) if rate-limited by Stripe: UNKNOWN.
  - No price manipulation: plan, price and trial come from the plan doc, `quantity: 1` is fixed (lines 197-198, 191-194).
  - Return URLs use the request `Host` only when it is one of `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_ASCEND_APP_URL` hostnames, otherwise `NEXT_PUBLIC_APP_URL` (route lines 40-53), so no open redirect through `Host`.
- Handles money: creates subscription checkout sessions; no charge without the buyer completing payment.
- Exposes private data: no. `BillingError.message` values returned (lines 92-94) are static strings such as "Plan not found." per the service.
- Mutation: creates a Stripe Checkout Session (external). No Firestore writes.
- Severity: MEDIUM. Same reasoning as route 5, on the platform's own Stripe account.
- Remediation: trusted-IP helper; validate `x-forwarded-proto` to `"http"|"https"` (as `publicOriginOf` in `src/lib/shell/public-origin.ts:53-54` does); optional single global hourly cap for the route.

---

## Other routes reviewed for client-supplied forwarding headers

| Route or helper | Header | Use | Assessment |
|---|---|---|---|
| `POST /api/public/trial-signup` (`route.ts:40-48`) | `Host`, `x-forwarded-proto` | Build Stripe return base; host is allowlisted, proto is not | LOW. Same pattern as route 7; affects only the caller's own session. Separately, this route has no rate limiter at all (none in the route, and `recordTrialSignup` at `src/lib/server/trial-signup-service.ts:82-102` has none), and each call writes a `trialSignups` doc. That is an unrelated gap; listed in Backlog. |
| Twilio webhooks: `webhooks/twilio/voice/route.ts:67-69`, `voice/status/route.ts:48-50`, `whatsapp/inbound/route.ts:137-139`, `inbound/route.ts:189-191` | `x-forwarded-proto`, `x-forwarded-host` | Reconstruct the URL for `twilio.validateRequest` | No finding. The header only shapes the URL that is signature-checked with the account auth token; a forged host cannot make a forged request validate. Failure mode is a false reject, not a bypass. |
| `src/lib/shell/public-origin.ts:47-56` (used by `api/auth/sso/callback`) | `x-forwarded-host`, `x-forwarded-proto` | Build redirect origin | No finding. Host must be `divinex.io` or a subdomain; proto is coerced to http/https. |
| `src/lib/seo/site.ts:66-79` `siteOrigin()` | `x-forwarded-host`, `x-forwarded-proto` | Canonical and absolute URLs | LOW. Host is checked against `allowedHosts()`; `x-forwarded-proto` is used as-is once the host is allowed. Only matters if a shared cache keys pages by URL and not by header: UNKNOWN. |
| `src/middleware.ts` `x-user-uid` / `x-user-email` (line 412-413) and routes reading `x-user-uid` (`api/agency/*`, `api/contacts/[id]`, `api/auth/refresh-claims`, `api/auth/claim-pending-invites`, `api/dev-only/seed-demo`) | client-supplied identity headers | Auth | No finding in the routes checked: none of them is under a `PUBLIC_PATHS` entry, and `handleValidToken` sets the header itself with `headers.set`. Middleware does not visibly strip a client-sent `x-user-uid` on public paths; this only matters if a public route were ever to read it, and none of those listed does. |
| `x-real-ip` fallback in `ipFromRequest` and the four local `getClientIp` copies | `x-real-ip` | Same as XFF | Same fix applies; included in routes 1-7. |
| `ipFromRequest` callers | | | Only routes 4 and 5 call it (verified with `grep -rn "ipFromRequest" src`; the forms route no longer does). If no other caller remains after the fix, the function can be deleted. |

Not audited (UNKNOWN, not in the requested list): `api/public/growth-scan/*`, `api/landing/heartbeat`, `api/auth/signup`, `api/auth/activate`, `api/github`, `api/quotes`, `api/community`, `api/dl`, `api/forms` other than submit. None of them matched the `x-forwarded-for` / `x-real-ip` grep, so they do not derive an IP from those headers; whether they have any rate limiting at all was not reviewed.

---

## Immediate remediation candidates

Only items that could allow private-data exposure, unauthorized purchase or payment behavior, checkout manipulation, meaningful unauthorized mutation, or serious resource or cost abuse beyond simple rate-limit bypass. No private-data exposure and no checkout price/quantity manipulation was found.

1. Upsell charge lacks server-side authorization checks (payment behavior). Route 4.
   - Evidence: `charge/route.ts:65-84` loads the order by session id and checks only `subAccountId`, customer id and payment method; `order.status`, `order.funnelId`, `order.sectionId` and prior `order.upsells` entries are never read. `upsells` is only written (lines 126-133, 141-148). The only replay guard is the Stripe idempotency key at line 105.
   - Effect: a refunded or disputed order can be charged; an upsell from an unrelated funnel of the same tenant can be charged to any order whose session id the caller holds; a replay after Stripe's idempotency window can charge again.
   - Bounded by: the caller needs a valid `cs_...` id, which the buyer's browser carries in page URLs (`upsell-offer-section.tsx:36`, `charge/route.ts:93`); amount and currency come from server config.
2. Booking creation can be used for durable writes and third-party email at a rate the limiter does not bound, and can lock a tenant out. Route 2.
   - Evidence: `book/route.ts:128-140` (spoofable IP key; sub-account counter consumed before validation), `:158,468-535` (email sent to caller-supplied address from platform or tenant sender), `:429` (event write), `:557-580` (activity, trigger, webhook).
3. Availability query window is unclamped (cost abuse independent of the limiter). Route 1.
   - Evidence: `availability/route.ts:92-98,117-136` builds the Firestore range from raw `from`/`to`; the horizon clamp is only in `src/lib/booking/availability.ts:176-187`. One request can read all of a tenant's events. Fix is a two-line clamp.
4. Checkout limiter map is never pruned (process-level resource exhaustion once XFF is spoofable). Routes 4 and 5.
   - Evidence: `src/lib/funnels/checkout-rate-limit.ts:29-45` only ever calls `ipBuckets.set`; there is no size check or delete anywhere in the file. Each distinct spoofed key permanently keeps a Map entry in the server process that also serves every other route. Actual memory headroom per instance: UNKNOWN.
5. Telemetry `step` is stored as an attacker-chosen map key (meaningful unauthorized mutation of tenant analytics). Route 3.
   - Evidence: `track/route.ts:61,68` (300-char cap only) and `src/lib/funnels/telemetry.ts:139` (`steps: { [input.step]: totals }`). Lowest priority of the five; the concrete size at which a day doc stops accepting writes was not tested.

Recommended order: 1, 2, 3 (all small, local edits), then 4 and 5 together with the trusted-IP swap.

## Backlog (rate-limit hardening debt)

- Replace `getClientIp` / `ipFromRequest` / the inline XFF read with a trusted-IP helper in all seven routes: `availability/route.ts:53-59`, `book/route.ts:102-106`, `track/route.ts:31-35`, `charge/route.ts:36`, `checkout/session/route.ts:32`, `public/contact/route.ts:16`, `public/checkout/route.ts:15-19`. Then delete `ipFromRequest` (`src/lib/contacts/location.ts:281-289`) if no callers remain.
- Confirm in deployment (not code) that the origin is reachable only through Cloudflare, otherwise `CF-Connecting-IP` is forgeable too.
- All limiters are per-instance in-memory. If multiple instances run, effective caps are multiplied; if the limits matter as security boundaries, move the Stripe- and email-adjacent ones (routes 2, 4-7) to a shared store, as web chat did (`usage-limits.ts`). This is a design choice, not a quick fix.
- Booking limiters evict the first-inserted key at 5000 entries (`availability/route.ts:46-49`, `book/route.ts:95-98`). Updating an existing key does not refresh its position, so an active visitor's counter can be evicted while idle keys stay. Minor.
- Contact, sign-up and beacon limiters prune only expired entries above 5000 keys (`public-contact-rate-limit.ts:39`, `public-signup/rate-limit.ts:47`, `telemetry.ts:56`), so unexpired spoofed keys can still accumulate for up to an hour.
- Route 5 and 7: optional per-funnel and global caps for Stripe session creation. Route 6: global hourly cap on emails; consider a CAPTCHA.
- `public/checkout/route.ts:49` and `public/trial-signup/route.ts:46`: constrain `x-forwarded-proto` to `http`/`https`.
- `public/trial-signup/route.ts`: no rate limiter and an unauthenticated Firestore write per call (`trial-signup-service.ts:86-96`). Not a forwarded-header issue; noted so it is not lost.
- `charge/route.ts:159-178`: distinguish "charge succeeded but bookkeeping failed" from a card failure so a buyer is not told the card was not charged when it was.
- `public/contact/route.ts:62`: strip CR/LF from `name` before it goes in the subject (whether the provider already does so is UNKNOWN).

---

## Remediation status (updated 2026-09-26)

| Item | Status |
|---|---|
| Hosted forms (`/api/forms/[id]/submit`) trusted `X-Forwarded-For` | Fixed on branch `forms-trusted-client-ip` (trusted edge IP + HMAC-attested proxy IP). Waiting only on `FLOW_FORM_PROXY_SECRET` being set on both Render services. |
| Web chat (`/api/web-chat/*`) | Fixed and live (commit `d0d25f6`). |
| `POST /api/lp/[funnelId]/upsell/[sectionId]/charge` (HIGH) | Fixed on branch `funnel-upsell-charge-guard`: the order must be `paid`, and an upsell already accepted on the order is never charged again (`src/lib/funnels/upsell-eligibility.ts`, tested by `scripts/verify-upsell-eligibility.mts`). The URL-borne session id is still the only credential; replacing it with a signed one-time token is recommended follow-up. |
| Origin reachable outside Cloudflare (audit UNKNOWN) | Checked: the raw `*.onrender.com` hostnames are also fronted by Cloudflare (`server: cloudflare`, `cf-ray`), so `CF-Connecting-IP` is trustworthy for this service. |
| Everything else above | Backlog unless stated as an "Immediate remediation candidate". |
