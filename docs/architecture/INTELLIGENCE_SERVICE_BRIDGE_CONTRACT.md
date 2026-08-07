# Intelligence Service Bridge Contract

**Status: SPECIFIED, PARTIALLY IMPLEMENTED. Flow-side (caller) implementation is real and committed. Ascend-side (receiver) implementation is BLOCKED — see "Why the Ascend side isn't built yet" below — and does not exist anywhere, on any branch, as of this document.**

This is the Phase 2 / Slice 10 deliverable for the Flow ↔ Ascend Intelligence service-to-service bridge referenced (but never specified) by `ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md` Section 6 ("API Contract Strategy" — "Not implemented by this document... pending product-owner approval") and consumed by `src/lib/intelligence/ascend-intelligence-client.ts` (Slice 9).

## Why the Ascend side isn't built yet

`DivineX-Business-Intelligence`'s `main` (tip `c7422b0`) and `dev` (tip `3c4d3e8`) branches diverged approximately 60 commits ago with no common recent ancestor — first discovered in Slice 1 (2026-08-04ish, this ledger's Wave A Slice 1 entry), re-confirmed unchanged at the start of this slice. `main` carries newer marketing/onboarding/checkout commits; `dev` carries ~60 commits of real fixes (vision-based site audits, calibration/em-dash enforcement, an OOM crash fix, headless-render fallback fixes, testimonial/CTA-extraction fixes) that never landed on `main`. Neither branch is confirmed to be what's actually deployed to `app.divinex.io`.

Writing service-auth middleware to the wrong branch risks either (a) losing ~60 commits of real fixes if that branch is later force-reset to match the other, or (b) building something that never reaches the app customers actually use. Per this slice's own "prove it, document it, stop — instead of inventing" discipline, and per the user's explicit direction when asked, **no code was written to the Ascend Intelligence repository this slice.** This document is the ready-to-implement specification for whoever resolves the branch question.

## Repository-truth audit this slice was built on

Confirmed by direct source read (Ascend `api-server/src`, current `main` checkout):

| Item | Finding |
|---|---|
| Global auth | `app.use(clerkMiddleware(...))` in `app.ts`, applied to every request — not opt-in per route |
| Per-route auth | `requireAuth`/`requireRole`/`requirePermission` (`middlewares/auth.ts`), each independently calling `getAuth(req)?.userId ?? getDevUserId(req)` (the dev-only bypass, hard-disabled via `NODE_ENV === "production"` check inside the function itself, not just convention) |
| Service-account / API-key auth | **Does not exist anywhere.** Every authenticated route assumes an end-user Clerk session. There is no precedent to "extend" — a service-auth path is entirely new surface area on the Ascend side. |
| Failure response shape | Ad hoc `res.status(401).json({ error: "Unauthorized" })` / `res.status(403).json({ error: "Forbidden" })` — a `{error: string}` shape by convention, not a formal, shared envelope type. No existing `{ok, data, error}` wrapper found anywhere in `api-server/src`. |
| Canonical tenancy key | `businessProfileId` — confirmed (again) no `workspaces`/`agencies` table exists. Ascend has no concept of "workspace" to validate against; the workspace ↔ business-profile binding is Flow's own authority (Workspace Mapping v2, Slice 4), already resolved and enforced *before* Ascend is ever called. |
| Existing precedent for A PROVEN service-to-service pattern in this whole system | The Ascend→Flow direction of the SSO bridge: `Authorization: Bearer ${ASCEND_SSO_SHARED_SECRET}`, a single static shared secret, HTTPS-only, no per-request signing. Live in production today (Flow's `/api/auth/sso/callback` calling Ascend's exchange endpoint). |

**Decision, made by repository truth, not preference**: the master prompt lists several possible mechanisms (signed service JWT, shared HMAC, internal API key, asymmetric signing, mTLS) and explicitly says "the repository decides." The repository's own answer is unambiguous — a static Bearer shared secret is the *only* service-to-service pattern that has ever been built and proven in this system, on either side. Introducing HMAC request-signing, JWTs, or mTLS here would be exactly the kind of invented compatibility layer this slice's discipline forbids ("Never create compatibility layers because they 'feel right'"). The Flow→Ascend direction reuses the identical pattern for consistency: **`Authorization: Bearer <shared secret>`**, a new secret, not the SSO one (rotating one direction's bridge secret must never affect the other — same reasoning `SSO_BRIDGE_TOKEN_SECRET` was kept separate from `AUTOMATIONS_TOKEN_SECRET` in the original SSO bridge design).

## Authentication contract

- **Mechanism**: static Bearer shared secret over HTTPS. `Authorization: Bearer ${ASCEND_INTELLIGENCE_API_SECRET}` — env var already named and reserved by Slice 9 (`src/lib/intelligence/ascend-intelligence-config.ts`), not yet set on either deployment.
- **Represented context header** (required on every request, not optional — same "a shared secret alone can never imply blanket authorization" discipline as Slice 5's `representedUid`): `X-Intelligence-Business-Profile-Id: <businessProfileId>`. The secret proves "this request really came from Flow's backend"; this header states *which* business profile's data is being requested. Ascend's middleware must reject a request with a valid secret but a missing/empty header — a valid secret is necessary, never sufficient.
- **No user token of any kind crosses this bridge.** Flow already resolved workspace → businessProfileId via Workspace Mapping v2 (Slice 4) and already checked `workspace.read` (Slice 5) before ever constructing this request — Ascend does not need to, and must not be given the means to, re-derive Flow's authorization decision. It only needs to confirm the secret is valid and the named business profile exists.
- **Rotation**: identical procedure to the existing SSO bridge secret — generate with `openssl rand -base64 32`, update both deployments' env vars in the same maintenance window (this secret has no "previous" grace-period pair, matching `ASCEND_SSO_SHARED_SECRET`'s own single-value precedent, not `COOKIE_SECRET_CURRENT`/`_PREVIOUS`'s rotation-pair pattern — a brief window of 401s during rotation is acceptable for a server-to-server bridge with retry+cache, unlike a customer-facing cookie).

## Authorization model (Ascend side, specified — not built)

1. Verify the Bearer secret (constant-time compare, mirroring `verifySsoBridgeToken`'s `timingSafeEqual` usage on the Flow side — never a plain `===` on a secret).
2. Require `X-Intelligence-Business-Profile-Id` present and non-empty. Reject with `unauthorized` if missing (not "forbidden" — this is closer to a malformed-request-credential case than a permission decision, and should be indistinguishable from a bad secret to an outside observer, so a probing attacker can't use the error code to distinguish "wrong secret" from "right secret, no header").
3. Look up the business profile by id. Not found → `business_not_found`, never a 500, never a stack trace.
4. **"Workspace validation," scoped honestly**: Ascend cannot validate a Flow `workspaceId` — it has no concept of one. What it *can* validate is that the business profile isn't deleted/archived (if Ascend's schema ever adds such a state — not confirmed to exist today) and, if useful, that the SSO bridge's own `divinexWorkspaceMappings` table (already real, per Slice 0's findings) shows this business profile linked to *some* Flow account — a soft consistency check, not a hard authorization gate (Flow already did the hard gate). Document this scoping explicitly wherever the middleware is eventually written, so a future reader doesn't assume Ascend re-derives Flow's authorization.
5. On any allow/deny, write ONE audit log row (see Observability below) — never per-field, matching Slices 5/6's "one row per evaluation, not one per checked item" discipline (the exact bug found and fixed in Slice 6).

## Response envelope

Every bridge endpoint, success or failure, returns exactly this shape — no exceptions, no bare Express default error pages, no unwrapped raw data:

```ts
interface IntelligenceBridgeEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: {
    code:
      | "unauthorized"           // bad/missing secret, or missing represented-context header
      | "business_not_found"
      | "workspace_mismatch"     // reserved for the soft consistency check above, if implemented
      | "not_found"              // valid business profile, but this specific resource doesn't exist (e.g. no assessment run yet)
      | "internal_error";        // never leaks a raw exception message or stack trace
    message: string;             // short, human-readable, never sensitive
  } | null;
}
```

`ok: true` implies `data` is non-null and `error` is null. `ok: false` implies `data` is null and `error` is non-null. HTTP status codes are secondary (401 for `unauthorized`, 404 for `business_not_found`/`not_found`, 500 for `internal_error`) — the envelope body is the authoritative contract; Flow's client (below) reads the envelope, not the status code, as the primary signal, since a misconfigured proxy/load balancer between the two services could rewrite a status code but not the body.

Flow's client (`ascend-intelligence-client.ts`) already implements the CALLER half of this: it treats a non-2xx OR an envelope with `ok: false` identically — both feed into the same fail-closed `unavailable`/`timeout`/`stale` handling built in Slice 9, extended this slice to read `error.code` into the existing `reasonCode` field rather than a generic HTTP-status-derived one.

## Required endpoints

Per Slice 9's audit (unchanged, re-confirmed this slice — no new endpoints found or needed):

| Endpoint | Real today? | Bridge equivalent |
|---|---|---|
| `GET /zeno/business-profiles/:id/dashboard-summary` | ✅ real, Clerk-gated | `GET /internal/intelligence/business-profiles/:id/dashboard-summary` (new, service-auth-gated, wraps the same underlying query) |
| `GET /zeno/cro-audits` | ✅ real | `GET /internal/intelligence/cro-audits?businessProfileId=` |
| `GET /zeno/memory` | ✅ real | `GET /internal/intelligence/memory?businessProfileId=` |
| `GET /zeno/growth-timeline/:id` | ✅ real | `GET /internal/intelligence/growth-timeline/:businessProfileId` |
| `GET /zeno/reports` | ✅ real | `GET /internal/intelligence/reports?businessProfileId=` |

**Never invented**: a standalone `/recommendations` endpoint (still nested in CRO audit responses, per Slice 9's Contradiction #1) and a standalone "Zeno read" endpoint (Zeno has no tool-calling mechanism, per Slice 9's Contradiction #2) — both re-confirmed unchanged this slice. The bridge does not add new business logic; it's a thin, service-auth-gated re-exposure of the SAME queries the existing Clerk-gated routes already run, under a new path prefix (`/internal/intelligence/*`) so the auth model is unambiguous from the route path alone — never the same route handling both a Clerk session and a service secret.

## Observability (required audit events, Ascend side)

One row per bridge request, never per sub-check (Slice 6's bug-fix precedent): `bridge_auth_success`, `bridge_auth_failure`, `permission_denied` *(reserved — no permission model exists to deny against beyond secret+profile-existence today)*, `business_missing`, `workspace_mismatch` *(reserved, soft-check only)*, `timeout` (n/a — Ascend is the server side, timeouts are a Flow-side concept), `response_validation_failure` *(n/a — Ascend produces the envelope, doesn't validate one)*.

**Flow-side equivalents, actually implemented this slice** (`src/lib/intelligence/intelligence-audit.ts`, extended): `bridge_request_sent`, `bridge_envelope_ok`, `bridge_envelope_error` (carries the `error.code`), plus Slice 9's existing `cache_hit`/`cache_miss`/`fetch_timeout`/`fetch_failure`/`not_configured`. Same no-user-data discipline as Slice 9.

## What changes in Flow once Ascend implements this

Nothing structural. `ascend-intelligence-client.ts` already targets `/zeno/*` paths pointed at `ASCEND_INTELLIGENCE_API_URL`; the moment Ascend stands up `/internal/intelligence/*` (or reuses `/zeno/*` behind the new middleware — either is compatible with this contract, that's an Ascend-side implementation choice, not a Flow-side dependency), Flow's client paths need a one-line base-path update and `ASCEND_INTELLIGENCE_API_URL`/`ASCEND_INTELLIGENCE_API_SECRET` need setting on both deployments. No Flow-side architecture changes.
