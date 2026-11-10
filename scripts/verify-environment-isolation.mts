/**
 * Mandatory pre-flight for any write-based test run against a "staging" or
 * "test" environment. Fails loudly — never silently — if the environment
 * the caller is about to write to looks like production in any of the ways
 * this codebase actually depends on for tenancy isolation.
 *
 * Why this exists: `docs/divinex-staging-isolation-requirements.md` records
 * that one identity token minted locally authenticated BOTH the production
 * and staging Flow deployments, and both returned identical documents by
 * id, because they shared one Firebase project. That is not a hypothetical
 * risk — it already happened once. This script is the guard that should
 * have existed before that was possible to discover by accident.
 *
 * Usage: load the target env file first (however the caller already does
 * that — e.g. the inline .env.local reader pattern used by scripts/_cert.mts,
 * or a real `.env.staging.local`), then run this script before any write.
 * Exit code 0 = safe to proceed. Non-zero = STOP, do not run the write-based
 * suite.
 *
 *   node --import tsx scripts/verify-environment-isolation.mts
 */

const PRODUCTION_FIREBASE_PROJECT_ID = "ascend-crm-jvm";
const PRODUCTION_HOSTNAMES = ["crm.divinex.io", "app.divinex.io"];

let failed = false;
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failed = true;
};
const warn = (msg: string) => {
  console.warn(`WARN  ${msg}`);
};
const pass = (msg: string) => {
  console.log(`PASS  ${msg}`);
};

const firebaseAdminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const firebaseClientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const qstashToken = process.env.QSTASH_TOKEN;
const qstashSuffix = process.env.QSTASH_SCHEDULE_ID_SUFFIX?.trim();
const recurringDisabled = process.env.DISABLE_RECURRING_SCHEDULES === "true";
const nodeEnv = process.env.NODE_ENV;
const deploymentEnv = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
const isStaging = deploymentEnv === "staging";
// Mirrors lib/comms/staging-messaging-guard.ts's isBlocked(): explicit
// true/false always wins; unset defers to DEPLOYMENT_ENV=staging.
const messagingOverride = process.env.STAGING_BLOCK_LIVE_MESSAGING;
const blockLiveMessaging =
  messagingOverride === "true" || (messagingOverride !== "false" && isStaging);
const messagingAllowlist = process.env.STAGING_MESSAGING_ALLOWLIST?.trim();

console.log("=== Environment isolation pre-flight ===");
console.log(
  JSON.stringify(
    {
      DEPLOYMENT_ENV: deploymentEnv ?? "(unset, defaults to production)",
      FIREBASE_ADMIN_PROJECT_ID: firebaseAdminProjectId ?? "(unset)",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebaseClientProjectId ?? "(unset)",
      NEXT_PUBLIC_APP_URL: appUrl ?? "(unset)",
      NODE_ENV: nodeEnv ?? "(unset)",
      QSTASH_TOKEN: qstashToken ? "(set, value redacted)" : "(unset)",
      QSTASH_SCHEDULE_ID_SUFFIX: qstashSuffix ?? "(unset)",
      DISABLE_RECURRING_SCHEDULES: String(recurringDisabled),
      STAGING_BLOCK_LIVE_MESSAGING_raw: messagingOverride ?? "(unset)",
      STAGING_BLOCK_LIVE_MESSAGING_effective: String(blockLiveMessaging),
      STAGING_MESSAGING_ALLOWLIST: messagingAllowlist
        ? `(set: ${messagingAllowlist.split(",").length} entr${messagingAllowlist.split(",").length === 1 ? "y" : "ies"})`
        : "(unset)",
    },
    null,
    2,
  ),
);
console.log("");

// 0. Explicit environment identification — see lib/env/deployment-environment.ts.
// This is informational, not a hard fail: DEPLOYMENT_ENV is a NEW opt-in var
// that the Render staging service has not necessarily been given yet, and
// its absence doesn't by itself mean the target is production (every other
// check below still runs regardless).
if (isStaging) {
  pass('DEPLOYMENT_ENV=staging — Admin SDK init and all three Ascend production-fallback guards (SSO exchange, ascend-client, divinex/contract) enforce staging-only behavior.');
} else {
  warn(
    'DEPLOYMENT_ENV is not "staging". The Admin SDK project guard and the three Ascend production-fallback guards (lib/auth/ascend-exchange-url.ts, lib/divinex/ascend-client.ts, lib/divinex/contract.ts) are all no-ops without it. Set DEPLOYMENT_ENV=staging on the Render staging service to enable them.',
  );
}

// 1. Firebase project identity — the actual tenancy boundary this app relies on.
if (!firebaseAdminProjectId || !firebaseClientProjectId) {
  fail(
    "FIREBASE_ADMIN_PROJECT_ID / NEXT_PUBLIC_FIREBASE_PROJECT_ID not set — cannot confirm which Firebase project this run would write to. Refusing to guess.",
  );
} else if (firebaseAdminProjectId !== firebaseClientProjectId) {
  fail(
    `FIREBASE_ADMIN_PROJECT_ID ("${firebaseAdminProjectId}") and NEXT_PUBLIC_FIREBASE_PROJECT_ID ("${firebaseClientProjectId}") disagree — the admin SDK and the client SDK would write to two different projects. This is never correct.`,
  );
} else if (firebaseAdminProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
  fail(
    `Firebase project is "${firebaseAdminProjectId}" — this IS the production project. A write-based test run must target a different project.`,
  );
} else {
  pass(`Firebase project "${firebaseAdminProjectId}" is not the production project.`);
}

// 2. App URL — the QStash destination + Firestore marker + cookie domain all key off this.
if (!appUrl) {
  fail("NEXT_PUBLIC_APP_URL not set — required to confirm the target host.");
} else {
  let hostname: string | null = null;
  try {
    hostname = new URL(appUrl).hostname;
  } catch {
    fail(`NEXT_PUBLIC_APP_URL ("${appUrl}") is not a valid URL.`);
  }
  if (hostname && PRODUCTION_HOSTNAMES.includes(hostname)) {
    fail(`NEXT_PUBLIC_APP_URL host "${hostname}" IS a production hostname.`);
  } else if (hostname) {
    pass(`NEXT_PUBLIC_APP_URL host "${hostname}" is not a known production hostname.`);
  }
}

// 3. QStash scheduleId collision hazard — see register-schedules.ts's own doc comment.
// create() with an existing scheduleId REPLACES that schedule's destination in place.
if (recurringDisabled) {
  pass(
    "DISABLE_RECURRING_SCHEDULES=true — this run will never register the leadstack-* recurring crons, regardless of QSTASH_TOKEN. Strongest isolation; recommended default for a test environment.",
  );
} else if (qstashToken && !qstashSuffix) {
  warn(
    "QSTASH_TOKEN is set but neither DISABLE_RECURRING_SCHEDULES nor QSTASH_SCHEDULE_ID_SUFFIX is set. If this QStash token is shared with another deployment (e.g. production), the three leadstack-* cron schedules will be SILENTLY REPOINTED at this host on the next production cold start. Prefer DISABLE_RECURRING_SCHEDULES=true for a test environment (the recurring crons aren't needed for a Growth System E2E run); set QSTASH_SCHEDULE_ID_SUFFIX as a fallback if a specific test needs them running here.",
  );
} else if (qstashToken && qstashSuffix) {
  pass(`QSTASH_SCHEDULE_ID_SUFFIX="${qstashSuffix}" set — shared-token cron schedules will be namespaced, not collide.`);
} else {
  pass("QSTASH_TOKEN not set — no cron schedules will be registered by this run.");
}

// 4. Outbound messaging guard — see lib/comms/staging-messaging-guard.ts.
// Informational: a Growth System E2E run legitimately needs to send real
// SMS/email to its own approved test recipients, so this is never a FAIL —
// just a visibility check so "I forgot to set the allowlist" isn't
// discovered via an unexpected real send to a stranger.
if (blockLiveMessaging && messagingAllowlist) {
  pass(
    `Outbound messaging is BLOCKED by default (${messagingOverride === "true" ? "STAGING_BLOCK_LIVE_MESSAGING=true" : "DEPLOYMENT_ENV=staging"}) with an allowlist set — SMS/email will refuse any recipient not explicitly listed.`,
  );
} else if (blockLiveMessaging && !messagingAllowlist) {
  warn(
    "Outbound messaging is BLOCKED but STAGING_MESSAGING_ALLOWLIST is empty — every outbound SMS/email will be refused, including to your own approved test recipients. Add them to STAGING_MESSAGING_ALLOWLIST before the Growth System E2E run.",
  );
} else if (isStaging && messagingOverride === "false") {
  warn(
    'DEPLOYMENT_ENV=staging but STAGING_BLOCK_LIVE_MESSAGING is explicitly "false" — outbound SMS/email sends in this run are UNRESTRICTED and will reach whatever recipient the code dials/addresses, live, through whatever real Twilio/Resend credentials this environment has. Confirm this is deliberate.',
  );
} else {
  warn(
    "Outbound messaging is UNRESTRICTED in this run (neither DEPLOYMENT_ENV=staging nor STAGING_BLOCK_LIVE_MESSAGING=true is set) — SMS/email sends will reach whatever recipient the code dials/addresses, live, through the real Twilio/Resend credentials this environment has. Expected for production and local dev; set DEPLOYMENT_ENV=staging (or STAGING_BLOCK_LIVE_MESSAGING=true) + STAGING_MESSAGING_ALLOWLIST before running anything staging-shaped that could send to a real customer.",
  );
}

console.log("");
if (failed) {
  console.error(
    "=== RESULT: FAIL — do not run any write-based suite against this environment. ===",
  );
  process.exit(1);
} else {
  console.log("=== RESULT: PASS — environment is not production by every check this script knows how to make. ===");
  console.log(
    "This checks identity, not completeness — it does not guarantee the Firestore project is otherwise correctly configured (Auth enabled, rules deployed, etc).",
  );
}
