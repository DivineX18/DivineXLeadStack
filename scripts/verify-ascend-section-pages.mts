/**
 * Ascend lifecycle section pages — the band contract.
 *
 * The North Star's Priority 2 remedy is an ORDER: context, insights,
 * recent activity, quick actions, recommendations, progress, "then the
 * execution tools." Before this suite nothing held that order, and the
 * drift was measurable on production: /agents was fourteen lines wrapping
 * a Flow page and opened straight into a channel grid, /create had no
 * recent-projects band at all (the one example the North Star names), and
 * /performance rendered zero h2 or h3, so a screen reader got a single
 * heading on the densest page in the product.
 *
 * Two halves, because they fail differently:
 *   - The ORDERING rule is executed, not regexed. A page cannot express
 *     the wrong order (orderAscendBands sorts), so what is asserted here
 *     is that the sort itself is canonical and stable.
 *   - MIGRATION is tracked by name. A suite that only checked migrated
 *     pages would go green while five sections still improvised, so every
 *     lifecycle section must appear in exactly one of the two lists below
 *     and the pending ones are PRINTED on every run.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-ascend-section-pages.mts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASCEND_BAND_ORDER, orderAscendBands, type AscendBandRole } from "../src/lib/shell/ascend-section-bands.ts";
import { ASCEND_LIFECYCLE_SECTIONS, type AscendLifecycleSectionId } from "../src/types/ascend-shell.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

let failures = 0;
function check(label: string, pass: boolean, note = "") {
  console.log(`${pass ? "✅" : "❌"} ${label}${note ? ` — ${note}` : ""}`);
  if (!pass) failures++;
}

// ── The vocabulary is the North Star's, in its order ─────────────────────
{
  // Written out literally rather than derived, so changing the product's
  // mandated order requires editing this line and saying why. Deriving it
  // from the module under test would assert nothing.
  const MANDATED: AscendBandRole[] = [
    "context",
    "insights",
    "activity",
    "actions",
    "recommendations",
    "progress",
    "execution",
  ];
  check(
    "The band vocabulary matches the North Star's mandated order",
    ASCEND_BAND_ORDER.length === MANDATED.length && MANDATED.every((role, i) => ASCEND_BAND_ORDER[i] === role),
    ASCEND_BAND_ORDER.join(" -> "),
  );
  check("Execution is last in the vocabulary", ASCEND_BAND_ORDER[ASCEND_BAND_ORDER.length - 1] === "execution");
}

// ── The ordering rule, executed ──────────────────────────────────────────
{
  type B = { role: AscendBandRole; tag: string };
  const band = (role: AscendBandRole, tag = role): B => ({ role, tag });

  const reversed = [...ASCEND_BAND_ORDER].reverse().map((r) => band(r));
  check(
    "A fully reversed declaration renders in canonical order",
    orderAscendBands(reversed).map((b) => b.role).join(",") === ASCEND_BAND_ORDER.join(","),
  );

  // The mistake this exists to prevent: the author reaches for the tool
  // first. It must not be expressible.
  const toolFirst = [band("execution"), band("context"), band("insights")];
  const orderedToolFirst = orderAscendBands(toolFirst);
  check(
    "A page declaring execution FIRST still renders it last",
    orderedToolFirst[orderedToolFirst.length - 1].role === "execution" && orderedToolFirst[0].role === "context",
    orderedToolFirst.map((b) => b.role).join(" -> "),
  );

  check(
    "Execution never precedes another band, whatever the declaration order",
    [
      [band("execution"), band("progress")],
      [band("execution"), band("context"), band("recommendations")],
      [band("recommendations"), band("execution"), band("insights")],
    ].every((input) => {
      const out = orderAscendBands(input);
      const execAt = out.findIndex((b) => b.role === "execution");
      return execAt === out.length - 1;
    }),
  );

  // Two bands in one role keep their declared sequence. Without a stable
  // sort, two insight strips could swap between renders.
  const sameRole = [band("insights", "first"), band("context", "ctx"), band("insights", "second")];
  check(
    "Bands sharing a role keep their declared sequence (stable sort)",
    orderAscendBands(sameRole).map((b) => b.tag).join(",") === "ctx,first,second",
  );

  check("Ordering does not drop or duplicate bands", orderAscendBands(reversed).length === reversed.length);
  check("An empty declaration is handled", orderAscendBands([]).length === 0);
  check(
    "Ordering does not mutate its input",
    (() => {
      const input = [band("execution"), band("context")];
      const before = input.map((b) => b.role).join(",");
      orderAscendBands(input);
      return input.map((b) => b.role).join(",") === before;
    })(),
  );
}

// ── The shell component holds up its end ─────────────────────────────────
{
  const rel = "src/components/ascend/section-page.tsx";
  check("The section-page shell exists", existsSync(path.join(root, rel)));
  const src = existsSync(path.join(root, rel)) ? read(rel) : "";

  check(
    "The shell orders bands through the pure rule rather than its own copy",
    /import \{[^}]*orderAscendBands[^}]*\} from "@\/lib\/shell\/ascend-section-bands"/.test(src) &&
      /orderAscendBands\(bands\)/.test(src),
  );
  check(
    "Band labels render as a real <h2>, not a styled div",
    /<h2 className="text-xs font-semibold uppercase tracking-wider"/.test(src),
    "/performance's labels were divs, leaving the page one heading",
  );
  check("Each band is a semantic <section>", /<section key=/.test(src));
  check(
    "The shell reuses PageHeader rather than re-deriving a title block",
    /import \{ PageHeader \} from "@\/components\/divinex\/ui"/.test(src),
  );
  check(
    "The shell keeps the agency section's container width",
    /mx-auto w-full max-w-6xl/.test(src),
  );
}

// ── The context flag the nested-Flow-page fix depends on ────────────────
{
  const ctxSrc = read("src/context/sub-account-context.tsx");
  check(
    "The sub-account context exposes inAscendShell to consumers",
    /inAscendShell: boolean;/.test(ctxSrc) && /^\s*inAscendShell,$/m.test(ctxSrc),
    "a Flow page nested in an Ascend band needs it to pick its heading level",
  );

  const flowAgents = read("src/app/(dashboard)/sa/[subAccountId]/ai-agents/page.tsx");
  check("Flow's AI Agents page reads inAscendShell", /inAscendShell/.test(flowAgents));
}

// ── Flow's channel grid reports every shipped channel ───────────────────
// The grid passed `enabled` for sms/voice/whatsapp and `undefined` for
// web-chat, which ChannelStatusCard renders as "Not configured" -- so a
// workspace running Web Chat live, with 314k tokens spent on it, read
// "Not configured" on the overview. Invisible until /agents put the real
// state in a band directly above the card contradicting it.
{
  const flowAgents = read("src/app/(dashboard)/sa/[subAccountId]/ai-agents/page.tsx");
  check(
    "Flow's overview fetches the web-chat channel config",
    /ai-agent\/channels\/web-chat/.test(flowAgents),
  );
  check(
    "Flow's channel grid reports web-chat's real enabled state",
    /channel\.id === "web-chat"\s*\n?\s*\? webChatEnabled/.test(flowAgents),
  );
  check(
    "Every shipped inbound channel has a status source in the grid",
    ["web-chat", "sms", "voice", "whatsapp"].every((id) => new RegExp(`channel\\.id === "${id}"`).test(flowAgents)),
  );
}

// ── /agents declares the bands the section promises ─────────────────────
{
  const src = read("src/app/app/agents/page.tsx");
  // SCOPED to the main bands array. An earlier revision searched the whole
  // file and a mutation that deleted the context band still PASSED, because
  // the unavailable-data branch declares a context band of its own further
  // up. A check that cannot fail is worse than no check.
  const bandsArrayStart = src.indexOf("const bands: AscendBand[] = [");
  check("/agents declares its bands in one array", bandsArrayStart !== -1);
  const bandsBlock = bandsArrayStart === -1 ? "" : src.slice(bandsArrayStart);
  for (const role of ["context", "insights"] as const) {
    check(
      `/agents declares a "${role}" band in its main composition`,
      new RegExp(`role: "${role}"`).test(bandsBlock),
    );
  }
  // The execution band is declared once above the array (the degraded
  // branch reuses the same object) and appended last, so it is checked by
  // both of those facts rather than by position in the array.
  check(
    "/agents declares one execution band and appends it",
    /const executionBand: AscendBand = \{\s*\n?\s*role: "execution"/.test(src) && /bands\.push\(executionBand\);/.test(src),
  );
  check(
    "/agents still mounts Flow's page as its execution band, not a re-implementation",
    /import FlowPage from "@\/app\/\(dashboard\)\/sa\/\[subAccountId\]\/ai-agents\/page"/.test(src) &&
      /<FlowPage \/>/.test(src),
    "the 80/20 rule: the channel grid stays Flow's",
  );
  check(
    "/agents reads its data through a server composer, not its own Firestore queries",
    /composeAgentsSummary/.test(src) && !/getAdminDb/.test(src),
  );
  check(
    "/agents degrades to the execution band when the summary is unavailable",
    /if \(!data\)/.test(src) && /executionBand/.test(src),
    "a read failure must not cost the customer the feature",
  );
}

// ── Flow pages nested as execution bands keep ONE <h1> ─────────────────
// Composing a Flow page as an execution band puts that page's own <h1>
// underneath the section's, so the document grows two top-level headings.
// Two pages do this now; both pick their heading level from the context.
{
  for (const [label, rel] of [
    ["AI Agents", "src/app/(dashboard)/sa/[subAccountId]/ai-agents/page.tsx"],
    ["Settings", "src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx"],
  ] as const) {
    const src = read(rel);
    check(
      `Flow's ${label} page picks its heading level from inAscendShell`,
      /const Heading = inAscendShell \? "h2" : "h1";/.test(src) && /<Heading className=/.test(src),
    );
  }
}

// ── One numbers treatment, not three ───────────────────────────────────
// Home wrote a compact tile strip inline; Performance grew a byte-identical
// copy of it and Leads used the heavier MetricCard, so the same four numbers
// rendered two different ways one click apart. MetricStrip is the extraction.
{
  const metricSrc = read("src/components/ascend/metric-card.tsx");
  check(
    "MetricStrip exists and explains an unread meta once, under the strip",
    /export function MetricStrip\(/.test(metricSrc) &&
      /meta !== undefined && meta\.status !== "ok"/.test(metricSrc),
    "four bare dashes with no explanation look exactly like four zeroes",
  );
  check(
    "MetricStrip's column classes are literal, not interpolated",
    /const STRIP_COLUMNS: Record<number, string>/.test(metricSrc) &&
      !/grid-cols-\$\{/.test(metricSrc),
    "Tailwind cannot generate a class from a template string",
  );
}

// ── Migration tracking: every section accounted for, by name ─────────────
{
  // A section moves from PENDING to MIGRATED only when its page actually
  // composes through the shell. The union must cover the whole IA, so a new
  // lifecycle section cannot be added without a decision here.
  const MIGRATED: AscendLifecycleSectionId[] = [
    "home",
    "create",
    "leads",
    "agents",
    "performance",
    "intelligence",
    "settings",
  ];
  const PENDING: AscendLifecycleSectionId[] = [];

  // Settings is execution-only BY DECISION, not by omission: it answers
  // "what is this configured to do", not "where do I stand", and a context
  // or insights band there would be padding invented to satisfy a shape.
  // Pinned so that decision is visible rather than looking like an
  // unfinished migration.
  const EXECUTION_ONLY: AscendLifecycleSectionId[] = ["settings"];

  const sectionFile = (id: AscendLifecycleSectionId) => `src/app/app/${id}/page.tsx`;

  const union = [...MIGRATED, ...PENDING];
  check(
    "Every lifecycle section is tracked as either migrated or pending",
    ASCEND_LIFECYCLE_SECTIONS.every((id) => union.includes(id)) && union.length === ASCEND_LIFECYCLE_SECTIONS.length,
    `tracked ${union.length} of ${ASCEND_LIFECYCLE_SECTIONS.length}`,
  );
  check(
    "No section is listed as both migrated and pending",
    MIGRATED.every((id) => !PENDING.includes(id)),
  );
  check(
    "Every execution-only section is one of the migrated ones",
    EXECUTION_ONLY.every((id) => MIGRATED.includes(id)),
  );

  for (const id of MIGRATED) {
    const rel = sectionFile(id);
    const src = existsSync(path.join(root, rel)) ? read(rel) : "";
    check(
      `${id}: composes through AscendSectionPage`,
      /AscendSectionPage/.test(src),
      "a migrated section must not regress to a hand-rolled layout",
    );
    // The shell owns the container and the eyebrow headings. A page still
    // declaring either has a second, drifting copy of them.
    //
    // Home is allowed EXACTLY ONE and no more: its pre-dashboard error
    // state renders before any band exists, so it carries its own wrapper.
    // An allowance of "any number" would have been a check that cannot
    // fail, which is how a regression hides.
    const widthDeclarations = (src.match(/mx-auto w-full max-w-6xl/g) ?? []).length;
    const widthBudget = id === "home" ? 1 : 0;
    check(
      `${id}: does not re-declare the shell's container width`,
      widthDeclarations === widthBudget,
      `${widthDeclarations} of ${widthBudget} allowed${id === "home" ? " (the pre-dashboard error state)" : ""}`,
    );
    check(
      `${id}: has no hand-rolled eyebrow heading`,
      !/<p className="text-xs font-semibold uppercase tracking-wider/.test(src),
      "a styled <p> label is why /performance rendered exactly one heading",
    );
    check(
      `${id}: has no inline copy of the metric tile`,
      !/text-\[11px\] leading-snug/.test(src),
      "MetricStrip is the one treatment",
    );
  }

  // Every lifecycle section except the execution-only ones must state where
  // the customer stands before handing them a tool. This is the North Star's
  // actual complaint, so it is asserted rather than left to review.
  for (const id of MIGRATED.filter((x) => !EXECUTION_ONLY.includes(x))) {
    const src = read(sectionFile(id));
    // SCOPED to the main bands array. An earlier revision searched the whole
    // file and a mutation that deleted /agents' context band still PASSED,
    // because the unavailable-data branch declares a context band of its own
    // further up. A check that cannot fail is worse than no check.
    const at = src.indexOf("const bands: AscendBand[] = [");
    const block = at === -1 ? "" : src.slice(at);
    check(
      `${id}: declares a context band in its main composition`,
      /role: "context"/.test(block),
      at === -1 ? "no main bands array found" : "",
    );
  }

  // The recent-activity band is the example the North Star names on Create
  // by name, and the promise /leads' own description makes.
  check(
    "create: declares the recent-projects activity band the North Star names",
    /role: "activity"/.test(read(sectionFile("create"))) &&
      /label: "Recent projects"/.test(read(sectionFile("create"))),
  );
  check(
    "leads: shows the leads its description promises, not just counters",
    /role: "activity"/.test(read(sectionFile("leads"))) &&
      /composeRecentLeads/.test(read(sectionFile("leads"))),
  );

  // Settings is execution-only and suppresses the header action: "Ask Zeno"
  // belongs over a section with a decision in it, not a configuration form.
  for (const id of EXECUTION_ONLY) {
    const src = read(sectionFile(id));
    const roles = [...src.matchAll(/role: "([a-z]+)"/g)].map((m) => m[1]);
    check(
      `${id}: declares exactly one band, and it is the execution band`,
      roles.length === 1 && roles[0] === "execution",
      roles.join(", ") || "none",
    );
    check(`${id}: suppresses the header action`, /action=\{null\}/.test(src));
  }

  // Every composer a migrated section reads through must be server-only and
  // must fail closed rather than throwing: the execution band underneath is
  // the real tool and works on its own, so a read failure costs context,
  // never the feature.
  for (const rel of [
    "src/lib/intelligence/compose-agents-summary.ts",
    "src/lib/intelligence/compose-create-summary.ts",
    "src/lib/intelligence/compose-recent-leads.ts",
  ]) {
    const src = read(rel);
    check(
      `${path.basename(rel)}: server-only and fails closed`,
      /^import "server-only";/m.test(src) &&
        /status: "unavailable"/.test(src) &&
        /} catch \{/.test(src),
    );
  }

  if (PENDING.length > 0) {
    console.log(`\n   ${PENDING.length} section(s) still improvising their own layout: ${PENDING.join(", ")}`);
    console.log("   Not a failure yet — tracked so the remaining work stays visible instead of silent.");
  } else {
    console.log(`\n   All ${MIGRATED.length} lifecycle sections compose through the primitive.`);
    console.log(`   Execution-only by decision: ${EXECUTION_ONLY.join(", ")}.`);
  }
}

console.log(`\n${failures === 0 ? "✅ All checks passed" : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
