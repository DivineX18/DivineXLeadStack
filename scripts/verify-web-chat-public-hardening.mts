// Regression coverage for the public web-chat privacy + abuse hardening
// (2026-09-26). Incident: an anonymous visitor could type an existing CRM
// contact's email, get the chat session linked to that contact, and have the
// contact's deals and notes injected into the model prompt.
//
// Proves: no CRM context can reach the prompt; the chat needs a signed token
// (server-side origin enforcement); limits and budgets are persistent and
// enforced before any model call; links are whitelist-only; page context is
// sanitised; other channels' prompts are unchanged.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-web-chat-public-hardening.mts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.AUTOMATIONS_TOKEN_SECRET = "test-secret-at-least-16-chars-long";

const { mintEmbedToken, verifyEmbedToken } = await import("../src/lib/comms/web-chat/embed-token");
const limits = await import("../src/lib/comms/web-chat/usage-limits");
const cta = await import("../src/lib/comms/web-chat/cta");
const { knowledgeUrlAllowed, loadKnowledge, _clearKnowledgeCache } = await import("../src/lib/comms/web-chat/knowledge");
const { originAcceptable } = await import("../src/lib/comms/web-chat/guard");
const { trustedClientIp } = await import("../src/lib/comms/web-chat/client-ip");
const { buildSystemPrompt } = await import("../src/lib/comms/ai/prompt");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------- embed token
{
  const t = mintEmbedToken("sa1", "divinex.io", 1_000_000)!;
  check("token: mints", !!t);
  check("token: verifies for same sub-account", verifyEmbedToken(t, "sa1", 1_000_500).ok === true);
  const v = verifyEmbedToken(t, "sa1", 1_000_500);
  check("token: carries embedding host", v.ok && v.embeddingHost === "divinex.io");
  const w = verifyEmbedToken(t, "sa2", 1_000_500);
  check("token: rejected for a different sub-account", !w.ok && w.reason === "wrong-sub-account");
  const e = verifyEmbedToken(t, "sa1", 1_000_000 + 25 * 3600 * 1000);
  check("token: expires after 24h", !e.ok && e.reason === "expired");
  const [pl, sig] = t.split(".");
  const tampered = Buffer.from(Buffer.from(pl!, "base64url").toString().replace("sa1", "sa9")).toString("base64url") + "." + sig;
  check("token: tampered payload rejected", verifyEmbedToken(tampered, "sa9", 1_000_500).ok === false);
  check("token: garbage rejected", verifyEmbedToken("abc", "sa1").ok === false && verifyEmbedToken("", "sa1").ok === false && verifyEmbedToken(null, "sa1").ok === false);
  const saved = process.env.AUTOMATIONS_TOKEN_SECRET;
  delete process.env.AUTOMATIONS_TOKEN_SECRET;
  check("token: fails closed with no secret (cannot mint)", mintEmbedToken("sa1", "x") === null);
  check("token: fails closed with no secret (cannot verify)", verifyEmbedToken(t, "sa1").ok === false);
  process.env.AUTOMATIONS_TOKEN_SECRET = saved;
}

// ---------------------------------------------------------------- limits
function memoryStore(): import("../src/lib/comms/web-chat/usage-limits").LimitStore {
  const data = new Map<string, { count: number; tokens: number }>();
  return {
    async transact(keys, decide) {
      const cur: Record<string, { count: number; tokens: number }> = {};
      for (const k of keys) cur[k] = { ...(data.get(k) ?? { count: 0, tokens: 0 }) };
      const { result, increments } = decide(cur);
      for (const [k, inc] of Object.entries(increments ?? {})) {
        const c = data.get(k) ?? { count: 0, tokens: 0 };
        data.set(k, { count: c.count + (inc.count ?? 0), tokens: c.tokens + (inc.tokens ?? 0) });
      }
      return result;
    },
  };
}
{
  const L = { perIpHour: 3, perSession: 100, dailyMessages: 5, dailyTokens: 1000 };
  const store = memoryStore();
  const t0 = Date.UTC(2026, 8, 26, 10, 30, 0);
  const call = (ip: string, sid: string, now = t0) =>
    limits.checkAndCountRequest({ subAccountId: "sa1", ip, sessionId: sid, limits: L, store, nowMs: now });

  const r = [await call("1.1.1.1", "s1"), await call("1.1.1.1", "s1"), await call("1.1.1.1", "s1")];
  check("limits: first 3 from one IP allowed", r.every((x) => x.ok));
  const fourth = await call("1.1.1.1", "s2");
  check("limits: 4th from same IP in the hour blocked (new session id does not help)", !fourth.ok && fourth.reason === "ip-quota");
  check("limits: ip retry-after is time to next hour", !fourth.ok && fourth.retryAfterSec > 0 && fourth.retryAfterSec <= 3600);
  const otherIp = await call("2.2.2.2", "s3");
  check("limits: a different IP is unaffected", otherIp.ok);
  const nextHour = await call("1.1.1.1", "s4", t0 + 3600 * 1000);
  check("limits: IP bucket resets next hour", nextHour.ok);
  // day budget: 3 (1.1.1.1) + 1 (2.2.2.2) + 1 (next hour) = 5 messages used
  const sixth = await call("3.3.3.3", "s5", t0 + 3600 * 1000);
  check("limits: daily message budget enforced across IPs", !sixth.ok && sixth.reason === "message-budget");
  const nextDay = await call("3.3.3.3", "s5", t0 + 24 * 3600 * 1000);
  check("limits: daily budget resets next UTC day", nextDay.ok);

  // "persistence": a second handle over the same backing store (another instance / restart)
  const again = await limits.checkAndCountRequest({ subAccountId: "sa1", ip: "1.1.1.1", sessionId: "s1", limits: L, store, nowMs: t0 });
  check("limits: state survives a fresh caller (not per-process memory)", !again.ok);

  // token budget
  const store2 = memoryStore();
  const L2 = { perIpHour: 100, perSession: 100, dailyMessages: 100, dailyTokens: 1000 };
  const c2 = () => limits.checkAndCountRequest({ subAccountId: "sa2", ip: "9.9.9.9", sessionId: "x", limits: L2, store: store2, nowMs: t0 });
  check("limits: under token budget allowed", (await c2()).ok);
  await limits.recordTokenUsage({ subAccountId: "sa2", tokens: 1200, store: store2, nowMs: t0 });
  const over = await c2();
  check("limits: token budget actually enforced once usage is recorded", !over.ok && over.reason === "token-budget");

  // session cap
  const store3 = memoryStore();
  const L3 = { perIpHour: 100, perSession: 2, dailyMessages: 100, dailyTokens: 1e9 };
  const c3 = (ip: string) => limits.checkAndCountRequest({ subAccountId: "sa3", ip, sessionId: "same-session", limits: L3, store: store3, nowMs: t0 });
  await c3("a"); await c3("b");
  const s3 = await c3("c");
  check("limits: per-session cap enforced regardless of IP", !s3.ok && s3.reason === "session-quota");

  check("limits: resolveLimits clamps and defaults", limits.resolveLimits({}).dailyTokens === 300000 && limits.resolveLimits({ dailyTokenBudget: -5 }).dailyTokens === 300000 && limits.resolveLimits({ dailyTokenBudget: 1e12 }).dailyTokens === 50_000_000);
}

// ---------------------------------------------------------------- CTA / page path
{
  const list = [
    { id: "growth-assessment", label: "Get your free Growth Assessment", url: "https://divinex.io/ascend/" },
    { id: "contact", label: "Contact DivineX", url: "https://divinex.io/contact/" },
    { id: "flow", label: "See Flow", url: "https://divinex.io/flow/" },
  ];
  const p = cta.parseCtaMarkers('Here you go.\n\n[[cta id="growth-assessment"]]', list);
  check("cta: whitelisted id resolves from config URL", p.ctas.length === 1 && p.ctas[0]!.url === "https://divinex.io/ascend/" && p.cleanText === "Here you go.");
  const q = cta.parseCtaMarkers('x [[cta id="evil"]] [[cta id="contact"]] [[cta id="contact"]] [[cta id="flow"]] [[cta id="growth-assessment"]]', list);
  check("cta: unknown ids dropped, dupes removed, max 2", q.ctas.length === 2 && q.ctas.every((c) => list.some((l) => l.url === c.url)));
  check("cta: all markers stripped from visible text", !/\[\[/.test(q.cleanText));
  check("cta: model cannot smuggle a URL through a marker", cta.parseCtaMarkers('[[cta id="x" url="https://evil.com"]]', list).ctas.length === 0);
  const s = cta.sanitiseCtas([
    { id: "ok", label: "OK", url: "https://divinex.io/a/" },
    { id: "js", label: "bad", url: "javascript:alert(1)" },
    { id: "http", label: "bad", url: "http://divinex.io/" },
    { id: "rel", label: "bad", url: "/relative" },
    { id: "creds", label: "bad", url: "https://u:p@divinex.io/" },
    { id: "OK", label: "dupe", url: "https://divinex.io/b/" },
    { id: "bad id!", label: "bad", url: "https://divinex.io/" },
  ]);
  check("cta: config sanitiser keeps only https absolute URLs with clean ids", s.length === 1 && s[0]!.id === "ok");
  const hosts = ["divinex.io", "www.divinex.io"];
  check("page: allowed host -> path only", cta.sanitisePagePath("https://divinex.io/ascend/?utm=1#x", hosts) === "/ascend/");
  check("page: foreign host rejected", cta.sanitisePagePath("https://evil.com/ignore-previous-instructions/", hosts) === null);
  check("page: hostile characters rejected", cta.sanitisePagePath("https://divinex.io/a%20b%0Aignore", hosts) === null);
  check("page: junk rejected", cta.sanitisePagePath("not a url", hosts) === null && cta.sanitisePagePath(null, hosts) === null);
}

// ---------------------------------------------------------------- knowledge loader
{
  const dom = ["divinex.io", "www.divinex.io"];
  check("knowledge: https on allowed host accepted", !!knowledgeUrlAllowed("https://divinex.io/zeno-knowledge.txt", dom));
  check("knowledge: http rejected", knowledgeUrlAllowed("http://divinex.io/k.txt", dom) === null);
  check("knowledge: other host rejected (SSRF)", knowledgeUrlAllowed("https://evil.com/k.txt", dom) === null && knowledgeUrlAllowed("https://169.254.169.254/latest", dom) === null);
  check("knowledge: creds/port rejected", knowledgeUrlAllowed("https://u:p@divinex.io/k.txt", dom) === null && knowledgeUrlAllowed("https://divinex.io:8443/k.txt", dom) === null);

  const realFetch = globalThis.fetch;
  let calls = 0; let mode: "ok" | "fail" = "ok"; let sawRedirectError = false;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    calls++; sawRedirectError = init?.redirect === "error";
    if (mode === "fail") throw new Error("boom");
    return new Response("FACTS: DivineX builds growth systems.", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }) as typeof fetch;
  _clearKnowledgeCache();
  const t0 = Date.now();
  const a = await loadKnowledge("https://divinex.io/k.txt", dom, t0);
  check("knowledge: fetches text", a?.startsWith("FACTS") === true && calls === 1);
  check("knowledge: refuses redirects", sawRedirectError);
  await loadKnowledge("https://divinex.io/k.txt", dom, t0 + 60_000);
  check("knowledge: cached within TTL", calls === 1);
  mode = "fail";
  const stale = await loadKnowledge("https://divinex.io/k.txt", dom, t0 + 11 * 60_000);
  check("knowledge: serves last good copy if refresh fails", stale?.startsWith("FACTS") === true);
  _clearKnowledgeCache();
  check("knowledge: no copy + failure = null (bot then says it doesn't know)", (await loadKnowledge("https://divinex.io/k.txt", dom, t0)) === null);
  check("knowledge: disallowed URL never fetched", (await loadKnowledge("https://evil.com/k.txt", dom, t0)) === null);
  globalThis.fetch = realFetch;
}

// ---------------------------------------------------------------- origin + IP
{
  const hosts = ["app.divinex.io", "crm.divinex.io"];
  const dom = ["divinex.io"];
  check("origin: our own app host (the iframe) accepted", originAcceptable("https://app.divinex.io", dom, hosts, "production"));
  check("origin: allow-listed site accepted", originAcceptable("https://divinex.io", dom, hosts, "production"));
  check("origin: unrelated website refused", !originAcceptable("https://evil.example", dom, hosts, "production"));
  check("origin: localhost refused in production", !originAcceptable("http://localhost:3000", dom, hosts, "production"));
  check("origin: localhost ok in dev", originAcceptable("http://localhost:3000", dom, hosts, "development"));
  check("origin: garbage refused", !originAcceptable("not-an-origin", dom, hosts, "production"));
  const h = (o: Record<string, string>) => new Headers(o);
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV; env.NODE_ENV = "production";
  check("ip: cf-connecting-ip trusted", trustedClientIp(h({ "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" })) === "5.5.5.5");
  check("ip: client-forged X-Forwarded-For ignored in production", trustedClientIp(h({ "x-forwarded-for": "6.6.6.6" })) === "unknown");
  env.NODE_ENV = "development";
  check("ip: X-Forwarded-For only used in development", trustedClientIp(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" })) === "6.6.6.6");
  env.NODE_ENV = prev;
}

// ---------------------------------------------------------------- prompts
{
  const agent = { effective: { systemPrompt: "You are the site assistant.", businessName: "DivineX", websiteKb: null } } as never;
  const base = { agent, fallbackBusinessName: "DivineX", contactContextBlock: null };
  const web = buildSystemPrompt({ ...base, channelId: "web-chat", leadCapture: false, kbOverride: "FACT: ASCEND exists.", extraBlocks: ["--- OFFERED LINKS ---\n- id=\"contact\": Contact\n--- END OFFERED LINKS ---"] });
  check("prompt: privacy rules present", /PRIVACY AND SAFETY/.test(web) && /NO access to any customer records/.test(web));
  check("prompt: tells the bot to refuse email/phone lookups", /email address or phone number/.test(web) && /decline/.test(web));
  check("prompt: anti-injection rule present", /ignore your rules/.test(web) && /untrusted/.test(web));
  check("prompt: says to admit unknowns and never invent", /don't have that information/.test(web) && /Never guess or invent/.test(web));
  check("prompt: knowledge reference injected", /FACT: ASCEND exists\./.test(web));
  check("prompt: lead capture OFF removes capture instructions", !/LEAD CAPTURE:/.test(web) && /do NOT emit any \[\[form\]\]/.test(web));
  check("prompt: CTA instructions only when links offered", /OFFERED LINKS marker/.test(web));
  const on = buildSystemPrompt({ ...base, channelId: "web-chat" });
  check("prompt: lead capture default ON keeps legacy capture instructions", /LEAD CAPTURE:/.test(on) && !/OFFERED LINKS marker/.test(on));
  check("prompt: no contact-context block ever added by web-chat builder", !/CONTACT CONTEXT|active deals|Recent notes/i.test(web + on));
  for (const ch of ["sms", "whatsapp", "voice"] as const) {
    const o = buildSystemPrompt({ ...base, channelId: ch });
    check(`prompt: ${ch} rails unchanged (no web-chat privacy block)`, !/PRIVACY AND SAFETY/.test(o) && /Never quote specific prices/.test(o));
  }
}

// ---------------------------------------------------------------- static isolation (source-level)
{
  const respond = stripComments(src("src/lib/comms/web-chat/respond.ts"));
  check("isolation: web-chat respond never imports the contact-context builder", !/comms\/ai\/context/.test(respond) && !/buildContactContextBlock/.test(respond));
  check("isolation: web-chat respond passes contactContextBlock: null", /contactContextBlock:\s*null/.test(respond));
  const forbidden = /(@\/lib\/ai-suite|@\/lib\/divinex|ascend-client|capabilities|authorized-profile|consume-profile)/;
  for (const f of ["respond.ts", "guard.ts", "knowledge.ts", "usage-limits.ts", "embed-token.ts", "capture.ts", "session.ts", "cta.ts"]) {
    check(`isolation: web-chat/${f} has no ASCEND / Zeno-tool imports`, !forbidden.test(stripComments(src(`src/lib/comms/web-chat/${f}`))));
  }
  for (const f of ["message", "capture", "config"]) {
    check(`isolation: api/web-chat/${f} route has no ASCEND / Zeno-tool imports`, !forbidden.test(stripComments(src(`src/app/api/web-chat/${f}/route.ts`))));
  }
  const msg = stripComments(src("src/app/api/web-chat/message/route.ts"));
  const cap = stripComments(src("src/app/api/web-chat/capture/route.ts"));
  check("route: /message goes through the guard before responding", msg.indexOf("guardWebChatRequest") > 0 && msg.indexOf("guardWebChatRequest") < msg.indexOf("respondToWebChat("));
  check("route: /capture goes through the guard", /guardWebChatRequest/.test(cap));
  check("route: /capture does not echo contact or task ids", !/contactId,|taskId:|emailSent:/.test(cap.slice(cap.lastIndexOf("NextResponse.json"))));
  check("route: /capture closed when lead capture is off", /leadCapture === false/.test(cap));
  const cfg = stripComments(src("src/app/api/web-chat/config/route.ts"));
  check("route: /config mints the token and fails closed without it", /mintEmbedToken/.test(cfg) && /unavailable/.test(cfg));
  check("guard: old in-memory limiter removed", !/rate-limit"/.test(msg + cap));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
