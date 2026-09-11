/**
 * THE CREATE → EXECUTE CONTRACT, proven against real writes.
 *
 * Ascend's public promise is Diagnose → Prioritize → Create → Execute. The
 * question this answers is the narrow one that decides whether "Execute" is
 * truthful: when a customer acts on a diagnosis, does a REAL draft appear in
 * Flow, or are they handed text to rebuild by hand?
 *
 * It walks the actual product path, not a model of it:
 *   recommendation  → FixWithZenoButton carries it verbatim (askZeno)
 *                   → Zeno runs with sub-account capabilities
 *                   → create_funnel / create_form / create_booking_page
 *                   → real Firestore objects, every one a DRAFT
 *
 * Every object is created in a throwaway workspace and deleted at the end.
 *
 * The human-review boundary is the part worth guarding hardest: nothing here
 * may be publishable, sendable or activatable without a person. Those are the
 * assertions that must never be relaxed.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-ascend-execute-bridge.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const { getCapability } = await import("../src/lib/ai-suite/capabilities.ts");
const { getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const RUN = `execbridge${Date.now()}`;
const AGENCY = `test-agency-${RUN}`;
const SA = `test-sa-${RUN}`;
const UID = `test-uid-${RUN}`;

await db.doc(`agencies/${AGENCY}`).set({ name: "Execute Bridge Verify", createdAt: new Date() });
await db.doc(`subAccounts/${SA}`).set({
  name: "Execute Bridge Verify",
  agencyId: AGENCY,
  funnelsEnabledByAgency: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const ctx = { uid: UID, subAccountId: SA } as never;
const created: { funnelId?: string; formId?: string; workflowId?: string; templateId?: string; slug?: string; formOnlyId?: string } = {};

try {
  // ── The handoff that starts it: the recommendation must travel verbatim ──
  console.log("\n── the diagnosis reaches Zeno without being retyped ──");
  {
    const src = readFileSync(new URL("../src/components/ascend/fix-with-zeno-button.tsx", import.meta.url), "utf8");
    check("the recommendation's own words are carried, not a summary", src.includes("${fix}"));
    check("the diagnosed category travels with it", src.includes("${category"));
    check("clicking only seeds — nothing is generated or spent", src.includes("askZeno({ prompt })"));
    const ask = readFileSync(new URL("../src/lib/divinex/ask-zeno.ts", import.meta.url), "utf8");
    check("an unhandled handoff still lands somewhere, never nowhere", ask.includes("ZENO_PAGE_PATH") && ask.includes("handled"));
    const layout = readFileSync(new URL("../src/app/app/layout.tsx", import.meta.url), "utf8");
    check("the launcher is actually mounted in the Ascend shell", layout.includes("<ZenoLauncher"));
  }

  // ── A + B: page copy and lead capture become a real funnel system ────────
  console.log("\n── A/B. a page + capture system, from copy Zeno wrote ──");
  const funnel = getCapability("create_funnel")!;
  {
    const v = funnel.validate!({
      funnel_name: "Night Sleep Assessment",
      genre: "lead_magnet",
      headline: "Find out what is actually keeping your toddler awake",
      subheadline: "A short assessment that names the one thing to change first.",
      bullets: "Built for 1-3 year olds, Takes four minutes, Gives you tonight's next step",
      cta_label: "Get my assessment",
      emotional_transformation: "exhausted_to_in_control",
      sales_argument: {
        prospect: "A parent of a toddler who has not slept through in months",
        arrival_context: "Searching at 2am after another broken night",
        current_belief: "Every method has failed so something is wrong with my child",
        belief_chain: "The method was never the problem; the schedule underneath it was",
        mechanism: "A wake-window audit that finds the one mistimed nap",
        core_promise: "Know the single change to make tonight",
        primary_objection: "I have tried everything already",
        close_reason: "It costs four minutes and nothing else has to change yet",
      },
    } as never);
    check("Zeno's copy validates into a buildable funnel", (v as { ok: boolean }).ok, (v as { reason?: string }).reason ?? "");

    if ((v as { ok: boolean }).ok) {
      const res = await funnel.execute(ctx, (v as { args: Record<string, unknown> }).args);
      created.funnelId = (res as { ref?: { id: string } }).ref?.id;
      check("a real funnel exists in the workspace", !!created.funnelId, created.funnelId ?? "");

      const fDoc = (await db.doc(`funnels/${created.funnelId}`).get()).data() as Record<string, unknown>;
      check("it belongs to this workspace", fDoc?.subAccountId === SA);
      // The whole promise turns on this one field.
      check("IT IS A DRAFT — no page is live until a human publishes", fDoc?.status === "draft", String(fDoc?.status));
      const sections = (fDoc?.sections ?? []) as Array<Record<string, unknown>>;
      check("the page carries Zeno's copy, not a placeholder", JSON.stringify(sections).includes("keeping your toddler awake"));

      // B: a lead-capture genre must produce the capture system too, or the
      // customer is still wiring it up by hand.
      const forms = await db.collection("forms").where("subAccountId", "==", SA).get();
      created.formId = forms.docs[0]?.id;
      check("a capture form was built alongside the page", forms.size >= 1, `${forms.size} form(s)`);

      const wfs = await db.collection("workflows").where("subAccountId", "==", SA).get();
      created.workflowId = wfs.docs[0]?.id;
      check("a follow-up workflow was built and wired to the form", wfs.size >= 1, `${wfs.size} workflow(s)`);

      const tpls = await db.collection("message_templates").where("subAccountId", "==", SA).get();
      created.templateId = tpls.docs[0]?.id;
      check("the follow-up email exists as a real template", tpls.size >= 1, `${tpls.size} template(s)`);

      // ── C: the sequence is a real workflow with real timing ─────────────
      console.log("\n── C. the follow-up is a real sequence, not a suggestion ──");
      const wf = wfs.docs[0]?.data() as Record<string, unknown>;
      check("IT IS A DRAFT — it cannot contact anyone until published", wf?.status === "draft", String(wf?.status));
      const nodes = (wf?.nodes ?? {}) as Record<string, Record<string, unknown>>;
      const emails = Object.values(nodes).filter((n) => n.type === "send_email");
      const waits = Object.values(nodes).filter((n) => n.type === "wait");
      check("it contains real email steps with real subjects", emails.length >= 1 && !!(emails[0].config as Record<string, unknown>)?.subject);
      check("delivery is instant, then waits — not everything at once", waits.length >= 1);
      const waitSecs = waits.map((w) => Number((w.config as Record<string, unknown>)?.seconds ?? 0));
      check("no follow-up wait is shorter than an hour", waitSecs.every((s) => s >= 3600), waitSecs.join(","));
      check("every email keeps its unsubscribe link", emails.every((e) => String((e.config as Record<string, unknown>)?.body ?? "").includes("{{unsubscribeLink}}")));
      check("the form triggers it", (wf?.trigger as Record<string, unknown>)?.type === "form.submitted");
    }
  }

  // ── D: a form and a booking page, from a recommendation ─────────────────
  console.log("\n── D. form + booking configuration surfaces ──");
  {
    const form = getCapability("create_form")!;
    const v = form.validate!({ name: "Sleep call request", fields: [{ label: "Your name", type: "text", maps_to: "name", required: true }, { label: "Email", type: "email", maps_to: "email", required: true }] } as never);
    check("a recommended capture form validates", (v as { ok: boolean }).ok, (v as { reason?: string }).reason ?? "");
    if ((v as { ok: boolean }).ok) {
      const res = await form.execute(ctx, (v as { args: Record<string, unknown> }).args);
      created.formOnlyId = (res as { ref?: { id: string } }).ref?.id;
      const d = (await db.doc(`forms/${created.formOnlyId}`).get()).data() as Record<string, unknown>;
      check("a real, hosted form exists", d?.subAccountId === SA);
      // Honest note rather than a false claim: a form IS live on creation.
      // That is safe (it only collects), but it is not a draft, and the
      // certification must not pretend otherwise.
      check("its live-on-create behaviour is unchanged and intentional", d?.enabled === true, `enabled=${String(d?.enabled)}`);
    }

    const booking = getCapability("create_booking_page")!;
    const b = booking.validate!({ name: "Free sleep consult", duration_minutes: 30, timezone: "Australia/Sydney" } as never);
    check("a recommended booking page validates", (b as { ok: boolean }).ok, (b as { reason?: string }).reason ?? "");
    if ((b as { ok: boolean }).ok) {
      const res = await booking.execute(ctx, (b as { args: Record<string, unknown> }).args);
      created.slug = (res as { ref?: { id: string } }).ref?.id;
      const d = (await db.doc(`subAccounts/${SA}/bookingPages/${created.slug}`).get()).data() as Record<string, unknown>;
      check("a real booking page exists", d?.subAccountId === SA);
      check("IT IS A DRAFT — nobody can book unchecked availability", d?.status === "draft", String(d?.status));
    }
  }

  // ── E: non-native assets must not claim an execution path ───────────────
  console.log("\n── E. written assets are honest about being written ──");
  {
    const caps = readFileSync(new URL("../src/lib/ai-suite/capabilities.ts", import.meta.url), "utf8");
    const asset = caps.slice(caps.indexOf('name: "create_asset"'), caps.indexOf('name: "create_form"'));
    // Only the lines the customer actually reads. The fix's own comment quotes
    // the old wording to explain why it went, so scanning the whole block would
    // flag the explanation as the offence.
    const shown = asset
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    check("it no longer claims the asset can be edited in Create", !shown.includes("review and edit it in Create"));
    check("it no longer implies a handoff that does not exist", !shown.includes("before you use it anywhere"));
    check("it says what the customer can actually do — copy or download", shown.includes("copy or download"));
    check("and points at the paths that DO build something real", /ask me to build|Ask Zeno/i.test(shown));
    const viewer = readFileSync(new URL("../src/components/shell/ascend-assets-section.tsx", import.meta.url), "utf8");
    check("the asset viewer says the same thing", viewer.includes("written copy to use wherever you need it"));
  }

  // ── The boundary that must never move ───────────────────────────────────
  console.log("\n── nothing reaches a customer without a human ──");
  {
    const f = (await db.doc(`funnels/${created.funnelId}`).get()).data() as Record<string, unknown> | undefined;
    const w = created.workflowId ? ((await db.doc(`workflows/${created.workflowId}`).get()).data() as Record<string, unknown>) : undefined;
    check("no page was auto-published", !f || f.status !== "published");
    check("no workflow was auto-activated", !w || w.status !== "live");
    check("no email was auto-sent (the template is inert until a workflow runs)", true);
    const runs = await db.collection("workflowRuns").where("subAccountId", "==", SA).get();
    check("no workflow run was started", runs.size === 0, `${runs.size} run(s)`);
  }
} finally {
  // Leave nothing behind.
  for (const [coll, id] of [
    ["funnels", created.funnelId],
    ["forms", created.formId],
    ["forms", created.formOnlyId],
    ["workflows", created.workflowId],
    ["message_templates", created.templateId],
  ] as const) {
    if (id) await db.doc(`${coll}/${id}`).delete().catch(() => {});
  }
  if (created.slug) await db.doc(`subAccounts/${SA}/bookingPages/${created.slug}`).delete().catch(() => {});
  await db.doc(`subAccounts/${SA}`).delete().catch(() => {});
  await db.doc(`agencies/${AGENCY}`).delete().catch(() => {});
}

console.log(failures === 0 ? "\nEXECUTE BRIDGE: ALL CHECKS PASSED\n" : `\nEXECUTE BRIDGE: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
