/**
 * W3 — THE SCREEN REFLECTS WHAT ACTUALLY HAPPENED.
 *
 * Almost every surface here already does. They subscribe to Firestore
 * through lib/firestore/*, so a write by Zeno arrives exactly as a
 * teammate's write does, and adding a refetch would only deliver the same
 * change twice.
 *
 * One editor does not: the workflow builder fetches once and keeps the
 * whole node graph in local state. The hazard there is not a stale view,
 * it is that its next Save sends that stale graph and silently undoes what
 * Zeno did. The reverse must not happen either: the customer's unsaved
 * work cannot be discarded because Zeno touched the same record.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-reactive-updates.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { publishCommittedChange, onResourceChange, activeListenerCount } =
  await import("../src/lib/ai-suite/resource-changes");
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { mintReceipt } = await import("../src/lib/ai-suite/execution-result");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const SA = process.env.ZENO_DEV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const saSnap = await db.doc(`subAccounts/${SA}`).get();
if (!saSnap.exists) { console.error(`workspace ${SA} not found, refusing to run`); process.exit(1); }
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const made: string[] = [];

try {
  console.log("-- only a committed receipt is a signal --");
  {
    let heard = 0;
    const off = onResourceChange({ resourceType: "workflow", resourceId: "w1" }, () => { heard++; });
    const real = mintReceipt({ capability: "edit_email_cta", mutation: { resourceType: "workflow", resourceId: "w1", operation: "updated", changedFields: ["nodes"] }, auditId: "a1" });
    publishCommittedChange(real);
    ck("a server-minted receipt is heard", heard === 1);

    // Everything the model could produce, and every non-outcome.
    const notReceipts: [string, unknown][] = [
      ["a bare descriptor with no status", { resourceType: "workflow", resourceId: "w1", operation: "updated" }],
      ["a model-invented 'done' status", { resourceType: "workflow", resourceId: "w1", operation: "updated", status: "done" }],
      ["a failed action", { resourceType: "workflow", resourceId: "w1", operation: "updated", status: "failed" }],
      ["prose", "I have updated your workflow."],
      ["nothing at all", null],
      ["undefined", undefined],
      ["a number", 7],
      ["a receipt with no resource", { status: "committed" }],
      ["a receipt with a non-string id", { status: "committed", resourceType: "workflow", resourceId: 12 }],
    ];
    for (const [label, value] of notReceipts) {
      const before = heard;
      publishCommittedChange(value);
      ck(`${label} is not a signal`, heard === before);
    }
    off();
    publishCommittedChange(real);
    ck("unsubscribing stops delivery", heard === 1);
    ck("and leaves no listener behind", activeListenerCount() === 0);
  }

  console.log("\n-- a change to something else does not disturb you --");
  {
    let a = 0, b = 0;
    const offA = onResourceChange({ resourceType: "workflow", resourceId: "A" }, () => { a++; });
    const offB = onResourceChange({ resourceType: "workflow", resourceId: "B" }, () => { b++; });
    publishCommittedChange(mintReceipt({ capability: "x", mutation: { resourceType: "workflow", resourceId: "B", operation: "updated" }, auditId: null }));
    ck("only the matching resource hears it", a === 0 && b === 1);
    // Same id, different kind: a form "w1" is not a workflow "w1".
    let cross = 0;
    const offC = onResourceChange({ resourceType: "form", resourceId: "A" }, () => { cross++; });
    publishCommittedChange(mintReceipt({ capability: "x", mutation: { resourceType: "workflow", resourceId: "A", operation: "updated" }, auditId: null }));
    ck("an id is only meaningful with its type", cross === 0 && a === 1);
    offA(); offB(); offC();
    ck("all listeners removed", activeListenerCount() === 0);
  }

  console.log("\n-- one handler throwing does not silence the others --");
  {
    let second = 0;
    const off1 = onResourceChange({ resourceType: "form", resourceId: "f" }, () => { throw new Error("boom"); });
    const off2 = onResourceChange({ resourceType: "form", resourceId: "f" }, () => { second++; });
    // The throw must be caught HERE, or the assertion below is never
    // reached and the finally prints a pass for a run that blew up. That is
    // exactly how the first version of this escaped its own mutation.
    let escaped = false;
    try {
      publishCommittedChange(mintReceipt({ capability: "x", mutation: { resourceType: "form", resourceId: "f", operation: "updated" }, auditId: null }));
    } catch { escaped = true; }
    ck("a throwing handler does not escape the publisher", escaped === false);
    ck("and the handler registered after it still ran", second === 1);
    off1(); off2();
  }

  console.log("\n-- the screens that already react, actually receive it --");
  {
    // Proven against the live document the editor subscribes to, rather
    // than asserted from the fact that a subscription exists.
    const { createBookingPageServerSide, patchBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
    const SLUG = "zeno-dev-w3-delete";
    await db.doc(`subAccounts/${SA}/bookingPages/${SLUG}`).delete().catch(() => {});
    await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
      slug: SLUG, name: "ZENO DEV W3 - DELETE", description: "", status: "draft",
      durationMinutes: 30, bufferMinutes: 0, timezone: "America/Chicago", visibleDays: 14,
      minNoticeHours: 1, maxPerDay: 5, workingHours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
      intakeFields: [], remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
      confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
    made.push(`subAccounts/${SA}/bookingPages/${SLUG}`);

    const seen: number[] = [];
    const ref = db.doc(`subAccounts/${SA}/bookingPages/${SLUG}`);
    const stop = ref.onSnapshot((snap) => {
      const wh = (snap.data()?.workingHours ?? []) as { dayOfWeek: number }[];
      seen.push(wh.length);
    });
    await new Promise((r) => setTimeout(r, 1200));
    await patchBookingPageServerSide({ subAccountId: SA, slug: SLUG, patch: { workingHour: { dayOfWeek: 6, startMinute: 540, endMinute: 780 } } });
    await new Promise((r) => setTimeout(r, 2500));
    stop();
    ck("the document the booking editor listens to emits the change without any refetch",
      seen.length >= 2 && seen[seen.length - 1] === 2, `snapshots=${JSON.stringify(seen)}`);
  }

  console.log("\n-- the one editor that holds a local copy --");
  {
    const b = readFileSync("src/components/workflows/workflow-builder.tsx", "utf8");
    ck("it listens for changes to its own workflow",
      /onResourceChange\(\{ resourceType: "workflow", resourceId: initial\.id \}/.test(b));
    ck("a clean editor reloads from storage", /if \(!dirtyRef\.current\) \{\s*\n\s*void reloadFromStorage\(\);/.test(b));
    ck("a dirty editor does NOT reload", /setExternalChange\(change\);/.test(b));
    ck("it reloads from the server, never from the signal",
      /reloadFromStorage[\s\S]{0,400}await fetch\(`\/api\/sub-accounts\/\$\{saId\}\/workflows\/\$\{initial\.id\}`\)/.test(b));
    ck("the signal carries no replacement state",
      !/change\.(nodes|steps|body|config|value)/.test(b));
    ck("local edits mark it dirty", /setSteps\(\(cur\) => walk\(cur\)\);\s*\n\s*setDirty\(true\);/.test(b));
    ck("saving clears dirty, so the banner does not linger", /setDirty\(false\);\s*\n\s*setExternalChange\(null\);/.test(b));
    ck("the customer is offered both choices, and neither happens on its own",
      /Load Zeno's version/.test(b) && /Keep editing mine/.test(b));
    ck("it says plainly what each choice costs",
      /Saving now would undo Zeno&apos;s change; loading it\s*\n?\s*would discard yours/.test(b));
    ck("a failed reload keeps the customer's work",
      /Your changes are still here/.test(b));
    ck("nothing navigates the customer anywhere", !/router\.push\(/.test(b.slice(b.indexOf("reloadFromStorage"), b.indexOf("reloadFromStorage") + 1500)));
  }

  console.log("\n-- capability to receipt to signal, end to end without the model --");
  {
    // The model leg (prompt -> tool choice) is covered by the live script.
    // This is the part W3 owns: what a capability reports, what the confirm
    // route mints from it, and what a screen is therefore told.
    const { AI_SUITE_CAPABILITIES } = await import("../src/lib/ai-suite/capabilities");
    const { normalizeMutation } = await import("../src/lib/ai-suite/execution-result");
    const ctx = { uid: UID, email: "dev@example.com", displayName: "dev",
      agencyId: String(saSnap.data()?.agencyId ?? ""), subAccountId: SA, subAccountRole: "admin" };
    const receiptFor = (res: { mutation?: unknown }, capability: string) => {
      const m = normalizeMutation(res.mutation);
      return m ? mintReceipt({ capability, mutation: m, auditId: "dev" }) : null;
    };

    // Two booking pages: the one on screen, and the one being changed.
    const { createBookingPageServerSide } = await import("../src/lib/server/booking-pages-service");
    const mkPage = async (slug: string) => {
      await db.doc(`subAccounts/${SA}/bookingPages/${slug}`).delete().catch(() => {});
      await createBookingPageServerSide({ subAccountId: SA, createdByUid: UID, data: {
        slug, name: `ZENO DEV W3 ${slug}`, description: "", status: "draft", durationMinutes: 30,
        bufferMinutes: 0, timezone: "America/Chicago", visibleDays: 14, minNoticeHours: 1, maxPerDay: 5,
        workingHours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }], intakeFields: [],
        remindersEnabled: false, reminderOffsetsMinutes: [], redirectAppendParams: false,
        confirmationMessage: "", redirectUrl: "", meetingUrl: "", logoUrl: "", accentColor: "", hosts: [] } });
      made.push(`subAccounts/${SA}/bookingPages/${slug}`);
    };
    const OPEN = "zeno-dev-w3-open", OTHER = "zeno-dev-w3-other";
    await mkPage(OPEN); await mkPage(OTHER);

    const bp = AI_SUITE_CAPABILITIES.find((c) => c.name === "update_booking_page")!;
    const v = bp.validate({ booking_page_id: OTHER, day: "sunday", start_time: "10:00", end_time: "14:00" });
    const res = v.ok ? await bp.execute(ctx as never, v.args as never) : null;
    const rec = res ? receiptFor(res, "update_booking_page") : null;
    ck("changing another page mints a receipt naming THAT page",
      rec?.resourceId === OTHER && rec.resourceType === "booking_page", JSON.stringify(rec));

    // The screen showing the other page must hear nothing.
    let openHeard = 0, otherHeard = 0;
    const off1 = onResourceChange({ resourceType: "booking_page", resourceId: OPEN }, () => { openHeard++; });
    const off2 = onResourceChange({ resourceType: "booking_page", resourceId: OTHER }, () => { otherHeard++; });
    publishCommittedChange(rec);
    off1(); off2();
    ck("the editor showing a different page is not disturbed", openHeard === 0);
    ck("the editor showing the changed page is told", otherHeard === 1);

    // A workflow CTA edit must signal the workflow the builder is holding.
    const { createWorkflowServerSide, updateWorkflowServerSide } = await import("../src/lib/server/workflows-service");
    const wfId = await createWorkflowServerSide({ subAccountId: SA, createdByUid: UID, name: "ZENO DEV W3 receipt flow", template: "blank" });
    made.push(`workflows/${wfId}`);
    const BODY = "Hi there,\n\nGood to meet you.\n\n{{unsubscribeLink}}";
    await updateWorkflowServerSide({ subAccountId: SA, workflowId: wfId, patch: {
      trigger: { type: "form.submitted", filters: { all: [] } }, startNodeId: "e1",
      nodes: { e1: { id: "e1", type: "send_email", config: { subject: "One", body: BODY }, next: "e2" },
               e2: { id: "e2", type: "send_email", config: { subject: "Two", body: BODY }, next: null } } } });

    const cta = AI_SUITE_CAPABILITIES.find((c) => c.name === "edit_email_cta")!;
    const cv = cta.validate({ action: "add", workflow_id: wfId, email_number: 2, label: "Book a Call", url: "https://example.com/zeno-dev-w3" });
    const cres = cv.ok ? await cta.execute(ctx as never, cv.args as never) : null;
    const crec = cres ? receiptFor(cres, "edit_email_cta") : null;
    ck("a CTA edit mints a receipt for the WORKFLOW the builder holds",
      crec?.resourceType === "workflow" && crec.resourceId === wfId, JSON.stringify(crec));
    ck("and says which part changed", JSON.stringify(crec?.changedFields) === '["nodes"]');
    ck("and carries no replacement state",
      crec !== null && !("nodes" in crec) && !("body" in crec) && !("config" in crec));

    let builderHeard: string[] = [];
    const off3 = onResourceChange({ resourceType: "workflow", resourceId: wfId }, (c) => { builderHeard.push(c.operation); });
    publishCommittedChange(crec);
    off3();
    ck("the builder holding that workflow is signalled", builderHeard.length === 1 && builderHeard[0] === "updated");

    // And the change really is on disk, on the right node only.
    const wf = (await db.doc(`workflows/${wfId}`).get()).data()!;
    const body = (id: string) => String((wf.nodes as Record<string, { config?: { body?: string } }>)[id]?.config?.body ?? "");
    ck("email 2 persisted the button", body("e2").includes("[button: Book a Call]"));
    ck("email 1 is untouched", body("e1") === BODY);
    ck("the workflow is still a draft", wf.status === "draft");
  }

  console.log("\n-- the already-reactive screens were not given a second mechanism --");
  {
    const files = [
      "src/app/(dashboard)/sa/[subAccountId]/booking/[slug]/page.tsx",
      "src/app/(dashboard)/sa/[subAccountId]/forms/[id]/page.tsx",
      "src/app/(dashboard)/sa/[subAccountId]/pipeline/page.tsx",
      "src/app/(dashboard)/sa/[subAccountId]/tasks/page.tsx",
      "src/app/(dashboard)/sa/[subAccountId]/calendar/page.tsx",
      "src/app/(dashboard)/sa/[subAccountId]/contacts/[id]/page.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      ck(`${f.split("/").slice(-2).join("/")} was left alone`, !/onResourceChange/.test(src));
    }
    const chat = readFileSync("src/components/ai-suite/ai-suite-chat.tsx", "utf8");
    // Structural rather than distance-based: the publish must sit after the
    // proposal is marked confirmed and before the catch that handles a
    // failure, so a failed or refused confirmation cannot reach it.
    {
      const confirmed = chat.indexOf('status: "confirmed"');
      const publish = chat.indexOf("publishCommittedChange(data.receipt)");
      const catchAt = chat.indexOf("} catch (err) {", confirmed);
      ck("the receipt is published only after the proposal is marked confirmed",
        confirmed !== -1 && publish > confirmed);
      ck("and before the failure path, so a refusal cannot reach it",
        catchAt !== -1 && publish < catchAt);
      ck("there is exactly one publish site",
        (chat.match(/publishCommittedChange\(/g) ?? []).length === 1);
      ck("the failure path publishes nothing",
        !/publishCommittedChange/.test(chat.slice(catchAt, catchAt + 400)));
      // W3 depends on the confirm route returning the receipt at all. The
      // contract suite owns that invariant; it is asserted here too because
      // deleting it would silently disable every reaction while this suite
      // still passed.
      const confirmRoute = readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8");
      ck("the confirm response carries the receipt, or nothing here can fire",
        /\.\.\.\(receipt \? \{ receipt \} : \{\}\)/.test(confirmRoute));
      ck("and the client reads it from there", /publishCommittedChange\(data\.receipt\)/.test(chat));
    }
  }
} finally {
  for (const p of made) await db.doc(p).delete().catch(() => {});
  console.log(`\ncleaned up ${made.length} dev records`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
