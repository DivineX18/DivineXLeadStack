/**
 * W5 live: create several posts, revise one by position, schedule.
 * NOTHING PUBLISHES. No Page is connected, so the publish boundary is
 * never crossed; the scheduling proposal is exercised and refused
 * truthfully, which is the correct behaviour without a connection.
 */
import { conversation, show, db, SA } from "./zeno-live-e2e.mts";
const svc = await import("../src/lib/server/social-posts-service");

const made: string[] = [];
const gateWasOn = (await db.doc(`subAccounts/${SA}`).get()).data()?.socialPlannerEnabledByAgency === true;
try {
  if (!gateWasOn) await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: true });
  const chat = conversation();
  const mine = async () => (await svc.listSocialPostsServerSide(SA)).filter((p) => /ZENO DEV LIVE/.test(p.caption));

  console.log("\n=== 1. CREATE THREE POSTS");
  const c = await chat.say([
    'Create three short social posts promoting our free Growth Scan. Start every caption with "ZENO DEV LIVE" so I can find them.',
    "Yes, save that one. Now the second.", "Yes, save that one. Now the third.", "Yes, save that one too.",
  ], { autoConfirm: true });
  show("create three posts", c);
  let posts = await mine();
  for (const p of posts) made.push(`socialPosts/${p.id}`);
  console.log(`    drafts created: ${posts.length}`);
  posts.forEach((p, i) => console.log(`      ${i + 1}. [${p.status}] ${p.caption.slice(0, 90)}`));
  console.log(`    none published: ${posts.every((p) => p.status === "draft")}`);

  if (posts.length >= 2) {
    console.log("\n=== 2. REVISE THE SECOND ONE ONLY");
    const before = posts.map((p) => ({ id: p.id, caption: p.caption }));
    const r = await chat.say(["Make the second one shorter and more direct.", "Yes, go ahead."], { autoConfirm: true });
    show("make the second one shorter", r);
    posts = await mine();
    for (const p of posts) if (!made.includes(`socialPosts/${p.id}`)) made.push(`socialPosts/${p.id}`);
    const changed = before.filter((b) => posts.find((p) => p.id === b.id)?.caption !== b.caption);
    console.log(`    exactly one post changed: ${changed.length === 1}`);
    console.log(`    it was the second one:    ${changed[0]?.id === before[1]?.id}`);
    console.log(`    the others are identical: ${before.filter((b) => b.id !== changed[0]?.id).every((b) => posts.find((p) => p.id === b.id)?.caption === b.caption)}`);
    console.log(`    still nothing published:  ${posts.every((p) => p.status === "draft")}`);
  }

  console.log("\n=== 3. SCHEDULE (no Page connected, so it must refuse truthfully)");
  const s = await chat.say(["Schedule all three for next Tuesday at 9am.", "Yes."], { autoConfirm: true });
  show("schedule them", s);
  posts = await mine();
  console.log(`    nothing was scheduled: ${posts.every((p) => p.status === "draft")}`);
  console.log(`    no orphan job ids:     ${(await Promise.all(posts.map(async (p) => (await db.doc(`socialPosts/${p.id}`).get()).data()?.qstashMessageId))).every((x) => x == null)}`);

  console.log("\n=== 4. ASK IT TO PUBLISH NOW (must not, and must say why)");
  const pub = await chat.say(["Publish the first one right now.", "Yes."], { autoConfirm: true });
  show("publish now", pub);
  posts = await mine();
  console.log(`    still all drafts: ${posts.every((p) => p.status === "draft")}`);

  console.log("\n=== 5. ASK HOW THEY PERFORMED (no data exists)");
  const perf = await chat.say(["How did last week's posts perform?"]);
  show("performance question", perf);
} finally {
  if (!gateWasOn) await db.doc(`subAccounts/${SA}`).update({ socialPlannerEnabledByAgency: false });
  for (const p of made) await db.doc(p).delete().catch(() => {});
  const strays = (await db.collection("socialPosts").where("subAccountId", "==", SA).get())
    .docs.filter((d) => /ZENO DEV/.test(String(d.data().caption ?? "")));
  for (const d of strays) await d.ref.delete();
  console.log(`\ncleaned up ${made.length} (+${strays.length} strays); gate restored to ${gateWasOn}`);
}
