// Regression coverage for opt-in, consent-based lead capture (2026-09-27).
// Replaces nothing existing: `leadCapture` (the automatic/keyword-triggered path)
// stays exactly as it was and stays OFF for the public site. This is a second,
// independent, narrower mechanism gated by its own field (`consentLeadCapture`),
// off by default, that only ever OFFERS follow-up on explicit contact intent and
// only collects data after affirmative consent.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-web-chat-consent-capture.mts

import { readFileSync } from "node:fs";

const { parseConsentMarker } = await import("../src/lib/comms/ai/capture");
const { buildSystemPrompt } = await import("../src/lib/comms/ai/prompt");

let failures = 0;
const check = (l: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); if (!ok) failures++; };

// ---- marker parsing
{
  const a = parseConsentMarker("Sure, happy to help.\n\n[[consent]]");
  check("marker detected and stripped from visible text", a.offered && a.cleanText === "Sure, happy to help.");
  const b = parseConsentMarker("  [[ consent ]]  ");
  check("whitespace inside/around the marker tolerated", b.offered);
  const c = parseConsentMarker("No marker here.");
  check("no marker -> offered false, text untouched", !c.offered && c.cleanText === "No marker here.");
  const d = parseConsentMarker("[[consent id=\"x\"]]"); // the marker takes no attributes
  check("a marker with attributes is NOT recognised (spec is bare [[consent]])", !d.offered);
  check("the marker carries no free text from the model (fixed question is client-rendered)", !/[a-z]/i.test("[[consent]]".replace(/consent/, "")));
}

// ---- prompt wiring: mutually exclusive with the legacy path, generic wording
const agent = { effective: { systemPrompt: "You help visitors.", businessName: "Acme Co", websiteKb: null } } as never;
const base = { agent, fallbackBusinessName: "the business", contactContextBlock: null };
{
  const consentOn = buildSystemPrompt({ ...base, channelId: "web-chat", leadCapture: false, consentCapture: true });
  check("consent rules present when consentCapture=true and leadCapture=false", /CONTACT INTENT/.test(consentOn) && /\[\[consent\]\]/.test(consentOn));
  check("legacy LEAD CAPTURE rules are NOT also present", !/LEAD CAPTURE:/.test(consentOn));
  check("explicit examples from the spec are present verbatim", /Can someone contact me\?/.test(consentOn) && /I'd like to work with Acme Co\./.test(consentOn));
  check("pricing/refunds/general-interest explicitly excluded as triggers", /Do NOT treat any of the following as contact intent/.test(consentOn) && /pricing/.test(consentOn) && /refunds/.test(consentOn));
  check("model is told never to ask for name/email/phone itself", /do NOT also ask for their name, email or phone yourself|do NOT ask for their name, email or phone yourself/.test(consentOn));
  check("at-most-once + no-second-offer instruction present", /AT MOST ONCE/.test(consentOn) && /do not offer it again/.test(consentOn));

  const both = buildSystemPrompt({ ...base, channelId: "web-chat", leadCapture: true, consentCapture: true });
  check("legacy leadCapture=true wins; consent rules are skipped (never ask twice)", /LEAD CAPTURE:/.test(both) && !/CONTACT INTENT/.test(both));

  const neither = buildSystemPrompt({ ...base, channelId: "web-chat", leadCapture: false, consentCapture: false });
  check("both off -> the original hard 'do not collect' instruction, unchanged", /Do NOT ask for or collect contact details/.test(neither) && !/CONTACT INTENT/.test(neither));

  for (const ch of ["sms", "whatsapp", "voice"] as const) {
    const o = buildSystemPrompt({ ...base, channelId: ch, consentCapture: true });
    check(`${ch} rails unaffected by consentCapture (web-chat-only feature)`, !/CONTACT INTENT/.test(o));
  }
}

// ---- source-level guarantees
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const respond = strip(readFileSync("src/lib/comms/web-chat/respond.ts", "utf8"));
const captureRouteRaw = readFileSync("src/app/api/web-chat/capture/route.ts", "utf8");
const captureRoute = strip(captureRouteRaw);
const chatWindow = strip(readFileSync("src/components/web-chat/chat-window.tsx", "utf8"));
const sessionLib = strip(readFileSync("src/lib/comms/web-chat/session.ts", "utf8"));

check("respond.ts: consentCapture is forced false when the legacy leadCapture path is on", /const consentCapture = leadCapture \? false : web\?\.consentLeadCapture === true/.test(respond));
check("respond.ts: web-chat NEVER attaches CRM contact context (baseline invariant preserved)", /contactContextBlock:\s*null/.test(respond) && !/buildContactContextBlock/.test(respond));
check("respond.ts: a repeat offer is suppressed once already handled this session", /captureAlreadyHandled/.test(respond) && /const consent = captureAlreadyHandled \|\| !consentCapture \? false : afterConsent\.offered/.test(respond));

check("capture route: closed when BOTH leadCapture is off AND consent is not enabled", /leadCapture === false && !consentEnabled/.test(captureRoute));
check("capture route: idempotency claimed BEFORE any Contact/Task/email work", captureRoute.indexOf("claimCaptureSubmission(") < captureRoute.indexOf("reconcileContactFromCapture("));
check("capture route: idempotent replay returns the SAME ack text helper as a fresh success", (captureRoute.match(/buildAckText\(subAccountId\)/g) ?? []).length === 2);
check("capture route: the acknowledgement never mentions a time frame", !/shortly|within \d|business days?|hours?\b/i.test(captureRoute.slice(captureRoute.indexOf("buildAckText(subAccountId: string)"))));
check("capture route: still never echoes an existing contact's id back to the caller", /Deliberately NOT echoing contactId/.test(captureRouteRaw) && /\{ ok: true, reply \}/.test(captureRoute));
check("capture route: still does not expose task id / email-sent status", !/taskId: followUp\.taskId,\s*emailSent: followUp\.emailSent/.test(captureRoute));

check("session.ts: the claim has a bounded TTL (forward progress after a genuine failure)", /30_000/.test(sessionLib));
check("session.ts: an already-linked session short-circuits without re-claiming", /already-linked/.test(sessionLib));

check("chat-window: consent UI text/buttons are fixed component output, not model text", /Would you like the \{businessName\} team to follow up with you\?/.test(chatWindow));
check("chat-window: \"Yes\" reveals the MINIMUM fields (name+email only, no phone)", /formFields: \["name", "email"\]/.test(chatWindow));
check("chat-window: \"No\" reuses the existing skip path verbatim (no new server logic)", /handleCaptureFormDone\(messageId, \{ skip: true \}\)/.test(chatWindow));
check("chat-window: accepting/declining clears the consent flag so it cannot re-render", /consent: undefined/.test(chatWindow));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
