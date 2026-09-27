/**
 * W6 — Telegram as another way in, not another assistant.
 *
 * Everything below the transport is the real thing: the real identity
 * layer, the real gateway, the real orchestrator, the real confirmation
 * boundary. Only the wire is replaced, because a regression run should
 * not need Telegram to deliver a message.
 *
 * The cases that matter are the ones where a Telegram account could reach
 * something it should not, or where one tap could act twice.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-telegram-gateway.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
// The transport is never reached in this file, but the handler checks it.
process.env.TELEGRAM_BOT_TOKEN ??= "ZENO-DEV-NOT-A-REAL-BOT-TOKEN";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "ZENO-DEV-NOT-A-REAL-WEBHOOK-SECRET";
process.env.TELEGRAM_BOT_USERNAME ??= "zeno_dev_bot";

const { getAdminDb } = await import("../src/lib/firebase/admin");
const id = await import("../src/lib/telegram/identity");
const gw = await import("../src/lib/telegram/gateway");
const tr = await import("../src/lib/telegram/transport");
const pr = await import("../src/lib/telegram/proposals");
const { handleTelegramUpdate } = await import("../src/lib/telegram/handle-update");

const db = getAdminDb();
let fails = 0;
const ck = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`); if (!ok) fails++; };
const SA = process.env.ZENO_DEV_SA ?? "MEYB8CbWlE5fxAn3TJOp";
const OTHER_SA = "2rLhSqe7lBjghhZOOaFh";
const UID = "irkY5HKIzxb64l5qCyHroTrudJa2";
const OTHER_UID = "mq4ylEei7LNpjXknHCAzytePqTv1";
const TG = "999000111";       // synthetic Telegram user ids
const TG_OTHER = "999000222";
const CHAT = "555000111";
if (!(await db.doc(`subAccounts/${SA}`).get()).exists) { console.error("dev workspace missing, refusing"); process.exit(1); }

const made: string[] = [];
let seq = 1;
const nextUpdateId = () => Number(`${Date.now()}`.slice(-8)) * 100 + seq++;
const msg = (text: string, from = TG, updateId = nextUpdateId()) => ({
  updateId, telegramUserId: from, chatId: CHAT, username: "devtester",
  text, callback: null, fromBot: false,
});
const tap = (data: string, from = TG, updateId = nextUpdateId()) => ({
  updateId, telegramUserId: from, chatId: CHAT, username: "devtester",
  text: null, callback: { id: `cb${updateId}`, data }, fromBot: false,
});
const cleanupTelegram = async () => {
  for (const tgid of [TG, TG_OTHER]) {
    const threads = await db.collection(`telegramLinks/${tgid}/threads`).get();
    for (const t of threads.docs) await t.ref.delete();
    await db.doc(`telegramLinks/${tgid}`).delete().catch(() => {});
  }
  for (const c of ["telegramLinkTokens", "telegramProposals"]) {
    const snap = await db.collection(c).get();
    for (const d of snap.docs) {
      const x = d.data();
      if (x.uid === UID || x.uid === OTHER_UID || x.telegramUserId === TG || x.telegramUserId === TG_OTHER) await d.ref.delete();
    }
  }
};

try {
  await cleanupTelegram();

  console.log("-- the wire: only Telegram may speak to the webhook --");
  {
    ck("a missing secret header is refused", tr.verifyTelegramSecret(null) === false);
    ck("a wrong secret is refused", tr.verifyTelegramSecret("nope") === false);
    ck("the right secret is accepted", tr.verifyTelegramSecret(process.env.TELEGRAM_WEBHOOK_SECRET!) === true);
    ck("a shorter prefix of the secret is refused",
      tr.verifyTelegramSecret(process.env.TELEGRAM_WEBHOOK_SECRET!.slice(0, 5)) === false);
    const route = readFileSync("src/app/api/webhooks/telegram/route.ts", "utf8");
    ck("the secret is checked before the body is read",
      route.indexOf("verifyTelegramSecret") < route.indexOf("await request.json()"));
    ck("the URL is not treated as the credential", /credential is Telegram's own secret token/.test(route));
    ck("it answers 200 after that, so Telegram does not retry into a second turn",
      (route.match(/NextResponse\.json\(\{ ok: true \}\)/g) ?? []).length >= 3);

    // Malformed updates fail closed.
    for (const bad of [null, {}, { update_id: 1 }, { update_id: 1, message: {} }, "text", 7, { message: { from: { id: 1 } } }]) {
      ck(`a malformed update is ignored: ${JSON.stringify(bad)?.slice(0, 30)}`, tr.parseTelegramUpdate(bad) === null);
    }
    const good = tr.parseTelegramUpdate({ update_id: 5, message: { text: "hi", from: { id: 42, username: "x" }, chat: { id: 7 } } });
    ck("a real message parses", good?.text === "hi" && good.telegramUserId === "42" && good.chatId === "7");
    const bot = tr.parseTelegramUpdate({ update_id: 6, message: { text: "hi", from: { id: 42, is_bot: true }, chat: { id: 7 } } });
    ck("a bot's message is marked as such", bot?.fromBot === true);
    ck("and the handler drops it, so nothing can answer itself",
      (await handleTelegramUpdate({ ...msg("hello"), fromBot: true })).reply === null);
    const photo = tr.parseTelegramUpdate({ update_id: 7, message: { photo: [], from: { id: 42 }, chat: { id: 7 } } });
    ck("a message with no text is ignored", photo === null);
  }

  console.log("\n-- an unlinked Telegram account reaches nothing --");
  {
    const r = await handleTelegramUpdate(msg("How many leads came in today?"));
    ck("it is told to connect, and nothing else", /Connect Telegram/.test(r.reply?.text ?? ""), r.reply?.text?.slice(0, 60));
    // The real invariant, and it cannot be argued with: the answer to an
    // unlinked account is IDENTICAL whoever is asking. Checking for
    // workspace names was the wrong test, because one workspace is called
    // DivineX and the message legitimately says "Open DivineX".
    const asOther = await handleTelegramUpdate(msg("How many leads came in today?", TG_OTHER));
    ck("the reply to an unlinked account is the same whoever asks",
      r.reply?.text === asOther.reply?.text, `${r.reply?.text?.slice(0, 40)} vs ${asOther.reply?.text?.slice(0, 40)}`);
    ck("so nothing distinguishes a known Telegram account from an unknown one",
      !/already|welcome back|your account|again/i.test(r.reply?.text ?? ""));
    const r2 = await handleTelegramUpdate(msg("Move Sarah to Qualified."));
    ck("a consequential request from an unlinked account does nothing", /Connect Telegram/.test(r2.reply?.text ?? ""));
    const r3 = await handleTelegramUpdate(msg("/start"));
    ck("/start with no token explains how to connect", /Connect Telegram/.test(r3.reply?.text ?? ""));
  }

  console.log("\n-- linking begins inside an authenticated session --");
  {
    const bad = await handleTelegramUpdate(msg("/start not-a-real-token"));
    ck("an invented token is refused", /didn't work/.test(bad.reply?.text ?? ""));
    ck("and it says nothing about whether one existed", !/expired|used/.test((bad.reply?.text ?? "").split(".")[0]));

    const { token, expiresAt } = await id.createTelegramLinkToken(UID);
    ck("a token is short lived", expiresAt.getTime() - Date.now() <= 10 * 60 * 1000 + 1000);
    const digests = await db.collection("telegramLinkTokens").get();
    ck("only the hash is stored, never the token",
      digests.docs.every((d) => d.id !== token) && !JSON.stringify(digests.docs.map((d) => d.data())).includes(token));

    const ok = await handleTelegramUpdate(msg(`/start ${token}`));
    ck("a real token links the account", /Connected/.test(ok.reply?.text ?? ""), ok.reply?.text?.slice(0, 70));
    const link = await id.getTelegramLink(TG);
    ck("the mapping points at the DivineX user", link?.uid === UID);

    // Single use, even from a different Telegram account.
    const replay = await handleTelegramUpdate(msg(`/start ${token}`, TG_OTHER));
    ck("the same token cannot be used again", /didn't work/.test(replay.reply?.text ?? ""));
    ck("and it did not link the second account", (await id.getTelegramLink(TG_OTHER)) === null);

    // An expired token.
    const { token: stale } = await id.createTelegramLinkToken(UID);
    const { createHash } = await import("node:crypto");
    await db.collection("telegramLinkTokens").doc(createHash("sha256").update(stale).digest("hex"))
      .set({ expiresAt: new Date(Date.now() - 1000) }, { merge: true });
    const expired = await id.redeemTelegramLinkToken({ token: stale, telegramUserId: TG_OTHER, chatId: CHAT });
    ck("an expired token is refused", !expired.ok && expired.reason === "expired");

    // A Telegram account already bound elsewhere is not silently re-pointed.
    const { token: t2 } = await id.createTelegramLinkToken(OTHER_UID);
    const conflict = await id.redeemTelegramLinkToken({ token: t2, telegramUserId: TG, chatId: CHAT });
    ck("an account linked to someone else is refused, never moved",
      !conflict.ok && conflict.reason === "already_linked_elsewhere");
    ck("and the original mapping is intact", (await id.getTelegramLink(TG))?.uid === UID);
  }

  console.log("\n-- permission is re-derived, never remembered --");
  {
    const link = (await id.getTelegramLink(TG))!;
    const actor = { link, uid: UID, email: "dev@example.com", displayName: "dev" };
    const spaces = await gw.authorizedWorkspaces(UID);
    ck("workspaces come from live membership", spaces.length > 0, `${spaces.length} workspaces`);
    /**
     * BEHAVIOUR, not the shape of the source. Asserting that the roster
     * path appears in the file survived a mutation that removed the check
     * and kept the read.
     *
     * The denormalized index can lag a removal, so a stale entry is planted
     * pointing at a workspace this person is NOT a member of. It must not
     * appear, because losing access on the web has to mean losing it here.
     */
    {
      // A workspace of its own, with no membership row, so the only thing
      // pointing at it is the stale index. Removed either way.
      const staleId = `zeno-dev-w6-stale-${Date.now()}`;
      const idxRef = db.doc(`userMemberships/${UID}/subAccounts/${staleId}`);
      await db.doc(`subAccounts/${staleId}`).set({
        name: "ZENO DEV W6 stale target", agencyId: "zeno-dev", aiSuiteEnabledByAgency: true,
      });
      await idxRef.set({ subAccountId: staleId, role: "admin", status: "active" });
      try {
        const withStale = await gw.authorizedWorkspaces(UID);
        ck("a stale index entry does not grant a workspace",
          !withStale.some((w) => w.subAccountId === staleId),
          withStale.filter((w) => w.subAccountId === staleId).map((w) => w.subAccountName).join(","));
        // And the same person WITH a membership row does get it, so the
        // test above is not passing for an unrelated reason.
        await db.doc(`subAccounts/${staleId}/subAccountMembers/${UID}`).set({ uid: UID, role: "admin", status: "active" });
        const withMember = await gw.authorizedWorkspaces(UID);
        ck("and a real membership row does grant it",
          withMember.some((w) => w.subAccountId === staleId));
        // A removed member loses it again, which is the revocation path.
        await db.doc(`subAccounts/${staleId}/subAccountMembers/${UID}`).set({ status: "removed" }, { merge: true });
        const afterRemoval = await gw.authorizedWorkspaces(UID);
        ck("a removed member loses it immediately, with nothing revoked here",
          !afterRemoval.some((w) => w.subAccountId === staleId));
      } finally {
        await db.doc(`subAccounts/${staleId}/subAccountMembers/${UID}`).delete().catch(() => {});
        await db.doc(`subAccounts/${staleId}`).delete().catch(() => {});
        await idxRef.delete().catch(() => {});
      }
    }

    // The assistant gate, turned off on a workspace they DO have.
    const gated = spaces[0];
    const gateBefore = (await db.doc(`subAccounts/${gated.subAccountId}`).get()).data()?.aiSuiteEnabledByAgency;
    await db.doc(`subAccounts/${gated.subAccountId}`).update({ aiSuiteEnabledByAgency: false });
    try {
      const without = await gw.authorizedWorkspaces(UID);
      ck("a workspace with the assistant switched off is not offered",
        !without.some((w) => w.subAccountId === gated.subAccountId),
        without.map((w) => w.subAccountName).join(","));
    } finally {
      await db.doc(`subAccounts/${gated.subAccountId}`).update({ aiSuiteEnabledByAgency: gateBefore ?? false });
    }

    // Pointing the link at a workspace they cannot use must not grant it.
    await id.setTelegramActiveWorkspace(TG, "a-workspace-they-cannot-see");
    const resolved = await gw.resolveWorkspace({ ...actor, link: (await id.getTelegramLink(TG))! });
    ck("a remembered workspace they no longer have is dropped, not used",
      resolved.kind !== "ready" || resolved.workspace.subAccountId !== "a-workspace-they-cannot-see",
      JSON.stringify(resolved).slice(0, 80));
    ck("and it is forgotten rather than left pointing there",
      (await id.getTelegramLink(TG))?.activeSubAccountId !== "a-workspace-they-cannot-see");

    const allowed = spaces.map((w) => w.subAccountName);
    const unreachable = (await db.collection("subAccounts").limit(30).get()).docs
      .map((d) => String(d.data().name ?? "")).find((n) => n && !allowed.includes(n));
    if (unreachable) {
      const denied = await gw.chooseWorkspaceByName({ ...actor, link: (await id.getTelegramLink(TG))! }, unreachable);
      ck(`naming a workspace they cannot use does not switch to it`,
        !denied.ok || denied.workspace.subAccountName !== unreachable, JSON.stringify(denied).slice(0, 90));
    }

    /**
     * AMBIGUITY MUST ASK. Acting in the wrong workspace is the one mistake
     * this layer cannot make, and a first version of this accepted "it
     * picked one of the allowed ones", which a mutation that always picks
     * the first satisfied.
     */
    if (spaces.length >= 2) {
      const common = "a";
      const matchesMany = spaces.filter((w) => w.subAccountName.toLowerCase().includes(common)).length >= 2;
      if (matchesMany) {
        const ambiguous = await gw.chooseWorkspaceByName({ ...actor, link: (await id.getTelegramLink(TG))! }, common);
        ck("a name matching several workspaces asks instead of picking",
          ambiguous.ok === false, ambiguous.ok ? `picked ${ambiguous.workspace.subAccountName}` : "asked");
        ck("and it lists what they can choose from",
          ambiguous.ok === false && ambiguous.options.length >= 2);
      }
      const nonsense = await gw.chooseWorkspaceByName({ ...actor, link: (await id.getTelegramLink(TG))! }, "zzz-no-such-workspace");
      ck("a name matching nothing does not fall back to one", nonsense.ok === false,
        nonsense.ok ? `picked ${nonsense.workspace.subAccountName}` : "asked");
    }
  }

  console.log("\n-- one update, one turn --");
  {
    const u = msg("hello");
    const first = await gw.claimTelegramUpdate(u.updateId);
    const second = await gw.claimTelegramUpdate(u.updateId);
    ck("the first delivery is claimed", first === true);
    ck("a retry of the same update is not", second === false);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => gw.claimTelegramUpdate(u.updateId + 1)));
    ck("five concurrent deliveries yield exactly one turn", concurrent.filter(Boolean).length === 1);
    made.push(`telegramUpdates/${u.updateId}`, `telegramUpdates/${u.updateId + 1}`);
    const dup = await handleTelegramUpdate({ ...msg("hello"), updateId: u.updateId });
    ck("the handler ignores a duplicate outright", dup.reply === null && /duplicate/.test(dup.note));
  }

  console.log("\n-- a button carries a reference, not an instruction --");
  {
    const pid = await pr.storeTelegramProposal({
      telegramUserId: TG, uid: UID, subAccountId: SA,
      capability: "update_member_role", args: { memberId: "someone", role: "admin" },
      summary: "Make someone an admin.",
    });
    made.push(`telegramProposals/${pid}`);
    ck("the reference is short enough for Telegram's 64 byte limit", `c:${pid}`.length <= 64, `${`c:${pid}`.length} bytes`);
    ck("it is opaque, carrying no arguments", !/someone|admin|update_member_role/.test(pid));

    const mine = await pr.loadTelegramProposal({ id: pid, telegramUserId: TG, uid: UID, subAccountId: SA });
    ck("the owner can load it", mine.ok === true);
    const theirs = await pr.loadTelegramProposal({ id: pid, telegramUserId: TG_OTHER, uid: UID, subAccountId: SA });
    ck("another Telegram account cannot", !theirs.ok && theirs.reason === "not_yours");
    const otherUser = await pr.loadTelegramProposal({ id: pid, telegramUserId: TG, uid: OTHER_UID, subAccountId: SA });
    ck("another DivineX user cannot", !otherUser.ok && otherUser.reason === "not_yours");
    const otherWs = await pr.loadTelegramProposal({ id: pid, telegramUserId: TG, uid: UID, subAccountId: OTHER_SA });
    ck("and it cannot be acted on from another workspace", !otherWs.ok && otherWs.reason === "wrong_workspace");
    const guessed = await pr.loadTelegramProposal({ id: "notARealProposalId", telegramUserId: TG, uid: UID, subAccountId: SA });
    ck("a guessed id reveals nothing", !guessed.ok && guessed.reason === "missing");

    await pr.settleTelegramProposal(pid, "confirmed");
    const again = await pr.loadTelegramProposal({ id: pid, telegramUserId: TG, uid: UID, subAccountId: SA });
    ck("a settled proposal cannot be pressed twice", !again.ok && again.reason === "already_settled");

    const handler = readFileSync("src/lib/telegram/handle-update.ts", "utf8");
    ck("the callback data is only a prefix and an id", /const CONFIRM_PREFIX = "c:"/.test(handler));
    ck("arguments are reloaded from the server, never from the tap",
      /loaded\.proposal\.args/.test(handler) && !/JSON\.parse\(update\.callback\.data\)/.test(handler));
    ck("the confirmation runs through the shared execution boundary",
      /executeZenoConfirmation\(/.test(handler));
    ck("and the claim key is bound to the proposal", /proposalId: `tg_\$\{id\}`/.test(handler));
  }

  console.log("\n-- there is one Zeno --");
  {
    const gwSrc = readFileSync("src/lib/telegram/gateway.ts", "utf8");
    const handler = readFileSync("src/lib/telegram/handle-update.ts", "utf8");
    ck("Telegram calls the shared orchestrator", /runZenoTurn\(/.test(gwSrc));
    ck("it does not build its own system prompt", !/buildAiSuiteSystemPrompt|You are Zeno/.test(gwSrc + handler));
    ck("it does not build its own tool list", !/toolsForLevel|AI_SUITE_CAPABILITIES/.test(gwSrc + handler));
    ck("it does not call a capability directly", !/\.execute\(/.test(gwSrc + handler));
    ck("only the channel differs", /channel: "telegram"/.test(gwSrc));
    const orch = readFileSync("src/lib/ai-suite/orchestrator.ts", "utf8");
    // Comments mention these words while explaining why they are absent,
    // so the code is examined with comments stripped rather than the file.
    const orchCode = orch
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    ck("the orchestrator never reads a request, a cookie or a header",
      !/\brequest\.|cookies\(\)|\bheaders\(\)/.test(orchCode),
      (orchCode.match(/.*(\brequest\.|cookies\(\)|\bheaders\(\)).*/)?.[0] ?? "").trim().slice(0, 70));
    ck("and it takes no Request parameter at all", !/: Request\b/.test(orchCode));
    ck("and it does not authenticate, it is given a proven actor",
      /does NOT do: authenticate/i.test(orch) || /DELIBERATELY DOES NOT DO: authenticate/.test(orch));
    const webRoute = readFileSync("src/app/api/ai-suite/chat/route.ts", "utf8");
    ck("the web route delegates to the same orchestrator", /runZenoTurn\(\{/.test(webRoute));
    ck("and the confirm route to the same executor",
      /executeZenoConfirmation\(\{/.test(readFileSync("src/app/api/ai-suite/confirm/route.ts", "utf8")));
  }

  console.log("\n-- disconnecting --");
  {
    ck("the account is linked before we start", (await id.getTelegramLink(TG))?.uid === UID);
    const { token: unused } = await id.createTelegramLinkToken(UID);
    const removed = await id.revokeTelegramLink({ uid: UID });
    ck("disconnecting removes the link", removed >= 1);
    ck("the mapping no longer resolves", (await id.getTelegramLink(TG)) === null);
    const after = await handleTelegramUpdate(msg("How many leads came in today?"));
    ck("a later message is answered as an unlinked account", /Connect Telegram/.test(after.reply?.text ?? ""));
    const stale = await id.redeemTelegramLinkToken({ token: unused, telegramUserId: TG, chatId: CHAT });
    ck("an unused linking token dies with the connection", !stale.ok, JSON.stringify(stale));
  }
} catch (err) {
  /**
   * AN ABORTED RUN IS A FAILED RUN.
   *
   * Without this, a throw escapes to the finally, which prints the result
   * from a counter that was never incremented, and a run that blew up
   * reports ALL PASS. A mutation removing a membership check escaped
   * exactly this way: the check's absence caused a TypeError rather than a
   * wrong answer, and the crash looked like success.
   */
  fails++;
  console.log(`FAIL  the suite threw before finishing - ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await cleanupTelegram();
  for (const p of made) await db.doc(p).delete().catch(() => {});
  console.log(`\ncleaned up`);
  console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
  process.exit(fails ? 1 : 0);
}
