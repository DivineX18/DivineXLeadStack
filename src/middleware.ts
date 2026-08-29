import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authMiddleware } from "next-firebase-auth-edge/lib/next/middleware";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/responsible-ai",
  "/api-webhooks",
  "/about",
  "/thank-you",
  // Affiliate direct "Buy now" link (/buy?ref=CODE). Sets the referral
  // cookie client-side then bounces to Stripe checkout. Public — no session.
  "/buy",
  // Public docs (e.g. /docs/updating — the "keeping your app up to date"
  // guide linked from /thank-you and shareable as a stable URL).
  "/docs",
  "/f",
  "/api/forms",
  "/api/auth/signup",
  // Public self-serve activation — sets the password on a Firebase Auth
  // user created server-side after a paid self-serve signup. Security is
  // the HMAC activation token in the request body, verified inside the
  // route (see /lib/auth/activation-token.ts).
  "/api/auth/activate",
  // Version 1 SSO from Ascend (see /Users/boss/.claude/plans/rosy-finding-summit.md).
  // /api/auth/sso/callback — receives the one-time code from Ascend, not yet
  // authenticated here. /api/auth/sso/exchange-bridge-token — reads its own
  // short-lived HttpOnly bridge cookie, not the session cookie. /auth/sso/finish
  // is the tiny client page that completes the Firebase sign-in.
  "/api/auth/sso",
  "/auth/sso",
  // Workflow Builder step worker — QStash callback, signature-verified inside
  // the route.
  "/api/workflows/step",
  "/api/broadcasts/email/step",
  "/api/checkout",
  "/api/cron/gitpage-heartbeat",
  // Daily sweep for the public API's TTL'd collections (apiRequestLogs,
  // apiIdempotency, webhookEvents). Replaces native Firestore TTL so the
  // buyer doesn't need to click into the Firebase console — QStash is
  // already part of their onboarding. Signature-verified inside the route.
  "/api/cron/api-cleanup",
  "/api/landing/metrics",
  "/api/landing/recent-purchases",
  // Live-visitors heartbeat ping for the agency dashboard's world map.
  // Public POST from every landing-page browser every ~5s. Validation
  // + best-effort failure handling inside the route — never breaks
  // the landing experience.
  "/api/landing/heartbeat",
  "/api/webhooks/twilio",
  "/api/webhooks/stripe",
  // Meta (Facebook Messenger + Instagram DM) webhook — BETA. Public from the
  // Meta cloud: GET is the verify-token handshake, POST carries message events.
  // Security: X-Hub-Signature-256 (HMAC of the raw body with the app secret)
  // verified inside the route; per-sub-account routing by Page / IG id.
  "/api/webhooks/meta",
  // Post-payment GitHub-invite endpoint. Public POST from the buyer's
  // browser on the /thank-you page. Security: 256-bit claim token in
  // the request body must hash-match the value stored on
  // purchases/{sessionId} by the Stripe webhook; 3-attempt permanent
  // lock per session on top.
  "/api/github",
  // Vapi voice-agent webhooks — public from the Vapi cloud. Security:
  //   - Authorization: Bearer ${VAPI_WEBHOOK_SECRET} header check inside
  //     each route (custom header configured per-assistant in the Vapi
  //     dashboard / via our provisioning code).
  //   - Routes scoped by [subAccountId] path param so a leaked secret
  //     can only impersonate one sub-account at worst.
  "/api/webhooks/vapi",
  // Web Chat widget — public from-the-browser API. Security:
  //  - Origin header validated against per-sub-account allowedDomains
  //  - In-memory per-IP + per-session rate limits
  //  - Anonymous sessions; identity only captured via [[capture …]] marker
  "/api/web-chat",
  // Embed pages — the chat widget iframe target. Public; the bot
  // can't send messages without passing the /api/web-chat/* origin check.
  "/embed",
  // Widget loader JS — public static file served from /public.
  "/widget.js",
  // PWA — the manifest is fetched by the browser without credentials on
  // every page (including /login), and the service worker script must be
  // publicly fetchable for registration. Both are harmless to expose:
  // the manifest is branding metadata, sw.js is push-display code only.
  "/manifest.webmanifest",
  "/sw.js",
  // App-icon serving route — the OS/browser fetches manifest icons and the
  // apple-touch icon without credentials. Serves the owner-uploaded icon
  // or 302s to the static fallback; read-only, nothing sensitive.
  "/api/pwa",
  "/u",
  "/api/u",
  // Public quote pages — recipient-facing /q/[token] view (server-rendered)
  // and the accept/decline endpoint. Both gated by HMAC-signed token
  // verification inside the route; no session needed.
  "/q",
  "/api/quotes",
  // Public digital-product download redirect — /api/dl/[token]. Same
  // HMAC-token trust model as /q and /u; the buyer has no Firebase
  // account, so this must be reachable unauthenticated.
  "/api/dl",
  // Public funnel pages — /lp/[funnelId] first-party ClickFunnels/GHL-style
  // landing pages. Fully public, zero token, doc-ID-is-the-URL — same model
  // as /f/[formId], since a funnel is meant for mass/anonymous ad traffic
  // like a form, not a private single-recipient document like a quote.
  "/lp",
  // Public checkout-session creation for Funnel Checkout — same trust
  // model as /api/forms/[id]/submit: funnelId + sectionId are the only
  // credential, rate-limited per IP inside the route.
  "/api/lp",
  // Public funnel-asset delivery (images + lead-magnet PDFs) — the
  // unguessable asset id is the capability token; the link is what a
  // subscriber receives by email, so it must resolve without a session.
  "/api/funnel-asset",
  "/api/webhooks/divinex",
  // Custom-domain resolver — internal rewrite target for Funnels custom
  // domains (see customDomainRewrite() below); never linked to directly.
  "/cdomain",
  // Custom-domain DNS-verify QStash callback. Signature-verified inside.
  "/api/domains/poll",
  // Public booking pages — /b/[saId]/[slug] hosted slot picker, plus the
  // availability + book POST endpoints. Security:
  //  - Page reads only return slots when `status === "published"`
  //  - Per-IP rate limit on availability + book POSTs
  //  - Server-side transactional re-verify at book time so a stale
  //    visitor can't double-book a slot
  "/b",
  "/api/booking",
  // Public event-management page (/e/[token]) + cancel/reschedule
  // endpoints. All gated by HMAC-token + hash match against the stored
  // `event.publicTokenHash`. Reschedule rotates the token so any
  // previously-mailed link invalidates cleanly.
  "/e",
  // Booking reminder + payment-auto-expire QStash callbacks. Security:
  // Upstash-Signature header verification inside the route.
  "/api/events/reminder",
  "/api/events/payment",
  "/setup.html",
  // SEO conventions — Next.js serves these as virtual routes from
  // src/app/robots.ts and src/app/sitemap.ts respectively. Both must
  // reach crawlers unauthenticated.
  "/robots.txt",
  "/sitemap.xml",
  // Community + Courses (Skool-style) member surface — own session model
  // (magic-link HMAC cookie scoped to the sub-account), NOT Firebase Auth.
  // The agency gate + member-session checks happen inside each route/page;
  // a member session can never resolve into the staff `/sa/*` surface.
  "/c",
  "/api/community",
  // Client Billing v1 — public checkout entry + post-checkout status page.
  // The HMAC-signed token in the URL is the credential (verified inside the
  // route against billing.checkoutTokenHash, quote-link model); a valid
  // link 303s into Stripe Checkout.
  "/pay",
  // Public REST API (v1+). Auth happens INSIDE each route via Bearer-token
  // verification (lib/api/auth.ts), not via session cookie. Sub-account-
  // scoped keys; tenancy enforced in code (Admin SDK writes bypass
  // Firestore rules). Adding the prefix here means the Firebase-edge
  // middleware doesn't try to redirect API-key callers to /login.
  "/api/v1",
  // Outbound-webhook delivery worker. QStash callback only — signature-
  // verified inside the route via `verifyQStashSignature`. Mirrors the
  // existing /api/broadcasts/email/step + /api/workflows/step paths.
  "/api/webhooks-out",
  // Public self-serve signup — marketing pricing page (+ /pricing/success,
  // covered by this prefix), the read-only plans + checkout-session API,
  // and the post-payment "set your password" activation page. No session;
  // security is the Stripe Checkout flow itself + the HMAC activation
  // token (verified inside /api/auth/activate, quote/checkout-token model).
  "/pricing",
  "/activate",
  "/api/public",
  // Marketing pages (custom landing variant) — content-only, no auth.
  // Each was missing here initially, which silently redirected every
  // signed-out visitor to /login instead of showing the page.
  "/platform",
  "/features",
  "/implementation",
  "/faq",
  "/contact",
  "/industries",
  "/resources",
];

/**
 * Dynamic public paths — patterns that contain a path param. These are
 * QStash-callback / webhook endpoints whose security comes from signature
 * verification inside the route, not from session auth.
 */
const PUBLIC_PATH_PATTERNS: RegExp[] = [
  // Bulk outbound-call step — QStash callback, signature-verified inside
  // the route (same security model as /api/broadcasts/email/step).
  /^\/api\/comms\/voice\/campaign\/step$/,
  // 3-day post-purchase Gitpage bonus reminder — QStash callback,
  // signature-verified inside the route.
  /^\/api\/gitpage-reminder\/step$/,
  // gitpage build poll: /api/sub-accounts/{id}/website/{siteId}/poll
  /^\/api\/sub-accounts\/[^/]+\/website\/[^/]+\/poll$/,
  // Social Planner publish callback — QStash callback, signature-verified
  // inside the route (same security model as /api/workflows/step).
  /^\/api\/social\/publish\/step$/,
  // GHL migration drain — QStash callback, signature-verified in the route.
  /^\/api\/import\/ghl\/step$/,
  // WhatsApp template approval poll: /api/sub-accounts/{id}/whatsapp-templates/poll
  // QStash callback, signature-verified inside the route.
  /^\/api\/sub-accounts\/[^/]+\/whatsapp-templates\/poll$/,
  // Calendar subscription feed: /api/sub-accounts/{id}/calendar.ics
  // Token-gated inside the route via verifyCalendarFeedToken — Google /
  // Apple / Outlook pollers are unauthenticated, so session-cookie auth
  // would block them. The HMAC token in `?t=` is the credential.
  /^\/api\/sub-accounts\/[^/]+\/calendar\.ics$/,
  // Public competitor comparison pages (SEO landing pages, e.g.
  // /leadstack-vs-gohighlevel). Slug is path-suffixed with a hyphen
  // rather than a slash so the PUBLIC_PATHS prefix-match logic can't
  // see it — regex is the only option here. Read-only public content;
  // no auth required. Each competitor has its own static route under
  // src/app/leadstack-vs-{slug}/page.tsx; this regex catches them all.
  /^\/leadstack-vs-[a-z0-9-]+$/,
  // Per-tenant Stripe webhook for Funnel Checkout (BYO-Stripe) —
  // /api/webhooks/stripe/tenant/{subAccountId}. Public path; security is
  // the per-tenant signature check inside the route, not the session
  // cookie — same model as every other regex entry here.
  /^\/api\/webhooks\/stripe\/tenant\/[^/]+$/,
];

function isPublicPath(pathname: string): boolean {
  if (
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return true;
  }
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

// Custom-domain rewrite for Funnels (crm.divinex.io/lp/[funnelId] -> a
// client's own domain). Pure string comparison, no Firestore, no runtime
// change — safe to run before anything else in this file. A request whose
// Host header isn't the app's own domain (or a Vercel preview/localhost)
// gets rewritten to an internal resolver path that does the real Firestore
// lookup; the browser's address bar keeps showing the client's own domain
// throughout since this is a rewrite, not a redirect.
// Extra known-good hostnames for the rewrite guard below, comma-separated
// (e.g. "crm.divinex.io,www.crm.divinex.io"). A safety net independent of
// NEXT_PUBLIC_APP_URL — see the incident note in customDomainRewrite().
const EXTRA_SAFE_HOSTNAMES = (process.env.SAFE_APP_HOSTNAMES ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function normalizeHost(h: string): string {
  const lower = h.toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

/**
 * INCIDENT (see git history around this comment): a strict equality check
 * between the incoming Host header and NEXT_PUBLIC_APP_URL's hostname took
 * the entire production site down the moment that env var didn't exactly
 * match live traffic — NEXT_PUBLIC_* vars are inlined at BUILD time, so any
 * drift between what was set at build time and the domain actually serving
 * requests (missing var, stale value, www vs. bare, a bad build) makes
 * EVERY request look like an unrecognized custom domain and rewrites it
 * into a 404. A misconfigured custom-domains feature must never be able to
 * take down the primary site, so this now fails CLOSED: any ambiguity
 * (missing/unparseable/non-production-looking NEXT_PUBLIC_APP_URL) disables
 * the rewrite entirely rather than guessing. SAFE_APP_HOSTNAMES is an
 * optional extra allowlist independent of NEXT_PUBLIC_APP_URL, so the
 * primary domain can be pinned even if that var ever drifts again.
 */
function customDomainRewrite(request: NextRequest): NextResponse | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  let appHostname = "";
  if (appUrl) {
    try {
      appHostname = new URL(appUrl).hostname.toLowerCase();
    } catch {
      appHostname = "";
    }
  }
  // Fail closed: if NEXT_PUBLIC_APP_URL is missing, unparseable, or clearly
  // not a real production domain (no dot — e.g. a bare hostname or a build
  // that baked in "localhost"), disable the whole feature rather than risk
  // rewriting real traffic. Custom domains staying off is a minor feature
  // gap; the primary site 404ing is a full outage — never trade the second
  // for the first.
  const appHostnameLooksReal = appHostname.includes(".") && appHostname !== "localhost";
  if (!appHostnameLooksReal && EXTRA_SAFE_HOSTNAMES.length === 0) return null;

  const hostHeader = request.headers.get("host");
  if (!hostHeader) return null;
  const hostname = normalizeHost(hostHeader.split(":")[0]);

  const knownGood = new Set<string>(["localhost", "127.0.0.1"]);
  if (appHostnameLooksReal) knownGood.add(normalizeHost(appHostname));
  for (const h of EXTRA_SAFE_HOSTNAMES) knownGood.add(normalizeHost(h));

  if (knownGood.has(hostname) || hostname.endsWith(".vercel.app") || hostname.endsWith(".onrender.com")) {
    return null;
  }
  return NextResponse.rewrite(
    new URL(`/cdomain/${hostname}${request.nextUrl.pathname}${request.nextUrl.search}`, request.url),
  );
}

// Ascend OS — the /app/* Full Ascend shell needs to know which sub-account
// (workspace) is "active" for a caller who belongs to more than one, since
// /app/* itself carries no [subAccountId] URL segment (unlike /sa/[id]/...).
// No such signal existed anywhere before this (confirmed: no cookie, no
// localStorage, no Firestore field) — every request into /sa/[id]/... IS
// that signal, so this mirrors it into a cookie /app/*'s layout can read
// server-side. Trust model: this cookie is NEVER treated as authorization —
// resolveWorkspaceIdentity() -> resolveSubAccountAccess() independently
// re-verifies real membership on every read regardless of where the
// workspaceId came from, so a forged/stale value here can at worst cause a
// harmless redirect, never real access. Wrapped defensively (never throws,
// never touches PUBLIC_PATHS) matching this file's existing fail-closed
// discipline (see the customDomainRewrite() incident note above).
const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

function applyActiveWorkspaceCookie(request: NextRequest, response: NextResponse): void {
  try {
    const match = request.nextUrl.pathname.match(/^\/sa\/([^/]+)/);
    if (!match) return;
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, match[1], {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 24, // 12 days, matches the __session cookie's maxAge below
    });
  } catch {
    // Never let this block a real request.
  }
}

export default async function middleware(request: NextRequest) {
  const domainRewrite = customDomainRewrite(request);
  if (domainRewrite) return domainRewrite;

  // Skip auth middleware if Firebase is not configured
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.FIREBASE_ADMIN_PROJECT_ID
  ) {
    return NextResponse.next();
  }

  const response = await authMiddleware(request, {
    loginPath: "/api/login",
    logoutPath: "/api/logout",
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    cookieName: "__session",
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT ?? "",
      process.env.COOKIE_SECRET_PREVIOUS ?? "",
    ],
    cookieSerializeOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 24, // 12 days
    },
    serviceAccount: {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? "",
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "",
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(
        /\\n/g,
        "\n",
      ),
    },
    handleValidToken: async ({ decodedToken }, headers) => {
      // Allow authenticated users through
      // Attach user info to headers for downstream use
      headers.set("x-user-uid", decodedToken.uid);
      headers.set("x-user-email", decodedToken.email ?? "");
      // Ascend Command Center — AscendAppLayout needs to know whether the
      // current request targets /app/command-center specifically (a
      // narrow, agency-owner-only carve-out from the strict full_ascend
      // gate) without a Server Component layout having any other way to
      // read the current pathname. Never used for authorization itself —
      // every command-center route re-checks requireAgencyOwnerAny()
      // independently server-side.
      headers.set("x-pathname", request.nextUrl.pathname);

      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async () => {
      const pathname = request.nextUrl.pathname;

      // Allow public paths without authentication
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      // Redirect unauthenticated users to login for protected paths
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    },
    handleError: async () => {
      const pathname = request.nextUrl.pathname;

      // On error, allow public paths and redirect protected paths
      if (isPublicPath(pathname)) {
        return NextResponse.next();
      }

      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    },
  });

  applyActiveWorkspaceCookie(request, response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/login",
    "/api/logout",
  ],
};
