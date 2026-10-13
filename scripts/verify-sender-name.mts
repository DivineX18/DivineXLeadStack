/**
 * Sender display name: a workspace can send under a person's name without
 * renaming the workspace.
 *
 * The properties that matter: the ADDRESS never changes (SPF and DKIM are
 * aligned against it), Reply-To never changes, an absent override behaves
 * exactly as before, and an override is sanitised by the same allowlist the
 * workspace name is — it goes straight into an email header.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-sender-name.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync("/Users/boss/DivineXLeadStack/.env.local","utf8").split("\n")) {
  const i=l.indexOf("="); if(i>0&&!l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}
process.env.EMAIL_FROM = "DivineX <notifications@divinex.io>";
const { workspaceSender } = await import("@/lib/comms/resend");
let pass=0; const fails:string[]=[];
const ck=(n:string,ok:boolean,d="")=>{ if(ok){pass++;console.log(`  ok   ${n}`);} else {fails.push(n);console.log(`  FAIL ${n}${d?` | ${d}`:""}`);} };

const base = { replyToEmail: "hello@divinex.io", resendConfig: null, emailDomainEnabledByAgency: false };

const noOverride = workspaceSender({ ...base, name: "DivineX" });
ck("without an override the workspace name is used (unchanged behaviour)",
  noOverride.from === "DivineX <notifications@divinex.io>", noOverride.from);

const withOverride = workspaceSender({ ...base, name: "DivineX", senderDisplayName: "Jadeverett" });
ck("an override replaces the display name", withOverride.from === "Jadeverett <notifications@divinex.io>", withOverride.from);
ck("the ADDRESS is untouched", withOverride.from.includes("<notifications@divinex.io>"));
ck("Reply-To is untouched", withOverride.replyTo === "hello@divinex.io");

const blank = workspaceSender({ ...base, name: "DivineX", senderDisplayName: "" });
ck("blank falls back to the workspace name", blank.from === "DivineX <notifications@divinex.io>", blank.from);
const nul = workspaceSender({ ...base, name: "DivineX", senderDisplayName: null });
ck("null falls back too", nul.from === "DivineX <notifications@divinex.io>", nul.from);

// Header-injection: the override goes through the same allowlist as the name.
const nasty = workspaceSender({ ...base, name: "DivineX", senderDisplayName: 'Jade <evil@x.com>\r\nBcc: a@b.c' });
ck("header characters are stripped from an override",
  !/[<>@\r\n]/.test(nasty.from.split("<")[0]), nasty.from);
ck("and it still yields exactly one address", (nasty.from.match(/</g) ?? []).length === 1, nasty.from);

const short = workspaceSender({ ...base, name: "DivineX", senderDisplayName: "J" });
ck("a 1-character override is rejected, falling back", short.from === "DivineX <notifications@divinex.io>", short.from);

console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  - ${f}`);

import { readFileSync as rf } from "node:fs";
console.log("\n-- it reaches marketing mail, and not platform mail --");
{
  const sender = rf("src/lib/comms/resend.ts", "utf8");
  ck("the override is read in workspaceSender", /senderDisplayName/.test(sender));
  ck("and sanitised by the same allowlist as the workspace name",
    /sanitizeDisplayName\(sub\?\.senderDisplayName\)/.test(sender));

  // Marketing / nurture: these go through workspaceSender, so they pick it up.
  for (const f of [
    "src/lib/workflows/engine.ts",
    "src/app/api/broadcasts/email/step/route.ts",
  ]) ck(`${f.split("/").pop()} sends via workspaceSender`, /workspaceSender/.test(rf(f, "utf8")));

  // Platform / system: these must NOT, or a seat invite would be signed by a
  // person who did not send it.
  for (const f of [
    "src/lib/server/members-service.ts",
    "src/lib/onboarding/staff-service.ts",
  ]) ck(`${f.split("/").pop()} does NOT use workspaceSender`, !/workspaceSender/.test(rf(f, "utf8")));

  const route = rf("src/app/api/agency/sub-accounts/[id]/route.ts", "utf8");
  ck("the PATCH route validates length", /between 2 and 64 characters/.test(route));
  ck("and rejects header characters", /can't contain/.test(route));
}
console.log(fails.length ? "FAILED" : "ALL PASS");

process.exit(fails.length ? 1 : 0);
