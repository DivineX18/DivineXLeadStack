/**
 * W5 — Zeno operating the social infrastructure Flow already has.
 *
 * NOTHING HERE PUBLISHES. Every test stops at the Graph API boundary: the
 * payload is asserted, the request is not sent. Meta has no sandbox that
 * accepts a post without showing it to people, so the publish leg waits
 * for a disposable Page.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-social-execution.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getAdminDb } = await import("../src/lib/firebase/admin");
const { AI_SUITE_CAPABILITIES, CapabilityUserError } = await import("../src/lib/ai-suite/capabilities");
const svc = await import("../src/lib/server/social-posts-service");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const SA = process.env.ZENO_DEV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OTHER_SA = "2rLhSqe7lBjghhZOOaFh";
const saSnap = await db.doc(`subAccounts/${SA}`).get();
if (!saSnap.exists) { console.error(`workspace ${SA} not found, refusing to run`); process.exit(1); }
const AG = String(saSnap.data()?.agencyId ?? "");
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const ctx = { uid: UID, email: "dev@example.com", displayName: "dev", agencyId: AG, subAccountId: SA, subAccountRole: "admin" };
const cap = (n: string) => AI_SUITE_CAPABILITIES.find((c) => c.name === n)!;
const made: string[] = [];
const gateWasOn = saSnap.data()?.socialPlannerEnabledByAgency === true;

async function run(name: string, raw: Record<string, unknown>) {
  const c = cap(name);
  const v = c.validate(raw);
  if (!v.ok) return { outcome: "rejected" as const, error: v.error };
  if (!c.validate(v.args).ok) return { outcome: "rejected" as const, error: "did not re-validate" };
  try { return { outcome: "executed" as const, result: await c.execute(ctx as never, v.args as never) }; }
  catch (e) { return { outcome: e instanceof CapabilityUserError ? ("refused" as const) : ("threw" as const), error: e instanceof Error ? e.message : String(e) }; }
}

try {
  console.log("-- what actually exists --");
  {
    const types = readFileSync("src/types/social.ts", "utf8");
    ck("the product supports exactly Facebook and Instagram",
      /export type SocialPlatform = "facebook" \| "instagram"/.test(types));
    ck("the lifecycle is the existing one",
      /"draft"[\s\S]{0,120}"scheduled"[\s\S]{0,60}"publishing"[\s\S]{0,60}"published"[\s\S]{0,40}"failed"/.test(types));
    const s = readFileSync("src/lib/server/social-posts-service.ts", "utf8");
    ck("scheduling reuses the existing QStash path, no second scheduler",
      /publishSocialPost\(\{ postId/.test(s) && !/setTimeout|cron|node-schedule/.test(s));
    ck("readiness uses the one shared check", /metaCanPublish/.test(s));
    const route = readFileSync("src/app/api/social/publish/step/route.ts", "utf8");
    ck("the publish worker still owns the atomic claim", /scheduled → publishing/.test(route));
  }

  // The gate has to be on for the service to do anything. Turn it on for
  // this run only if it was off, and put it back exactly as found.
  if (!gateWasOn) await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: true });

  console.log("\n-- drafting, and drafting several --");
  {
    const a = await run("create_social_post", { caption: "ZENO DEV W5 post one. Our free Growth Scan shows where leads are leaking." });
    const b = await run("create_social_post", { caption: "ZENO DEV W5 post two. Most owners guess. A Growth Scan measures." });
    const c = await run("create_social_post", { caption: "ZENO DEV W5 post three. #growth #leads Book a Growth Scan this week." });
    ck("three separate drafts are created", [a, b, c].every((r) => r.outcome === "executed"), JSON.stringify([a, b, c].map((r) => r.outcome)));
    for (const r of [a, b, c]) if (r.outcome === "executed") made.push(`socialPosts/${r.result.mutation!.resourceId}`);
    ck("each says plainly that nothing was published",
      [a, b, c].every((r) => r.outcome === "executed" && /NOT PUBLISHED, NOT SCHEDULED/.test(r.result.resultText)));
    ck("the receipt calls them created, never published",
      [a, b, c].every((r) => r.outcome === "executed" && r.result.mutation!.operation === "created"));
    ck("their confirmations say nothing is published",
      /Nothing is published/.test(cap("create_social_post").summarize({ caption: "x" })));
  }

  console.log("\n-- finding them again next turn, without remembering ids --");
  {
    const listed = await run("list_social_posts", {});
    ck("the drafts can be recovered", listed.outcome === "executed");
    if (listed.outcome === "executed") {
      const text = listed.result.resultText;
      ck("all three are there", (text.match(/ZENO DEV W5 post/g) ?? []).length === 3);
      ck("each carries its id, so 'the second one' can be resolved", (text.match(/post_id: /g) ?? []).length >= 3);
      ck("they are numbered, which is how a person refers to them", /^1\. /m.test(text) && /^2\. /m.test(text));
      ck("their state is stated", /\[DRAFT\]/.test(text));
      ck("and it says which Page is connected, or that none is",
        /Connected Page:|No Facebook Page with posting permission/.test(text));
    }
  }

  console.log("\n-- editing one without touching the others --");
  {
    const posts = await svc.listSocialPostsServerSide(SA);
    const mine = posts.filter((p) => p.caption.startsWith("ZENO DEV W5 post"));
    const second = mine.find((p) => p.caption.includes("post two"))!;
    const othersBefore = mine.filter((p) => p.id !== second.id).map((p) => p.caption);
    const r = await run("update_social_post", { post_id: second.id, caption: "ZENO DEV W5 post two, shorter." });
    ck("the named draft changes", r.outcome === "executed", "error" in r ? r.error : "");
    const after = await svc.listSocialPostsServerSide(SA);
    ck("its wording is the new wording",
      after.find((p) => p.id === second.id)?.caption === "ZENO DEV W5 post two, shorter.");
    ck("the other two are untouched",
      othersBefore.every((cpt) => after.some((p) => p.caption === cpt)), JSON.stringify(after.map((p) => p.caption.slice(0, 30))));
    ck("the receipt says updated, not published", r.outcome === "executed" && r.result.mutation!.operation === "updated");
    ck("it still says nothing was published", r.outcome === "executed" && /Still not published/.test(r.result.resultText));
  }

  console.log("\n-- the connection is proven, never taken on trust --");
  {
    const target = await svc.resolvePublishTarget(SA);
    ck("this workspace's connection resolves from storage", target.ok || target.reason === "not_connected", JSON.stringify(target));
    const foreign = await svc.resolvePublishTarget(OTHER_SA);
    ck("another workspace's connection is not reachable from here",
      !foreign.ok, JSON.stringify(foreign));
    const s = readFileSync("src/lib/server/social-posts-service.ts", "utf8");
    ck("the Page is read from the workspace doc, never from an argument",
      /getAdminDb\(\)\.doc\(`subAccounts\/\$\{subAccountId\}`\)/.test(s));
    ck("no capability accepts a page id from the model",
      !/page_id|pageId: \{ type: "string"/.test(readFileSync("src/lib/ai-suite/capabilities.ts", "utf8").slice(
        readFileSync("src/lib/ai-suite/capabilities.ts", "utf8").indexOf('name: "create_social_post"'),
        readFileSync("src/lib/ai-suite/capabilities.ts", "utf8").indexOf('name: "schedule_social_post"') + 4000)));
  }

  console.log("\n-- scheduling is not publishing --");
  {
    const posts = await svc.listSocialPostsServerSide(SA);
    const one = posts.find((p) => p.caption.startsWith("ZENO DEV W5 post one"))!;
    const future = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

    ck("a time in the past is refused",
      cap("schedule_social_post").validate({ post_id: one.id, publish_at: "2020-01-01T00:00:00Z" }).ok === false);
    ck("an unreadable time is refused",
      cap("schedule_social_post").validate({ post_id: one.id, publish_at: "next tuesday-ish" }).ok === false);
    const v = cap("schedule_social_post").validate({ post_id: one.id, publish_at: future, platforms: ["facebook"] });
    ck("a future time validates", v.ok === true);
    if (v.ok) {
      const summary = cap("schedule_social_post").summarize(v.args);
      ck("the confirmation says it goes out publicly", /publish publicly/.test(summary), summary);
      ck("it names when", summary.includes(future));
      ck("it names where", /facebook/.test(summary));
      ck("and it re-validates", cap("schedule_social_post").validate(v.args).ok === true);
    }

    const target = await svc.resolvePublishTarget(SA);
    if (!target.ok) {
      console.log(`    (no publish-capable Page connected: scheduling correctly refuses. reason=${target.reason})`);
      const r = await run("schedule_social_post", { post_id: one.id, publish_at: future, platforms: ["facebook"] });
      ck("without a connected Page, scheduling refuses and says nothing was scheduled",
        r.outcome === "refused" && /haven't scheduled|Nothing was scheduled/.test("error" in r ? r.error : ""), "error" in r ? r.error : r.outcome);
      const still = (await svc.listSocialPostsServerSide(SA)).find((p) => p.id === one.id);
      ck("the post is still a draft", still?.status === "draft");
    } else {
      const r = await run("schedule_social_post", { post_id: one.id, publish_at: future, platforms: ["facebook"] });
      ck("it schedules", r.outcome === "executed", "error" in r ? r.error : "");
      if (r.outcome === "executed") {
        ck("the receipt says scheduled, never published", r.result.mutation!.operation === "scheduled");
        ck("the words say scheduled, not live", /SCHEDULED, not published/.test(r.result.resultText));
        const stored = (await svc.listSocialPostsServerSide(SA)).find((p) => p.id === one.id);
        ck("the post is scheduled, not published", stored?.status === "scheduled");
        ck("a QStash job carries it, not a new scheduler",
          (await db.doc(`socialPosts/${one.id}`).get()).data()?.qstashMessageId != null);
        const again = await run("schedule_social_post", { post_id: one.id, publish_at: future });
        ck("scheduling it twice is refused", again.outcome === "refused");
      }
    }
  }

  console.log("\n-- the scheduling success path, with no way to reach a platform --");
  {
    /**
     * The dev workspace has no Meta connection, so the branch above proved
     * only the refusal. To prove the success path a connection must exist,
     * and a real one is not available and would not be safe if it were.
     *
     * So: a synthetic connection whose token and page id are obviously not
     * real. Nothing can be published with them, by anyone. The post is
     * deleted immediately afterwards, so the QStash job that carries it
     * finds no document and no-ops, which is the worker's existing
     * behaviour for a deleted post. The connection is removed at the end,
     * restoring exactly what was there, which was nothing.
     */
    const before = (await db.doc(`subAccounts/${SA}`).get()).data()?.metaConfig ?? null;
    ck("there was no real connection to disturb", before === null);
    if (before === null) {
      const { FieldValue } = await import("firebase-admin/firestore");
      await db.doc(`subAccounts/${SA}`).update({
        metaConfig: {
          // metaCanPublish requires BOTH an explicit connected flag and the
          // publish capability. A fixture missing either one is not
          // publish-ready, which is the behaviour, not an oversight.
          connected: true,
          pageId: "ZENO-DEV-NOT-A-REAL-PAGE",
          pageName: "ZENO DEV Fake Page",
          pageAccessToken: "ZENO-DEV-NOT-A-REAL-TOKEN",
          instagramBusinessAccountId: null,
          instagramUsername: null,
          capabilities: { inbox: false, publish: true },
        },
      });
      try {
        const posts = await svc.listSocialPostsServerSide(SA);
        const one = posts.find((x) => x.caption.startsWith("ZENO DEV W5 post one"))!;
        const future = new Date(Date.now() + 7 * 24 * 3600_000);

        const target = await svc.resolvePublishTarget(SA);
        ck("a publish-capable connection now resolves", target.ok && target.pageName === "ZENO DEV Fake Page");

        /**
         * QStash will not accept a callback to a loopback address, and
         * NEXT_PUBLIC_APP_URL is localhost in a dev shell. Pointing it at
         * production to get past that would schedule a job that calls
         * production, so it is not done.
         *
         * What that leaves is worth testing on its own: when the scheduler
         * refuses, the post must not be left half-scheduled. A post marked
         * scheduled with no job behind it never goes out and never appears
         * as a draft again, which is the worst of both.
         */
        const r = await run("schedule_social_post", { post_id: one.id, publish_at: future.toISOString(), platforms: ["facebook"] });
        const localhostQstash = r.outcome === "refused" && /scheduler wouldn't accept it/.test("error" in r ? r.error : "");
        if (localhostQstash) {
          console.log("    (QStash rejects a loopback callback URL from a dev shell: asserting no partial state instead)");
          const stored = (await db.doc(`socialPosts/${one.id}`).get()).data()!;
          ck("a refused schedule leaves the post a draft", stored.status === "draft");
          ck("with no schedule time", stored.scheduledAt == null);
          ck("and no orphan job id", stored.qstashMessageId == null);
          ck("the customer is told nothing was scheduled", /Nothing was scheduled/.test("error" in r ? r.error : ""));
          ck("and it can still be edited afterwards",
            (await run("update_social_post", { post_id: one.id, caption: "ZENO DEV W5 post one, still editable." })).outcome === "executed");
        } else {
          ck("it schedules", r.outcome === "executed", "error" in r ? r.error : "");
        }
        if (r.outcome === "executed") {
          ck("the receipt says scheduled, never published", r.result.mutation!.operation === "scheduled");
          ck("the words say scheduled, not live",
            /SCHEDULED, not published/.test(r.result.resultText) && !/\blive\b/i.test(r.result.resultText));
          ck("it names the Page it will post to", /ZENO DEV Fake Page/.test(r.result.resultText));
          const stored = (await db.doc(`socialPosts/${one.id}`).get()).data()!;
          ck("the post is scheduled, not published", stored.status === "scheduled");
          ck("nothing has been published on any platform",
            (stored.results ?? []).every((x: { status: string }) => x.status === "pending"));
          ck("publishedAt is still empty", stored.publishedAt == null);
          ck("the existing QStash scheduler carries it", typeof stored.qstashMessageId === "string" && stored.qstashMessageId.length > 0);
          ck("the schedule time is the one that was asked for",
            Math.abs((stored.scheduledAt?.toDate?.()?.getTime?.() ?? 0) - future.getTime()) < 2000);

          const again = await run("schedule_social_post", { post_id: one.id, publish_at: future.toISOString() });
          ck("scheduling the same post twice is refused", again.outcome === "refused", "error" in again ? again.error : again.outcome);
          const edit = await run("update_social_post", { post_id: one.id, caption: "changed after scheduling" });
          ck("a scheduled post can still be edited before it goes", edit.outcome === "executed", "error" in edit ? edit.error : "");
        }

        // Instagram without an image must be refused even WITH a connection.
        const three = (await svc.listSocialPostsServerSide(SA)).find((x) => x.caption.includes("post three"))!;
        const ig = await run("schedule_social_post", { post_id: three.id, publish_at: future.toISOString(), platforms: ["instagram"] });
        // It must be refused FOR THAT REASON. Accepting any refusal let a
        // mutation removing the check pass, because the loopback scheduler
        // refused it a moment later for an unrelated reason.
        ck("Instagram without an image is refused, and for that reason",
          ig.outcome === "refused" && /Instagram needs an image/.test("error" in ig ? ig.error : ""), "error" in ig ? ig.error : ig.outcome);
        // The pure rule, independent of any environment.
        const igRule = svc.validateForPublish({ caption: "words", imageUrl: null, targets: ["instagram"],
          target: { ok: true, pageId: "p", pageName: "P", instagramBusinessAccountId: "ig", instagramUsername: null } });
        ck("the shared rule says Instagram needs an image",
          !igRule.ok && igRule.reason === "invalid" && /Instagram needs an image/.test(igRule.detail));
        const fbRule = svc.validateForPublish({ caption: "words", imageUrl: null, targets: ["facebook"],
          target: { ok: true, pageId: "p", pageName: "P", instagramBusinessAccountId: null, instagramUsername: null } });
        ck("Facebook alone does not", fbRule.ok === true);
        const igNoLink = await run("schedule_social_post", { post_id: three.id, publish_at: future.toISOString(), platforms: ["instagram"] });
        ck("and it stays a draft", (await db.doc(`socialPosts/${three.id}`).get()).data()?.status === "draft" && igNoLink.outcome === "refused");
        // Scheduling twice, tested at the service so it does not depend on
        // a scheduler this shell cannot reach.
        const twice = (await svc.listSocialPostsServerSide(SA)).find((x) => x.caption.includes("post two"))!;
        await db.doc(`socialPosts/${twice.id}`).update({ status: "scheduled" });
        const dup = await svc.scheduleSocialPostServerSide({ subAccountId: SA, postId: twice.id, when: new Date(Date.now() + 86_400_000), targets: ["facebook"] });
        ck("a post that is already scheduled cannot be scheduled again",
          !dup.ok && dup.reason === "already_gone", JSON.stringify(dup));
        await db.doc(`socialPosts/${twice.id}`).update({ status: "published" });
        const pub = await svc.scheduleSocialPostServerSide({ subAccountId: SA, postId: twice.id, when: new Date(Date.now() + 86_400_000), targets: ["facebook"] });
        ck("a post that has gone out cannot be scheduled again",
          !pub.ok && pub.reason === "already_gone" && /already gone out/.test(pub.detail), JSON.stringify(pub));
        await db.doc(`socialPosts/${twice.id}`).update({ status: "draft" });
      } finally {
        // Exactly what was there before: nothing.
        await db.doc(`subAccounts/${SA}`).update({ metaConfig: FieldValue.delete() });
        const restored = (await db.doc(`subAccounts/${SA}`).get()).data()?.metaConfig ?? null;
        ck("the synthetic connection was removed", restored === null);
      }
    }
  }

  console.log("\n-- adversarial: nothing may reach a platform --");
  {
    const posts = await svc.listSocialPostsServerSide(SA);
    const one = posts.find((p) => p.caption.startsWith("ZENO DEV W5 post three"))!;
    const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();

    // A post from another workspace.
    const foreign = db.collection("socialPosts").doc();
    await foreign.set({ subAccountId: OTHER_SA, agencyId: AG, createdByUid: UID, caption: "ZENO DEV W5 foreign",
      imageUrl: null, targets: [], status: "draft", scheduledAt: null, publishedAt: null, results: [],
      qstashMessageId: null, createdAt: new Date(), updatedAt: new Date() });
    made.push(`socialPosts/${foreign.id}`);
    ck("a post from another workspace reads as missing",
      (await svc.getSocialPostServerSide(SA, foreign.id)) === null);
    const fe = await run("update_social_post", { post_id: foreign.id, caption: "hijacked" });
    ck("editing it is refused, indistinguishable from missing",
      fe.outcome === "refused" && /can't find that post/.test("error" in fe ? fe.error : ""));
    ck("and it was not changed",
      (await db.doc(`socialPosts/${foreign.id}`).get()).data()?.caption === "ZENO DEV W5 foreign");
    const fs2 = await run("schedule_social_post", { post_id: foreign.id, publish_at: future });
    ck("scheduling it is refused", fs2.outcome === "refused");

    const cases: [string, string, Record<string, unknown>][] = [
      ["a post that does not exist", "update_social_post", { post_id: "nothingHere", caption: "x" }],
      ["an empty caption", "create_social_post", { caption: "   " }],

      ["instagram with no image", "create_social_post", { caption: "x", platforms: ["instagram"] }],
      ["an edit with nothing to change", "update_social_post", { post_id: one.id }],
      ["scheduling with no time", "schedule_social_post", { post_id: one.id }],
    ];
    for (const [label, name, raw] of cases) {
      const r = await run(name, raw);
      ck(`${label}: refused`, r.outcome === "rejected" || r.outcome === "refused", `${r.outcome} ${"error" in r ? r.error : ""}`);
    }

    // An invented image must be stopped at VALIDATION, not merely caught
    // by the service afterwards. Accepting "refused" as proof let a
    // mutation that removed the capability's own check pass, because
    // defence in depth caught it one layer down.
    for (const [label, raw] of [
      ["an invented image link", { caption: "x", image_url: "our-photo.jpg" }],
      ["an http image link", { caption: "x", image_url: "http://insecure.test/a.jpg" }],
      ["a data: image", { caption: "x", image_url: "data:image/png;base64,AAAA" }],
    ] as [string, Record<string, unknown>][]) {
      const v = cap("create_social_post").validate(raw);
      ck(`${label}: refused before anything is created`, v.ok === false, v.ok ? "IT VALIDATED" : v.error);
    }
    // And the service refuses it independently, which is the second layer.
    const svcImg = await svc.createSocialDraftServerSide({ subAccountId: SA, createdByUid: UID, caption: "x", imageUrl: "our-photo.jpg" });
    ck("the service refuses it too, independently", !svcImg.ok && svcImg.reason === "invalid");

    // A published post cannot be silently reworded.
    await db.doc(`socialPosts/${one.id}`).update({ status: "published" });
    const pe = await run("update_social_post", { post_id: one.id, caption: "rewritten after the fact" });
    ck("a published post cannot be edited", pe.outcome === "refused" && /already gone out/.test("error" in pe ? pe.error : ""));
    await db.doc(`socialPosts/${one.id}`).update({ status: "draft" });
  }

  console.log("\n-- the agency gate, with it off --");
  {
    // The suite turns the gate on to exercise everything else, which meant
    // removing the gate check changed nothing and the mutation survived.
    await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: false });
    try {
      const c = await run("create_social_post", { caption: "ZENO DEV W5 gate-off attempt" });
      ck("with the gate off, drafting is refused", c.outcome === "refused", "error" in c ? c.error : c.outcome);
      ck("and it says who can turn it on",
        "error" in c && /Social Planner is switched off/.test(c.error));
      const svcRes = await svc.createSocialDraftServerSide({ subAccountId: SA, createdByUid: UID, caption: "gate off" });
      ck("the service refuses independently of the capability", !svcRes.ok && svcRes.reason === "gate_off");
      const target = await svc.resolvePublishTarget(SA);
      ck("and nothing is publishable while it is off", !target.ok && target.reason === "gate_off");
      const posts = await svc.listSocialPostsServerSide(SA);
      const any = posts.find((x) => x.caption.startsWith("ZENO DEV W5"));
      if (any) {
        const sch = await svc.scheduleSocialPostServerSide({ subAccountId: SA, postId: any.id, when: new Date(Date.now() + 86_400_000), targets: ["facebook"] });
        ck("scheduling is refused while the gate is off", !sch.ok && sch.reason === "gate_off", JSON.stringify(sch));
      }
      const leaked = (await db.collection("socialPosts").where("subAccountId", "==", SA).get())
        .docs.filter((d) => /gate-off attempt/.test(String(d.data().caption ?? "")));
      ck("nothing was written while the gate was off", leaked.length === 0, `${leaked.length} written`);
      // If the gate ever fails to hold, whatever it let through is removed
      // here rather than left behind for the next run to trip over. A
      // mutation run did exactly that and the stray then failed an
      // unrelated assertion, which is a confusing way to learn about it.
      for (const d of leaked) made.push(`socialPosts/${d.id}`);
    } finally {
      await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: true });
    }
  }

  console.log("\n-- grounding: the model may invent the argument, not the evidence --");
  {
    const d = cap("create_social_post").description;
    ck("it is told never to invent evidence", /never invent testimonials, customer numbers, revenue, discounts, deadlines, awards, certifications or results/.test(d));
    ck("and the distinction is stated", /invent the argument, never the evidence/.test(d));
    ck("and never to invent an image", /never invent one/.test(d));
  }

  console.log("\n-- analytics: absent, and said to be absent --");
  {
    const names = AI_SUITE_CAPABILITIES.map((c) => c.name);
    ck("no capability claims to read social performance",
      !names.some((n) => /social.*(insight|analytic|performance|metric)/i.test(n)), names.filter((n) => /social/.test(n)).join(", "));
    const meta = readFileSync("src/lib/comms/meta.ts", "utf8");
    ck("nothing in the product reads Graph insights today", !/\/insights|insights\?/.test(meta));
  }
} catch (err) {
  // An aborted run is a failed run. Without this a throw escapes to the
  // finally, which prints a result from a counter that was never
  // incremented, and a run that blew up reports ALL PASS.
  fails++;
  console.log(`FAIL  the suite threw before finishing - ${err instanceof Error ? err.message : String(err)}`);
} finally {
  if (!gateWasOn) await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: false });
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const strays = (await db.collection("socialPosts").where("subAccountId", "==", SA).get())
    .docs.filter((d) => /ZENO DEV W5/.test(String(d.data().caption ?? ""))).length;
  console.log(`\ngate restored to ${gateWasOn}; cleaned up ${made.length}; strays: ${strays}`);
  if (strays > 0) fails++;
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
