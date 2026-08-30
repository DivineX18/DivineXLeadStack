# DivineX Production Readiness — findings log

Running record of things found while certifying Production Experience 2.0.
Everything here was observed against a real deployment, not inferred from
code. Carried into the final production-readiness report.

## Environment / release integrity

### Staging branch drift (found 2026-08-30, fixed)

`flow-growth-scan-staging` was building from `growth-scan-unified-trigger`
@ `22c45f5` — **Aug 9, roughly 20 days and three architectural slices behind
`main`**. It had no Slice 5 (onboarding reveal), no Slice 9 (assistance), and
none of the affiliate routes.

Proven by fingerprinting both hosts with the same authenticated session:

| marker | staging (before fix) | production (`main`) |
|---|---|---|
| `/api/agency/affiliates` | 404 | 200 |
| `/app/assistance` (Slice 9) | 404 | 307 |
| `/app/onboarding/reveal` (Slice 5) | 404 | 307 |
| `/app/command-center` | 200 | 200 |

**Consequence: any "verified on staging" claim from roughly Aug 9 to Aug 30
was verified against code that did not contain those slices.** Treat prior
staging sign-offs in that window as unproven rather than passed.

The service was created by hand in the Render dashboard and is not in
`render.yaml`, which is why the drift was silent — nothing in the repo
declares what branch it should track. Codifying it is deliberately deferred
(a blueprint change can create or modify services when synced), but until
that happens the same drift can recur.

**Method note for future checks:** an unauthenticated status code proves
nothing about which build is deployed. Middleware gates every non-public path
before routing, so production on `main` returns 307 for `/preview/funnel/probe`
even though that route does not exist there. Only an authenticated request
against a **real** record distinguishes builds.

## Product reach

### The unified shell resolves for one workspace only (open)

`decideShellMode()` requires all three: the request host matches
`NEXT_PUBLIC_ASCEND_APP_URL`, the workspace's entitlement tier is
`full_ascend`, and the `unified_shell` flag is on. Tier comes solely from an
**active `workspaceMappings` record**.

Exactly one such record exists:

```
workspaceMappings/8066de16-88a2-429a-8e8c-d4bef35f8706
  flowSubAccountId: MEYB8CbWlE5fxAn3TJOp   (DivineX #1000)
  status: active, provisioningStatus: complete
```

So **DivineX #1000 is the only workspace that can render `/app/*` at all.**
Every other workspace — including #1001 — resolves `crm_only` and is
redirected to `/sa/{id}/dashboard`. The `unified_shell` flag is at
`rolloutStage: "internal_admin"` with empty `allowedWorkspaceIds`/`allowedUids`,
so only the agency owner passes it regardless.

This is the gate working as designed, not a defect. But it means the entire
Ascend information architecture — including the Phase A redesign — is
currently reachable by one workspace and one user. Broadening it is a
prerequisite for any customer-facing launch, and there is still **no
self-service way to create a mapping** (see the SSO bridge's identical
limitation: `divinex_workspace_mappings` is populated by hand).

## Generated-content quality

### Archetype mismatch in build result copy (open)

Asking Zeno for a **dental clinic** landing page ($99 new-patient exam)
produced result copy asserting the design pack was "chosen for consultants"
and an authenticity section framed entirely around enterprise procurement —
SOC2/ISO badges, "six-figure contracts", "evaluation/procurement process".
The page itself was fine; the *explanation* of it was written for a
different business.

Lives in the frozen Sales Argument / Business Reality engines, so it is
recorded here rather than patched.

### Ascend `dev` branch has diverged from `main` (open — deferred debt)

`DivineX-Business-Intelligence`'s `dev` branch cannot fast-forward from
`main` and does not contain `artifacts/api-server/src/lib/brandDiscovery.ts`
at all — a stash-pop onto it conflicted immediately (`DU`, deleted-by-us).
So Ascend currently has **no usable dev-first path**: work off `main` cannot
land on `dev` without a real reconciliation.

The asset-classification work was therefore committed to a feature branch
off `main` (`brand-asset-classification` @ `e4dc534`) and deployed to
`ascend-bi-growth-scan-staging` for validation.

**Deliberately NOT fixed during the classifier work** (owner's call, and the
right one): mixing branch reconciliation into pipeline validation adds risk
to both. Resolve the branch strategy before any final production promotion.

This is the same class of problem as the Flow staging drift above — a
deployment path that looks like it exists but doesn't actually work — and
both stem from services and branches maintained by hand rather than declared
in `render.yaml`.

## Testing policy change (adopted 2026-08-30)

Real-business probes are now part of every major visual/generation
certification, not a diagnostic reached for only when something looks wrong.
Justification is empirical: ~50 funnels built from invented businesses
("Summit HVAC", "Lakeside Family Dental") passed a 10-scenario stress test
while the asset pipeline was misclassifying real website imagery badly
enough to put a third party's school seal in a photo gallery. Synthetic
fixtures produce clean, uniform inputs and proved almost nothing.
