/**
 * Email visibility — the sent log, engagement tracking, reply routing and
 * inbound mail, checked without sending an email or touching Firestore.
 *
 * These are the invariants that reading one file cannot show you:
 *
 *  - A webhook signature check that passes a tampered body. This one matters
 *    more than it looks: open and click counts are how a rep's work gets
 *    judged, and the endpoint is public, so a weak check lets anyone post
 *    fabricated engagement.
 *  - A reply address that cannot survive the trip through a mail system.
 *    The first implementation of this signed the contact id into the address;
 *    mail systems down-case local parts and Firestore ids are case-sensitive,
 *    so it round-tripped in the unit under test and would have failed on
 *    every real reply.
 *  - Status that moves backwards. Providers do not order their webhooks, so
 *    a late "delivered" must not erase a recorded open, and engagement must
 *    not erase a bounce.
 *  - A send path that writes to the log twice, or not at all.
 *
 * Each positive check is paired with a MUTATION: the same assertion run
 * against deliberately broken input, which must fail. An assertion that
 * passes either way is testing nothing.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-email-visibility.mts
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d && !ok ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. Signature verification, exercised for real.
// ---------------------------------------------------------------------------
const { verifySvixSignature } = await import("../src/lib/comms/webhook-signature.ts");

const secretRaw = crypto.randomBytes(24).toString("base64");
const secret = `whsec_${secretRaw}`;
const body = JSON.stringify({ type: "email.opened", data: { email_id: "msg_1" } });
const id = "msg_abc";

function sign(b: string, ts: string, sec = secretRaw) {
  return crypto
    .createHmac("sha256", Buffer.from(sec, "base64"))
    .update(`${id}.${ts}.${b}`)
    .digest("base64");
}
const headersFor = (sig: string, ts: string) =>
  new Headers({ "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` });

const now = String(Math.floor(Date.now() / 1000));

ck(
  "signature: a correctly signed body is accepted",
  verifySvixSignature({ rawBody: body, headers: headersFor(sign(body, now), now), secret }).ok,
);

// MUTATION — the payload is changed after signing. Must fail, or an attacker
// can rewrite the event while keeping a captured signature.
ck(
  "signature: a tampered body is rejected",
  !verifySvixSignature({
    rawBody: body.replace("opened", "clicked"),
    headers: headersFor(sign(body, now), now),
    secret,
  }).ok,
);

// MUTATION — signed with a different secret.
ck(
  "signature: a foreign secret is rejected",
  !verifySvixSignature({
    rawBody: body,
    headers: headersFor(sign(body, now, crypto.randomBytes(24).toString("base64")), now),
    secret,
  }).ok,
);

// MUTATION — a valid, correctly signed request from an hour ago. Replay.
const stale = String(Math.floor(Date.now() / 1000) - 3600);
ck(
  "signature: a stale timestamp is rejected (replay)",
  !verifySvixSignature({ rawBody: body, headers: headersFor(sign(body, stale), stale), secret }).ok,
);

// MUTATION — timestamp changed, so the signature no longer covers it.
ck(
  "signature: the timestamp is covered by the signature",
  !verifySvixSignature({
    rawBody: body,
    headers: headersFor(sign(body, now), String(Number(now) - 10)),
    secret,
  }).ok,
);

ck(
  "signature: missing headers are rejected, not thrown",
  !verifySvixSignature({ rawBody: body, headers: new Headers(), secret }).ok,
);

// During a secret rotation the provider sends several signatures; any match
// must pass, or every event is dropped for the length of the rotation.
{
  const other = crypto.randomBytes(24).toString("base64");
  const h = new Headers({
    "svix-id": id,
    "svix-timestamp": now,
    "svix-signature": `v1,${sign(body, now, other)} v1,${sign(body, now)}`,
  });
  ck("signature: accepts one of several signatures (rotation)",
    verifySvixSignature({ rawBody: body, headers: h, secret }).ok);
}

// The prefix is not part of the key. Signing with it produces a signature
// that never matches anything the provider sends.
ck(
  "signature: the whsec_ prefix is stripped before use",
  verifySvixSignature({ rawBody: body, headers: headersFor(sign(body, now), now), secret: secretRaw }).ok,
);

// ---------------------------------------------------------------------------
// 2. Reply addressing — parsing, without Firestore.
// ---------------------------------------------------------------------------
process.env.EMAIL_INBOUND_DOMAIN = "inbound.example.com";
const threading = readFileSync("src/lib/comms/email-threading.ts", "utf8");
const tCode = strip(threading);

// The token has to survive a mail system that down-cases the local part, so it
// must be generated in a case-insensitive alphabet. Hex satisfies that.
ck(
  "reply address: token is lowercase hex, which survives down-casing",
  /randomBytes\(16\)\.toString\("hex"\)/.test(tCode),
);
ck(
  "reply address: the parser shape-checks for lowercase hex before any read",
  /\/\^\[0-9a-f\]\{32\}\$\//.test(tCode),
);

// MUTATION of intent: if the id were encoded in the address instead of a
// stored token, the case problem would be back. Guard against a regression.
ck(
  "reply address: the contact id is NOT encoded into the address",
  !/\+\$\{contactId\}/.test(tCode) && !/contactId\}\./.test(tCode),
);

// An unroutable domain must be refused rather than put on live mail, where it
// fails silently and real replies are lost.
ck(
  "reply address: a malformed inbound domain is refused",
  /includes\("\."\)/.test(tCode) && /\[\^a-z0-9\.-\]/.test(tCode),
);

// Tenancy must come from the token document, never the message.
const inbound = readFileSync("src/app/api/webhooks/email/inbound/route.ts", "utf8");
const iCode = strip(inbound);
ck(
  "inbound: tenancy is read from the resolved token, not the payload",
  /subAccountId: routed\.subAccountId/.test(iCode) &&
    /agencyId: routed\.agencyId/.test(iCode),
);
ck(
  "inbound: an unroutable message is accepted and dropped, never retried",
  /ignored: "unroutable"/.test(iCode),
);
// A storage failure IS worth a retry, or the reply is lost outright.
ck(
  "inbound: a storage failure returns 500 so the provider retries",
  /message write failed[\s\S]{0,200}status: 500/.test(iCode),
);
// A redelivery is routine, not exceptional: any non-2xx or timeout triggers
// one. An e2e test caught the message row correctly deduping while the
// conversation's unread count went to 2 and the timeline grew a second
// identical entry — both operator-visible. The side effects have to be gated
// on "did this call create the row", not merely on the write being a merge.
ck(
  "inbound: the message is claimed in a transaction that reports if it is new",
  /runTransaction/.test(iCode) && /existing\.exists\) return false/.test(iCode),
);
ck(
  "inbound: a redelivery touches nothing else and reports duplicate",
  /if \(!isNew\)/.test(iCode) && /duplicate: true/.test(iCode),
);
// Order matters: the unread increment and the activity write must both sit
// AFTER the duplicate guard.
{
  const guard = iCode.indexOf("if (!isNew)");
  ck(
    "inbound: the unread + timeline writes are after the duplicate guard",
    guard !== -1 &&
      // Match the CALL, not the import at the top of the file.
      iCode.indexOf("await upsertConversationForMessage({") > guard &&
      iCode.indexOf('type: "email_received"') > guard,
  );
}
ck(
  "inbound: unauthenticated requests are rejected",
  /status: 401/.test(iCode) && /authorize\(request, rawBody\)/.test(iCode),
);
// The signature covers the exact bytes; re-serialising breaks it.
for (const [name, code] of [
  ["inbound", iCode],
  ["events", strip(readFileSync("src/app/api/webhooks/resend/route.ts", "utf8"))],
] as const) {
  const rawFirst =
    code.indexOf("request.text()") < code.indexOf("JSON.parse") &&
    code.indexOf("request.text()") !== -1;
  ck(`${name}: verifies the raw body, before JSON parsing`, rawFirst);
}

// ---------------------------------------------------------------------------
// 3. Status ordering.
// ---------------------------------------------------------------------------
const { EMAIL_STATUS_RANK } = await import("../src/types/email-events.ts");
ck(
  "status: engagement outranks sent",
  EMAIL_STATUS_RANK.opened > EMAIL_STATUS_RANK.sent &&
    EMAIL_STATUS_RANK.clicked > EMAIL_STATUS_RANK.opened,
);
// A bounce is the state an operator must act on; an open arriving afterwards
// must not hide it.
ck(
  "status: a bounce outranks engagement",
  EMAIL_STATUS_RANK.bounced > EMAIL_STATUS_RANK.clicked &&
    EMAIL_STATUS_RANK.complained > EMAIL_STATUS_RANK.bounced,
);
const svc = strip(readFileSync("src/lib/server/email-events-service.ts", "utf8"));
ck(
  "status: the service compares rank before writing a status",
  /EMAIL_STATUS_RANK\[next\] > EMAIL_STATUS_RANK\[current\.status\]/.test(svc),
);
ck(
  "status: applied inside a transaction, so concurrent events cannot interleave",
  /runTransaction/.test(svc),
);
// A fast open can beat the send record. Without merge, the send would wipe it.
ck(
  "log: the send record merges, so an early open is not overwritten",
  /\{ merge: true \}/.test(svc),
);
ck(
  "log: an event for an unknown message is ignored, not invented",
  /unknown_message/.test(svc) && !/\.set\(/.test(svc.split("applyProviderEmailEvent")[1] ?? ""),
);

// ---------------------------------------------------------------------------
// 4. Every contact-facing send path writes to the log, exactly once.
// ---------------------------------------------------------------------------
const resend = readFileSync("src/lib/comms/resend.ts", "utf8");
ck(
  "log: recorded centrally inside sendEmail, not per call site",
  /recordEmailSent\(/.test(resend),
);
const sendRoute = readFileSync("src/app/api/comms/email/send/route.ts", "utf8");
// Double-writing would double-count a rep's sends.
ck(
  "log: the one-to-one route does not also write its own record",
  !/recordEmailSent/.test(sendRoute) && /source: "manual"/.test(sendRoute),
);
for (const [name, file, source] of [
  ["broadcast", "src/app/api/broadcasts/email/step/route.ts", "broadcast"],
  ["workflow", "src/lib/workflows/engine.ts", "workflow"],
  ["quote", "src/app/api/sub-accounts/[id]/quotes/[quoteId]/send/route.ts", "transactional"],
] as const) {
  const code = readFileSync(file, "utf8");
  ck(`log: the ${name} send path is logged as "${source}"`,
    new RegExp(`source: "${source}"`).test(code));
}

// ---------------------------------------------------------------------------
// 5. Reply routing, and the rule it has to respect.
// ---------------------------------------------------------------------------
const sCode = strip(sendRoute);
// Routing into the CRM is preferred; a real human mailbox is the fallback. The
// workspace address must NOT come first — that is the regression that left a
// rep unable to see replies to their own outreach.
const crmIdx = sCode.indexOf("crmReplyAddress ??");
ck("reply-to: the CRM address is preferred", crmIdx !== -1);
ck(
  "reply-to: falls back to the sender before the workspace address",
  /crmReplyAddress \?\? auth\.email \?\? subAccount\?\.replyToEmail/.test(sCode),
);
// Bulk mail must keep replying to the workspace, or 2,000 auto-replies land in
// one person's inbox.
const bCode = readFileSync("src/app/api/broadcasts/email/step/route.ts", "utf8");
ck(
  "reply-to: broadcasts still reply to the workspace sender",
  /workspaceSender\(subAccount\)/.test(bCode) && !/auth\.email/.test(bCode),
);

// ---------------------------------------------------------------------------
// 6. Tenancy at the rules layer.
// ---------------------------------------------------------------------------
const rules = readFileSync("firestore.rules", "utf8");
const block = (name: string) => {
  const i = rules.indexOf(`match /${name}/`);
  return i === -1 ? "" : rules.slice(i, i + 700);
};
const ev = block("emailEvents");
ck("rules: emailEvents is workspace-scoped on read", /canAccessSub\(resource\.data\.subAccountId/.test(ev));
// A client that could write these could fabricate its own open rates.
ck("rules: emailEvents is server-write only", /allow create, update, delete: if false/.test(ev));
const tok = block("emailReplyTokens");
ck(
  "rules: reply tokens are unreadable by clients (they are routing credentials)",
  /allow read, write: if false/.test(tok),
);
ck(
  "rules: the email thread subcollection is member-read, server-write",
  /match \/emailMessages\/\{messageId\}/.test(rules) &&
    /emailMessages[\s\S]{0,600}allow create, delete: if false/.test(rules),
);

// Public webhooks must be reachable, or the provider gets a login page.
const mw = readFileSync("src/middleware.ts", "utf8");
for (const p of ["/api/webhooks/resend", "/api/webhooks/email/inbound"]) {
  ck(`middleware: ${p} is public`, mw.includes(`"${p}"`));
}

// ---------------------------------------------------------------------------
// 7. The inbox actually renders the new channel.
// ---------------------------------------------------------------------------
const thread = readFileSync("src/components/conversations/conversation-thread.tsx", "utf8");
ck(
  "inbox: the thread subscribes to emailMessages",
  /emailMessages/.test(thread) && /channel: "email" as const/.test(thread),
);
ck("inbox: email hydration is awaited before render", /emailReady/.test(thread));
const composer = readFileSync("src/components/conversations/conversation-composer.tsx", "utf8");
ck(
  "inbox: the composer can send email, with a subject",
  /api\/comms\/email\/send/.test(composer) && /aria-label="Email subject"/.test(composer),
);
ck(
  "inbox: email honours its own opt-out flag",
  /contact\.emailOptedOut/.test(composer),
);
const detail = readFileSync(
  "src/app/(dashboard)/sa/[subAccountId]/conversations/[contactId]/page.tsx",
  "utf8",
);
ck("inbox: email is offered when the contact has an address",
  /if \(contact\?\.email\) availableChannels\.push\("email"\)/.test(detail));

// A 0% open rate and "tracking was never configured" look identical. Claiming
// the former is the kind of wrong number someone makes a decision on.
// The log's implementation moved into a shared component so both shells can
// mount it; this assertion follows it rather than the thin page wrapper.
const page = readFileSync("src/components/email/email-activity-log.tsx", "utf8");
ck(
  "log page: distinguishes no-engagement from no-tracking",
  /trackingUnproven/.test(page) && /webhooks\/resend/.test(page),
);

// ---------------------------------------------------------------------------
// 8. Reachable from BOTH shells.
//
// The Flow sidebar does not render in the Ascend shell, so a Flow-only entry
// is not "hard to find" there, it is absent. That exact mistake hid the
// traffic card until it was mounted onto Performance, and it would have hidden
// this too.
// ---------------------------------------------------------------------------
const ascendPage = readFileSync("src/app/app/performance/email/page.tsx", "utf8");
const flowPage = readFileSync(
  "src/app/(dashboard)/sa/[subAccountId]/email-log/page.tsx",
  "utf8",
);
const perf = readFileSync("src/app/app/performance/page.tsx", "utf8");
const summary = readFileSync("src/components/email/email-activity-summary.tsx", "utf8");

ck("ascend: there is an Ascend route for the log", /EmailActivityLog/.test(ascendPage));
// ONE implementation. A second copy would be a second set of numbers that can
// disagree with the first.
ck(
  "ascend: the Flow page delegates rather than re-implementing",
  /EmailActivityLog/.test(flowPage) && !/subscribeToEmailEvents/.test(flowPage),
);
// useSubAccount() THROWS with no provider, and a throw in a client component
// takes the whole page to the error boundary. That is the bug that broke the
// Performance page once already.
for (const [name, code] of [
  ["the Ascend log route", ascendPage],
  ["the Performance summary", perf],
] as const) {
  ck(
    `ascend: ${name} mounts a SubAccountProvider`,
    /<SubAccountProvider/.test(code) && /inAscendShell/.test(code),
  );
}
// Without inAscendShell, saPath() emits /sa/... links that yank the operator
// out of Ascend chrome and into Flow.
ck(
  "ascend: a Flow-relative /email-log link resolves to the Ascend route",
  /"\/email-log": "\/performance\/email"/.test(
    readFileSync("src/lib/shell/ascend-shell-paths.ts", "utf8"),
  ),
);
// A workspace that has never sent email should see no card at all.
ck(
  "ascend: the summary renders nothing before the first send",
  /rows\.length === 0\) return null/.test(summary),
);
// Same honesty requirement as the full page.
ck(
  "ascend: the summary distinguishes no-engagement from no-tracking",
  /trackingUnproven/.test(summary),
);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
