/**
 * DEPLOYMENT PROVENANCE VERIFIER — P0.1 / U3.
 *
 * Answers "what is actually running there?" with evidence instead of a
 * dashboard badge. Checks every service in DEPLOYMENT_REGISTRY.md against its
 * own /api/version.
 *
 * Treats "cannot tell" as FAILURE. A service that will not say what it runs
 * is exactly the state that produced two false-green certifications.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-deployment-provenance.mts
 */
interface Expect { name: string; url: string; branch: string | null; note?: string }

const SERVICES: Expect[] = [
  { name: "flow-growth-scan-staging", url: "https://flow-growth-scan-staging.onrender.com", branch: "dev" },
  {
    name: "ascend-bi-growth-scan-staging",
    url: "https://ascend-bi-growth-scan-staging.onrender.com",
    branch: null,
    note: "tracks the release candidate under certification; branch varies by design",
  },
];

let failures = 0;
const check = (l: string, ok: boolean, n = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`);
  if (!ok) failures++;
};

interface Provenance { commit?: string | null; branch?: string | null; platform?: string; service?: string | null; startedAt?: string }

for (const svc of SERVICES) {
  const res = await fetch(`${svc.url}/api/version`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res || !res.ok) {
    // Not yet deployed with the endpoint is a real, reportable state — the
    // service cannot prove what it runs, so it cannot be certified against.
    check(`${svc.name} reports its provenance`, false, res ? `HTTP ${res.status} (endpoint not deployed yet?)` : "unreachable");
    continue;
  }
  const p = (await res.json().catch(() => ({}))) as Provenance;
  check(`${svc.name} reports its provenance`, !!p.commit, p.commit ? `${p.branch ?? "?"} @ ${p.commit}` : "no commit reported");
  if (svc.branch && p.branch) {
    check(`${svc.name} runs the expected branch`, p.branch === svc.branch, `expected ${svc.branch}, got ${p.branch}`);
  } else if (!svc.branch) {
    console.log(`     (${svc.name}: ${svc.note})`);
  }
}

console.log(`\n${failures === 0 ? "ALL SERVICES ACCOUNTED FOR" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
