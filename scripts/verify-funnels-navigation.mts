/**
 * THE FUNNELS LIST MUST EITHER SHOW SOMETHING OR SAY WHY NOT.
 *
 * Locks two independent production defects reported together on 2026-09-18.
 *
 * 1. PERMANENT SPINNER. FunnelsList held `rows: Row[] | null` and
 *    `gate: boolean | null`, and used `null` for BOTH "still loading" and
 *    "the read failed". Its private onSnapshot subscribed before Firebase Auth
 *    had hydrated, and its error callback set the gate back to `null` — the
 *    initial value — so a single permission-denied killed the listener with
 *    nothing to restart it and nothing to render but a spinner, forever. The
 *    fetch had no try/catch and never checked res.ok, so a 403 rendered
 *    "No funnels yet. Create your first one." to an operator who had funnels.
 *
 * 2. THE PREVIOUS UI. The Orders page's back-link was a hand-built
 *    `/sa/{id}/funnels` string instead of saPath("/funnels"), so an Ascend
 *    customer who opened Orders and came back landed in the Flow shell.
 *
 * Both are structural properties of the source, so both are checked here
 * rather than left to a browser pass that only runs when someone remembers.
 * Pure: no Firestore, no network, no model call.
 * Run: npx tsx scripts/verify-funnels-navigation.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolveAscendShellHref } from "../src/lib/shell/ascend-shell-paths.ts";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const list = read("src/components/funnels/funnels-list.tsx");
const orders = read("src/app/(dashboard)/sa/[subAccountId]/funnels/orders/page.tsx");
const createPage = read("src/app/app/create/page.tsx");
const createContent = read("src/components/shell/ascend-create-content.tsx");

// ── 1. Orders → Funnels resolves through saPath ───────────────────────────
check("1a. the Orders back-link uses saPath()", /href=\{saPath\("\/funnels"\)\}/.test(orders));
check(
  "1b. and no longer hand-builds a /sa/{id} path",
  !/href=\{`\/sa\/\$\{subAccountId\}/.test(orders),
);

// ── 2. No Funnels/Orders navigation bypasses canonical resolution ─────────
{
  const handBuilt = /href=\{`\/sa\/|href="\/sa\/|push\(`\/sa\/|replace\(`\/sa\//;
  check("2a. funnels-list.tsx builds no /sa/ paths by hand", !handBuilt.test(list));
  check("2b. the Orders adapter builds no /sa/ paths by hand", !handBuilt.test(orders));
  check("2c. ascend-create-content builds no /sa/ paths by hand", !handBuilt.test(createContent));
}

// ── 8/9. Each shell returns to its own Funnels destination ────────────────
{
  const ascend = resolveAscendShellHref("sa_test", "/funnels");
  check(`8a. in the Ascend shell "/funnels" resolves to the Ascend list (got ${ascend})`, ascend === "/create");
  check("8b. which is a route that exists", existsSync(new URL("../src/app/app/create/page.tsx", import.meta.url)));
  const ordersHref = resolveAscendShellHref("sa_test", "/funnels/orders");
  check(`9a. and "/funnels/orders" resolves to the Ascend orders page (got ${ordersHref})`, ordersHref === "/create/orders");
  check(
    "9b. Flow resolution is untouched — saPath falls back to /sa/{id}{path}",
    /return `\/sa\/\$\{subAccountId\}\$\{path\}`/.test(read("src/context/sub-account-context.tsx")),
  );
}

// ── 10. The canonical baseHref points at a real route ─────────────────────
{
  const dflt = createContent.match(/funnelBaseHref = "([^"]+)"/)?.[1] ?? "";
  check(`10a. the default funnelBaseHref is the canonical singular editor (got ${dflt})`, dflt === "/create/funnel");
  check(
    "10b. and that route really exists",
    existsSync(new URL("../src/app/app/create/funnel/[funnelId]/page.tsx", import.meta.url)),
  );
  check(
    "10c. the only real caller agrees with the default",
    /funnelBaseHref="\/create\/funnel"/.test(createPage),
  );
}

// ── 3. Loading and error are distinct, representable states ───────────────
{
  check(
    "3a. a three-state machine exists (loading | ready | error)",
    /type ListState =[\s\S]*?"loading"[\s\S]*?"ready"[\s\S]*?"error"/.test(list),
  );
  check("3b. an error state is actually rendered", /state\.status === "error"/.test(list));
  check("3c. with a way to recover", /setReloadToken/.test(list) && /Try again/.test(list));
  check(
    "3d. the old conflated `rows === null` spinner contract is gone",
    !/useState<Row\[\] \| null>/.test(list),
  );
}

// ── 4. No private Firestore listener left to strand the component ─────────
{
  // Matches a CALL, not the word. The comment in that file explains the
  // listener it no longer opens, and a bare /onSnapshot/ would flag the
  // explanation as the offence.
  check("4a. funnels-list opens no onSnapshot of its own", !/onSnapshot\s*\(/.test(list));
  check("4b. and imports no Firestore client", !/firebase\/firestore|firebase\/client/.test(list));
  check(
    "4c. the gate is read from the provider, which waits for auth before subscribing",
    /useSubAccount\(\)/.test(list) && /subAccount\.funnelsEnabledByAgency === true/.test(list),
  );
  const ctx = read("src/context/sub-account-context.tsx");
  check("4d. the provider guards its subscription on the user", /if \(!user \|\| !subAccountId\)/.test(ctx));
  check("4e. and re-subscribes when user or workspace changes", /\}, \[user, subAccountId\]\);/.test(ctx));
  check("4f. and unsubscribes on change", /return \(\) => unsub\(\);/.test(ctx));
}

// ── 5/6. Neither a non-ok response nor a rejection can strand it ──────────
{
  check("5a. the fetch checks res.ok", /if \(!res\.ok\)/.test(list));
  check("5b. a non-ok response becomes an error state, not an empty list", /status: "error"[\s\S]{0,200}error \$\{res\.status\}/.test(list));
  check("5c. 403 is named honestly rather than shown as 'no funnels yet'", /isn't enabled for this workspace|isn&apos;t enabled for this workspace/.test(list));
  check("6a. the fetch is wrapped in try/catch", /try \{[\s\S]*?\} catch \{[\s\S]*?status: "error"/.test(list));
  check(
    "6b. delete failures are caught too, rather than rejecting unhandled",
    await createRequire(import.meta.url)("./verify-funnel-delete-recovery.cjs").verifyDeleteRecovery(list),
  );
}

// ── 7. An auth/workspace transition cannot strand it ──────────────────────
{
  check(
    "7a. an unreadable workspace is an error, never folded back into loading",
    /workspaceUnreadable = !workspaceLoading && !subAccount/.test(list) &&
      /if \(workspaceUnreadable\)[\s\S]{0,200}status: "error"/.test(list),
  );
  check(
    "7b. a stale in-flight response cannot overwrite a newer one",
    /let cancelled = false;/.test(list) && /if \(cancelled\) return;/.test(list) && /cancelled = true;/.test(list),
  );
  check("7c. the effect re-runs when the workspace changes", /\}, \[saId, gate, workspaceUnreadable, reloadToken\]\);/.test(list));
  // Caught on staging, in a browser, after the deterministic suite was already
  // green: gating on the provider's AGGREGATE `loading` also waits for the
  // membership snapshot, which this list never needed. The Flow route sat
  // spinning with the workspace document already resolved — the same defect one
  // layer up, reintroduced by the fix for it.
  check(
    "7d. the list waits for the workspace DOC, not for memberships too",
    /subAccountLoading: workspaceLoading/.test(list) && !/loading: workspaceLoading/.test(list),
  );
  const ctx2 = read("src/context/sub-account-context.tsx");
  check(
    "7e. and the provider exposes the two separately",
    /subAccountLoading: authLoading \|\| subLoading,/.test(ctx2) &&
      /loading: authLoading \|\| subLoading \|\| !membershipsLoaded,/.test(ctx2),
  );
}

// ── The client gate is presentation only; the server still enforces ───────
{
  const api = read("src/app/api/sub-accounts/[id]/funnels/route.ts");
  check(
    "11a. the API independently re-enforces funnelsEnabledByAgency",
    /funnelsEnabledByAgency/.test(api) && /403/.test(api),
  );
}

// ── QA BUG-003 — "Continue with Zeno" used the /app-prefixed form, which
// round-trips through a redirect (next.config.ts: /app/{section} -> 307 ->
// /{section} -> rewrite -> /app/{section}) before landing, an avoidable hop
// that risks losing ?funnel= if that redirect's query passthrough ever
// regresses. The canonical, zero-redirect form is bare /zeno.
//
// CORRECTED after live verification on the deployed build. 12a used to
// require a LITERAL "/zeno?funnel=${f.id}" in this component, encoding the
// belief that bare /zeno is canonical everywhere. It is not: this list
// renders in BOTH shells, and on the Flow host bare /zeno is not Zeno at
// all -- it falls through to the legacy stub that redirects to the caller's
// FIRST membership. Measured on crm.divinex.io before the fix: clicking it
// from /sa/73Bcu.../funnels landed on /sa/MEYB8.../dashboard, a DIFFERENT
// workspace, with ?funnel= dropped. So the assertion was passing while the
// link was broken for every Flow user.
//
// The original intent is preserved, not weakened: no /app/zeno, and the
// Ascend shell must still resolve to bare /zeno with no redirect hop. That
// is now asserted by EXECUTING the resolver instead of pattern-matching a
// hardcoded string, which is also what makes it shell-correct.
// ──────────────────────────────────────────────────────────────────────────
{
  check(
    "12a. 'Continue with Zeno' never hardcodes a shell-specific Zeno path",
    !/\/app\/zeno\?funnel=/.test(list) && !/href=\{`\/zeno\?funnel=/.test(list),
  );
  check(
    "12a-ii. both Zeno link sites resolve through saPath('/ai-suite')",
    (list.match(/\$\{saPath\("\/ai-suite"\)\}\?funnel=\$\{f\.id\}/g) ?? []).length === 2,
  );
  check(
    "12a-iii. the Ascend shell still lands on bare /zeno (original BUG-003 goal), query intact",
    resolveAscendShellHref("sa_test", "/ai-suite") === "/zeno" &&
      resolveAscendShellHref("sa_test", "/ai-suite?funnel=abc") === "/zeno?funnel=abc",
  );
  check(
    "12a-iv. the Flow target really exists, so the Flow branch cannot 404",
    existsSync("src/app/(dashboard)/sa/[subAccountId]/ai-suite/page.tsx"),
  );
  const config = read("next.config.ts");
  check(
    "12b. 'zeno' really is one of the sections /app/zeno would redirect FROM (confirms 12a closes a real round trip, not a no-op)",
    /"zeno",/.test(config),
  );
}

console.log(failures === 0 ? `\nverify-funnels-navigation: all checks passed` : `\nverify-funnels-navigation: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
