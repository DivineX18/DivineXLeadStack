/**
 * A new workspace can build something.
 *
 * Every gate used to ship off, which is correct for a channel that spends the
 * agency's Twilio balance, Resend reputation or Vapi minutes on a workspace
 * created for a client. It was wrong for funnels, websites and Zeno, which
 * have no marginal cost per workspace. With all three off a new account is a
 * CRM with no way to build anything.
 *
 * That was not hypothetical. A funnel builder testing the product could not
 * find a funnel builder, concluded Zeno could not read websites and that the
 * platform could not create funnels, and burned hours on it. Both conclusions
 * were wrong. The capability needed no Ascend profile, no scan and no website
 * URL; it was simply switched off, and so was the assistant that drives it.
 *
 * The second half is the Ascend link. A workspace created through the agency
 * route got no mapping and therefore no business profile, so the Ascend side
 * errored while the Flow side showed a "Full Ascend" badge.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-workspace-build-gates.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`); }
};
const read = (f: string) => readFileSync(f, "utf8");
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SERVICE = "src/lib/server/sub-accounts-service.ts";
const SIGNUP = "src/app/api/auth/signup/route.ts";
const ASCEND_PROV = "src/lib/workspace/provision-ascend-operations.ts";
const LINK = "src/lib/workspace/ensure-ascend-link.ts";

console.log("-- the build tools are on, the money is not --");
{
  const { WORKSPACE_BUILD_GATES } = await import("../src/lib/server/workspace-build-gates.ts");
  const g = WORKSPACE_BUILD_GATES as Record<string, boolean>;

  ck("funnels, websites and Zeno are all on",
    g.funnelsEnabledByAgency === true && g.websiteEnabledByAgency === true && g.aiSuiteEnabledByAgency === true);

  // MUTATION — the failure this exists to prevent. Funnels on with the
  // assistant off is the single most confusing combination the gates produce,
  // and it is exactly what the Ascend purchase path shipped.
  ck("MUTATION: funnels without Zeno would be caught",
    Object.values(g).every((v) => v === true) && Object.keys(g).length === 3);

  // Nothing that spends money may ride along.
  const SPENDY = [
    "broadcastsEnabledByAgency", "outboundVoiceEnabledByAgency", "whatsappEnabledByAgency",
    "metaInboxEnabledByAgency", "socialPlannerEnabledByAgency", "apiAccessEnabledByAgency",
    "getLeadsEnabledByAgency", "emailDomainEnabledByAgency", "missedCallTextBackEnabledByAgency",
    "funnelCheckoutEnabledByAgency", "customDomainsEnabledByAgency", "communityEnabledByAgency",
  ];
  ck("MUTATION: no spend-capable channel is switched on by default",
    SPENDY.every((k) => !(k in g)));
  // A tier entitlement is not a build tool and is not ours to grant here.
  ck("and the Ascend tier entitlement is not granted either",
    !("ascendIntelligenceEnabledByAgency" in g));
}

console.log("\n-- every creation path uses the same constant --");
{
  // This drifted once: the Ascend purchase path set funnels and website true
  // in its own literal block while leaving aiSuite false. One constant, three
  // sites, so the next person cannot half-change it.
  for (const f of [SERVICE, SIGNUP, ASCEND_PROV]) {
    const src = code(f);
    ck(`${f.split("/").pop()}: spreads WORKSPACE_BUILD_GATES`, /\.\.\.WORKSPACE_BUILD_GATES/.test(src));
    ck(`${f.split("/").pop()}: no literal override of the three`,
      !/funnelsEnabledByAgency:\s*(true|false)/.test(src) &&
        !/websiteEnabledByAgency:\s*(true|false)/.test(src) &&
        !/aiSuiteEnabledByAgency:\s*(true|false)/.test(src));
  }

  // MUTATION — proof the override check can fail.
  ck("MUTATION: a re-added literal override would be caught",
    /aiSuiteEnabledByAgency:\s*false/.test(code(ASCEND_PROV) + "\n  aiSuiteEnabledByAgency: false,"));

  // The shared creation function is what every other path funnels through.
  const callers = ["src/app/api/agency/sub-accounts/route.ts", "src/lib/ai-suite/capabilities.ts",
                   "src/lib/server/public-signup-service.ts", "src/lib/onboarding/handoff.ts"];
  ck("the shared creation function covers the other four paths",
    callers.every((f) => /createSubAccountForAgency/.test(read(f))));
}

console.log("\n-- a new workspace gets its Ascend identity --");
{
  const link = code(LINK);
  const service = code(SERVICE);

  ck("creation calls the linker", /ensureAscendWorkspaceLink\(/.test(service));

  // Best effort, always. The workspace is already written by then, and an
  // unreachable Ascend must not undo what the operator asked for.
  ck("a link failure cannot fail the workspace create",
    /try \{[\s\S]{0,900}ensureAscendWorkspaceLink[\s\S]{0,900}\} catch/.test(service));
  ck("MUTATION: the linker returns a reason rather than throwing",
    /linked: false; reason: string/.test(link) && !/throw new/.test(link));

  // Idempotent: a second profile for one workspace is the state the linkage
  // rules forbid, and it is not cheaply reversible.
  ck("an already-linked workspace is not re-resolved",
    /existing\?\.primaryAscendBusinessProfileId/.test(link) &&
      link.indexOf("primaryAscendBusinessProfileId") < link.indexOf("ascend.resolve"));
  ck("MUTATION: the early return reports alreadyLinked rather than creating",
    /alreadyLinked: true/.test(link) && /created: false/.test(link));

  // Ascend owns profile identity. Flow asks, it does not invent an id.
  ck("Flow does not mint a profile id itself",
    /ascend\.resolve\(/.test(link) && !/businessProfileId = (String\()?\d/.test(link));

  // A Flow-only deployment is a normal state, not an error to log forever.
  ck("an unconfigured Ascend is a reason, not an error",
    /ascend_not_configured/.test(link) &&
      /link\.reason !== "ascend_not_configured"/.test(service));

  // Both sides keep their own linkage record on purpose.
  ck("the Flow-side mapping is written too, not just Ascend's",
    /createMappingIdempotent/.test(link) && /attachPrimaryBusinessProfile/.test(link));
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
