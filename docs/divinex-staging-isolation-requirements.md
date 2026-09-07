# Staging isolation — outstanding requirements

**Status: deferred to immediately post-launch, before substantive V1.1 work.**
Not a V1 launch blocker by decision; it is a mandatory prerequisite for V1.1.

Until this is done, the existing staging environment shares production's data
stores. **Treat staging as unsafe for any test that creates, updates, deletes,
or migrates customer-visible data**, and do not run write-based staging tests
once real customer data exists.

Evidence this is real, not theoretical: one identity token minted locally
authenticated **both** deployments, and both returned the identical funnel
documents by id. Probe workspaces created during certification are visible in
the production agency list today.

Resources already provisioned by the owner (not yet configured):
Firebase project `divinex-staging` (project number 180250841105, Spark), and a
separate Neon Postgres project "DivineX Staging" (empty).

---

## 1. Separate Firebase — Flow only

Ascend does not use Firebase at all. Nine variables, all on the staging Flow
service, all from the Firebase console:

`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
`FIREBASE_ADMIN_PRIVATE_KEY`.

The six `NEXT_PUBLIC_*` are inlined at build time, so they need a full
redeploy, not a restart.

Project setup required first (a new project has none of it): register a Web app
to make the SDK config exist, enable Authentication → Email/Password, create
Firestore in production mode. Then deploy rules and indexes to the new project
(`firebase use divinex-staging` → `firebase deploy --only
firestore:rules,firestore:indexes`).

`BOOTSTRAP_ADMIN_EMAIL` must be set on staging Flow: the new Firestore is empty,
so the first signup mints the agency owner.

**Spark sufficiency.** Firestore and Auth are fine on Spark. Cloud Storage is
not: Firebase Storage is genuinely used (`lib/community/upload-image.ts` and the
Community avatar route), and recently-created projects require Blaze to
provision the default bucket. Everything in V1 except Community image upload
works on Spark. Spark's daily write cap can also throttle a heavy end-to-end
battery.

## 2. Separate Postgres — Ascend only

Flow never connects to Postgres; it reaches Ascend over HTTP. One variable on
the staging Ascend service:

`DATABASE_URL` → the Neon staging connection string.

`lib/db/src/index.ts` reads that single variable — there is no host/port/user
split and no second connection variable. A fresh empty database needs
`drizzle-kit push` (schema only); the two `lib/db/manual/*.sql` files exist only
because *production* drifted from the migration snapshot, and are unnecessary
against an empty database — both tables are in the schema.

**Also required, or the split is incomplete:** staging Flow must point at
staging Ascend, or staging generation keeps writing into the production database
through the bridge.

`ASCEND_API_BASE_URL` → the staging Ascend host.
`ASCEND_INTELLIGENCE_API_URL` → the staging Ascend host **plus `/api`**; without
the suffix the SPA catch-all returns 200 + HTML and Flow degrades silently.

## 3. Separate Supabase / object storage — Ascend

Ascend file uploads go to **Supabase**, not Firebase or GCS
(`artifacts/api-server/src/lib/objectStorage.ts` → `lib/supabase.ts`). Sharing
the production project means staging uploads land in the production bucket.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — a separate
staging Supabase project.

## 4. Separate Clerk — **necessary, not optional**

Clerk is Ascend's authentication. The question was whether a shared instance is
tolerable given the databases are separate. It is not: Ascend performs real
**writes** against Clerk, so a staging test reaches production identities even
with a separate Postgres.

- `invitations.createInvitation` (`routes/users.ts`) — a staging test **sends a
  real invitation email** to a real address.
- `invitations.revokeInvitation` — can revoke a genuine pending invitation.
- `users.updateUser({ publicMetadata: { ascend_role } })` — mutates a real
  user's role.

`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` (the
last two must hold the same value — the blueprint notes they have drifted
before). Use a separate Clerk development instance for staging.

---

## Verification to run once configured

- Staging Firebase project id differs from production.
- Staging Postgres differs from production.
- A staging write does not appear in production.
- A production document id is **not** fetchable from staging merely because it
  exists in production — the test that actually proves separation.
- Staging authentication cannot mutate production customer records.
- Assets, funnels, contacts, campaigns, mappings, jobs and workspaces created in
  staging stay staging-only.
- Production remains operational throughout.

No production data is to be migrated or copied into staging; staging starts
empty apart from minimal seed data needed to test.
