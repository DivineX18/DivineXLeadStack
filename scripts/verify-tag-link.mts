/**
 * Verifies the {{tagLink:slug}} merge-tag primitive: the HMAC token
 * (genuine unit tests, real calls/real assertions), and the wiring across
 * merge-tags.ts / workflows/engine.ts / middleware.ts / the public route +
 * page (structural, source-level — same class as every other verify-*.mts
 * in this repo).
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-tag-link.mts
 */
import { readFileSync } from "node:fs";

process.env.AUTOMATIONS_TOKEN_SECRET = "test-secret-at-least-16-chars-long";
process.env.NEXT_PUBLIC_APP_URL = "https://example.test";

const { signTagLinkToken, verifyTagLinkToken, buildTagLinkUrl } = await import(
  "../src/lib/automations/tag-link-token.ts"
);

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};
const read = (f: string) => readFileSync(f, "utf8");

console.log("-- token sign/verify round-trip (genuine unit tests) --");
{
  const token = signTagLinkToken("abc123", "reconnect-business");
  const verified = verifyTagLinkToken(token);
  ck("a valid token verifies back to the same contactId + tag", verified?.contactId === "abc123" && verified?.tag === "reconnect-business");

  ck("two different tags for the same contact produce different tokens", signTagLinkToken("abc123", "tag-a") !== signTagLinkToken("abc123", "tag-b"));
  ck("the same contactId+tag is deterministic (idempotent links in two separate emails still work)", signTagLinkToken("abc123", "tag-a") === signTagLinkToken("abc123", "tag-a"));

  ck("a tampered signature fails verification", verifyTagLinkToken(`abc123.reconnect-business.${"0".repeat(64)}`) === null);
  ck("a tampered contactId fails verification (can't repoint someone else's link)", verifyTagLinkToken(token.replace("abc123", "xyz999")) === null);
  ck("a tampered tag fails verification (can't upgrade the tag a link applies)", verifyTagLinkToken(token.replace("reconnect-business", "reconnect-both")) === null);
  ck("malformed token (wrong part count) fails closed, doesn't throw", verifyTagLinkToken("not-a-real-token") === null);
  ck("empty string fails closed", verifyTagLinkToken("") === null);

  ck("uppercase/invalid tag shape is rejected at sign time, never silently lowercased", (() => {
    try {
      signTagLinkToken("abc123", "Has_Underscore");
      return false;
    } catch {
      return true;
    }
  })());
}

console.log("\n-- URL building --");
{
  const url = buildTagLinkUrl("abc123", "reconnect-business");
  ck("builds a /t/ URL under NEXT_PUBLIC_APP_URL", url.startsWith("https://example.test/t/"));
  ck("the URL's token round-trips through verifyTagLinkToken", (() => {
    const token = url.split("/t/")[1];
    const v = verifyTagLinkToken(token);
    return v?.contactId === "abc123" && v?.tag === "reconnect-business";
  })());

  const prevUrl = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  ck("MUTATION: missing NEXT_PUBLIC_APP_URL -> empty string, not a throw (template still renders)", buildTagLinkUrl("abc123", "reconnect-business") === "");
  process.env.NEXT_PUBLIC_APP_URL = prevUrl;

  ck("an invalid tag shape resolves to empty rather than throwing out of a send", buildTagLinkUrl("abc123", "Not Valid!") === "");
}

console.log("\n-- merge-tags.ts wiring --");
{
  const src = read("src/lib/automations/merge-tags.ts");
  ck("MergeTagSubject declares buildTagLink as optional (other callers must not need to supply it)", /buildTagLink\?:/.test(src));
  ck("the resolver handles the tagLink: prefix", /tag\.startsWith\("tagLink:"\)/.test(src));
  ck("an unset buildTagLink resolves to empty, not a crash", /subject\.buildTagLink \? subject\.buildTagLink\(slug\) : ""/.test(src));
}

console.log("\n-- workflows/engine.ts wiring --");
{
  const src = read("src/lib/workflows/engine.ts");
  ck("imports buildTagLinkUrl from the token module (not a second implementation)", /from "@\/lib\/automations\/tag-link-token"/.test(src));
  ck("mergeSubject() supplies buildTagLink using the contact id from context", /buildTagLink:\s*\(tag\)\s*=>\s*buildTagLinkUrl\(ctx\.contact\.id,\s*tag\)/.test(src));
}

console.log("\n-- public route + page (mirrors /u/[token] exactly) --");
{
  const route = read("src/app/api/t/[token]/route.ts");
  const page = read("src/app/t/[token]/page.tsx");

  ck("the route verifies the token before touching Firestore", /verifyTagLinkToken\(token\)/.test(route));
  ck("the route applies the tag through the canonical contacts-service chokepoint (not a raw Firestore write)", /updateContactServerSide\(/.test(route) && !/\.update\(\{/.test(route));
  ck(
    "MUTATION: a raw contacts/{id}.update({tags...}) call in this same route would be caught by the check above",
    /\.update\(\{/.test(route + '\n  await ref.update({ tags });'),
  );
  ck("the route dedupes before writing (no duplicate tag entries on a repeat click)", /existingTags\.includes\(verified\.tag\)/.test(route));

  ck("the page is a client component (so it can fire the POST on mount, not on the scanner's GET)", page.trimStart().startsWith('"use client"'));
  ck("the page POSTs to /api/t/[token] on mount", /fetch\(`\/api\/t\/\$\{token\}`,\s*\{\s*method:\s*"POST"/.test(page));
}

console.log("\n-- middleware exposes /t and /api/t as public (HMAC token is the credential, not a session) --");
{
  const mw = read("src/middleware.ts");
  ck('"/t" is a public path', /^\s*"\/t",\s*$/m.test(mw));
  ck('"/api/t" is a public path', /^\s*"\/api\/t",\s*$/m.test(mw));
}

console.log("\n-- the reconnect-series script actually uses the button syntax, not bare inline links --");
{
  // Only the email body constants matter here -- the file's own leading doc
  // comment generically mentions "{{tagLink:slug}}" in prose to explain the
  // primitive, which isn't a real template and would false-positive a
  // whole-file check (same class of mistake hit repeatedly earlier in this
  // project: a comment naming the exact thing being checked for absence).
  const fullScript = read("scripts/seed-divinex-reconnect-series.mts");
  const firstEmailConst = fullScript.indexOf("const EMAIL_1");
  const emailBodies = fullScript.slice(firstEmailConst);

  const bareTagLink = /[^(]\{\{tagLink:[a-z-]+\}\}/.test(emailBodies.replace(/\]\(\{\{tagLink:[a-z-]+\}\}\)/g, ""));
  ck("no bare {{tagLink:slug}} left outside [button](...) syntax", !bareTagLink);
  const bareBookingLink = /[^(]\{\{bookingLink\}\}/.test(emailBodies.replace(/\]\(\{\{bookingLink\}\}\)/g, ""));
  ck("no bare {{bookingLink}} left outside [button](...) syntax", !bareBookingLink);
  ck("all four segmentation choices are present as buttons", (emailBodies.match(/\[button secondary: [^\]]+\]\(\{\{tagLink:/g) ?? []).length === 4);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
