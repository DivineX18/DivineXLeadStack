# Deployment registry — the source of truth for what runs where

**P0.1 / U3.** Version-controlled truth about every deployed service, checked
automatically against reality by `scripts/verify-deployment-provenance.mts`.

## Why this exists

Twice during certification a service reported "Deployed" while serving
something else:

- `flow-growth-scan-staging` sat on an Aug-9 branch — **20 days and three
  architectural slices** behind what everyone believed it ran. Every
  "verified on staging" claim in that window was verified against code that
  did not contain the slices in question.
- `ascend-bi-growth-scan-staging` showed "Deployed" for 29+ minutes after a
  branch change while still serving a build with no DivineX routes at all.

Both were found only by probing behaviour and reasoning backwards. That is
slow, indirect, and it failed silently — a dashboard badge is not evidence.

## The registry

| Service | Repo | Branch | URL | Purpose |
|---|---|---|---|---|
| `ascend-crm` | DivineXLeadStack | `main` | crm.divinex.io, app.divinex.io | Flow/Ascend application — PRODUCTION |
| `flow-growth-scan-staging` | DivineXLeadStack | `dev` | flow-growth-scan-staging.onrender.com | Application staging |
| `DivineX-Business-Intelligence` | DivineX-Business-Intelligence | `main` | — | Ascend API — PRODUCTION |
| `ascend-bi-growth-scan-staging` | DivineX-Business-Intelligence | *release candidate branch* | ascend-bi-growth-scan-staging.onrender.com | Ascend staging |
| `ascend-production-db` | — | — | — | PostgreSQL 18 |

`ascend-bi-growth-scan-staging` deliberately has no fixed branch: it tracks
whichever release candidate is under certification (currently
`brand-asset-classification`). Its branch is expected to change; **silent**
change is what this registry prevents.

## How drift is caught

Every service exposes `GET /api/version` (public, secret-free) reporting its
branch, commit and process start time. `verify-deployment-provenance.mts`
fetches it and compares against this registry.

Three failures it makes impossible to miss:

1. **Wrong branch** — service reports a branch this table does not expect.
2. **Stale commit** — reported commit is not the branch head.
3. **No provenance** — service cannot say what it runs, which is treated as a
   failure, never as a pass. "I cannot tell" must never read as "yes".

`startedAt` distinguishes a **restart** from a **redeploy**. Conflating those
is exactly how a "Deployed 3 minutes ago" badge misled us: the service had
genuinely restarted, from the old branch.

## Rule

**Verify the deployed artifact, never the dashboard.** Before certifying
anything against an environment, confirm its provenance. A green suite run
against the wrong build is worse than no suite, because it manufactures
confidence.

## Open: `render.yaml` adoption

Both staging services were created by hand and are absent from `render.yaml`,
which is the root cause of the drift. Codifying them is the durable fix, but
it is **not** done here: the blueprint would need `plan:` tiers, and declaring
a tier the service does not currently have would change infrastructure cost on
the next sync. That needs owner confirmation of each staging service's current
plan before adoption.

Until then, this registry plus the automated verifier provides the source of
truth and the drift detection; `render.yaml` adoption makes it self-enforcing.
