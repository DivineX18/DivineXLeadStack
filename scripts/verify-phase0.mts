/**
 * Phase 0 — the three changes that make the Google work verifiable.
 *
 * Behavioural where it can be (the two caches are pure, so they are exercised
 * for real, not pattern-matched) and source-asserted only where behaviour
 * would need a running server.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-phase0.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};

console.log("-- the intelligence cache lets go of what nobody re-reads --");
{
  const mod = await import("../src/lib/intelligence/intelligence-cache.ts");
  const { writeIntelligenceCache, readIntelligenceCache, clearIntelligenceCache, intelligenceCacheSize } = mod;

  clearIntelligenceCache();

  // Fill past the sweep threshold with entries that are already stale. Nothing
  // reads them back, which is precisely the case that used to leak: expiry was
  // enforced on read, so an unread key lived for the life of the process.
  const STALE_MS = 31 * 60 * 1000;
  const realNow = Date.now;
  Date.now = () => realNow() - STALE_MS;
  for (let i = 0; i < 150; i++) writeIntelligenceCache(`stale:${i}`, { payload: "x".repeat(100) });
  Date.now = realNow;

  const before = intelligenceCacheSize();
  writeIntelligenceCache("fresh:1", { payload: "new" });
  const after = intelligenceCacheSize();

  ck("stale entries are dropped by a later write, with no read involved",
    after < before, `size ${before} -> ${after}`);
  ck("the entry just written survives the sweep",
    readIntelligenceCache("fresh:1").hit === "fresh");
  ck("a swept key really is gone",
    readIntelligenceCache("stale:0").hit === "miss");

  // Below the threshold the sweep must not run — paying O(n) on every write of
  // a small map would be a worse bug than the one being fixed.
  clearIntelligenceCache();
  writeIntelligenceCache("a", 1);
  writeIntelligenceCache("b", 2);
  ck("a small cache is left alone", intelligenceCacheSize() === 2);
  ck("fresh reads still work", readIntelligenceCache<number>("a").hit === "fresh");

  // The TTL contract itself must not have shifted.
  clearIntelligenceCache();
  Date.now = () => realNow() - 5 * 60 * 1000; // 5 min: past fresh, inside stale
  writeIntelligenceCache("aging", { v: 1 });
  Date.now = realNow;
  ck("an entry past the fresh window still serves as stale",
    readIntelligenceCache("aging").hit === "stale");

  clearIntelligenceCache();
}

console.log("\n-- the public checkout limiter is bounded --");
{
  const src = readFileSync("src/lib/funnels/checkout-rate-limit.ts", "utf8");
  ck("it prunes at all", /ipBuckets\.size > 5000/.test(src));
  ck("it deletes only entries whose window has passed",
    /now - v\.windowStartedAt > PER_IP_WINDOW_MS\) ipBuckets\.delete\(k\)/.test(src));
  // The point of copying the siblings is that all four agree; a different
  // threshold here would be a silent divergence nobody would notice.
  for (const sib of ["src/lib/forms/rate-limit.ts", "src/lib/public-contact-rate-limit.ts"]) {
    ck(`matches the threshold already used in ${sib.split("/").pop()}`,
      /size > 5000/.test(readFileSync(sib, "utf8")));
  }

  const mod = await import("../src/lib/funnels/checkout-rate-limit.ts");
  const { checkCheckoutRateLimit } = mod;
  const ip = `1.2.3.${Math.floor(Math.random() * 250)}`;
  const first = checkCheckoutRateLimit(ip);
  ck("the limit still allows a first request", first.ok === true);
  let blocked = false;
  for (let i = 0; i < 25; i++) if (!checkCheckoutRateLimit(ip).ok) blocked = true;
  ck("and still blocks past the hourly cap", blocked);
}

console.log("\n-- the deploy endpoint can answer 'did my env change land?' --");
{
  const { resolveDeployProvenance } = await import("../src/lib/deploy/provenance.ts");

  const a = resolveDeployProvenance();
  ck("a fingerprint is produced", typeof a.configFingerprint === "string" && a.configFingerprint.length > 0);
  ck("it is a short digest, not a list", a.configFingerprint.length <= 12 && !a.configFingerprint.includes(","));
  ck("a count comes with it", typeof a.configVarsPresent === "number");
  ck("the existing provenance fields are untouched",
    "commit" in a && "branch" in a && "platform" in a && "startedAt" in a);

  const b = resolveDeployProvenance();
  ck("it is stable when nothing changes", a.configFingerprint === b.configFingerprint);

  // The whole point: adding a var the catalog knows about must move it.
  const probe = "OPENROUTER_API_KEY";
  const saved = process.env[probe];
  process.env[probe] = saved ? undefined as unknown as string : "test-value-not-a-secret";
  if (!saved) {
    const c = resolveDeployProvenance();
    ck("setting a known var changes the fingerprint", c.configFingerprint !== a.configFingerprint);
    ck("and raises the count", c.configVarsPresent === a.configVarsPresent + 1);
    delete process.env[probe];
  } else {
    delete process.env[probe];
    const c = resolveDeployProvenance();
    ck("removing a known var changes the fingerprint", c.configFingerprint !== a.configFingerprint);
    ck("and lowers the count", c.configVarsPresent === a.configVarsPresent - 1);
    process.env[probe] = saved;
  }
  ck("restoring the environment restores the fingerprint",
    resolveDeployProvenance().configFingerprint === a.configFingerprint);

  // An unknown name must NOT move it, or the signal is noise.
  process.env.SOME_UNRELATED_VAR_XYZ = "1";
  ck("an unknown var does not move it",
    resolveDeployProvenance().configFingerprint === a.configFingerprint);
  delete process.env.SOME_UNRELATED_VAR_XYZ;

  const src = readFileSync("src/lib/deploy/provenance.ts", "utf8");
  ck("no env var NAMES are emitted on the wire", !/names:\s*present|present\.join\(",?"\)\s*,?\s*$/m.test(src));
  ck("values are never hashed, only names", !/process\.env\[n\]\s*\)\s*\.sort|update\(.*process\.env\[/.test(src));
  ck("the catalog is the source of truth, not a local list", /KNOWN_KEYS/.test(src));
  ck("a catalog failure cannot break the diagnostic", /catch\s*\{[\s\S]*?unavailable/.test(src));
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
