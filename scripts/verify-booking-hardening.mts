// Regression coverage for public booking abuse (2026-09-26). Before: the tenant-wide
// counter was spent BEFORE validation (junk from one client locked out real visitors),
// the client IP was a forgeable X-Forwarded-For, anyone could mail-bomb an address with
// confirmation emails, and availability accepted an unbounded date range.
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-booking-hardening.mts

import { readFileSync } from "node:fs";

const { consumeLimits, hashForKey, hourAndDayBuckets } = await import("../src/lib/comms/web-chat/usage-limits");
const { clampAvailabilityWindow, MAX_AVAILABILITY_WINDOW_DAYS } = await import("../src/lib/booking/window");

let failures = 0;
const check = (l: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); if (!ok) failures++; };

function memoryStore() {
  const data = new Map<string, { count: number; tokens: number }>();
  return {
    async transact<T>(keys: string[], decide: (cur: Record<string, { count: number; tokens: number }>) => { result: T; increments?: Record<string, { count?: number; tokens?: number }> }) {
      const cur: Record<string, { count: number; tokens: number }> = {};
      for (const k of keys) cur[k] = { ...(data.get(k) ?? { count: 0, tokens: 0 }) };
      const { result, increments } = decide(cur);
      for (const [k, inc] of Object.entries(increments ?? {})) {
        const c = data.get(k) ?? { count: 0, tokens: 0 };
        data.set(k, { count: c.count + (inc.count ?? 0), tokens: c.tokens + (inc.tokens ?? 0) });
      }
      return result;
    },
    peek: (k: string) => data.get(k)?.count ?? 0,
  };
}
const attempt = (store: ReturnType<typeof memoryStore>, ip: string, email: string, hour = "H1", day = "D1") =>
  consumeLimits(store, [
    { key: `book_ip_${hashForKey(ip)}_${hour}`, limit: 10, retryAfterSec: 60 },
    { key: `book_email_${hashForKey(email)}_${day}`, limit: 3, retryAfterSec: 600 },
    { key: `book_tenant_${hour}`, limit: 100, retryAfterSec: 60 },
  ]);

// ---- limiter semantics
{
  const s = memoryStore();
  const r = [] as boolean[];
  for (let i = 0; i < 3; i++) r.push((await attempt(s, `9.9.9.${i}`, "victim@example.com")).ok);
  check("first 3 bookings to one address in a day succeed", r.every(Boolean));
  const fourth = await attempt(s, "9.9.9.9", "victim@example.com");
  check("4th confirmation email to the same address (from a NEW ip) is refused: no email-bombing", !fourth.ok && fourth.key.startsWith("book_email_"));
  check("email limit is case/whitespace-insensitive", !(await attempt(s, "9.9.9.10", "  VICTIM@Example.com ")).ok);
}
{
  const s = memoryStore();
  let ok = 0, blocked = 0;
  for (let i = 0; i < 200; i++) { const x = await attempt(s, "6.6.6.6", `a${i}@example.com`); x.ok ? ok++ : blocked++; }
  check("one abusive client is capped at 10 bookings/hour", ok === 10 && blocked === 190, `${ok} ok / ${blocked} blocked`);
  check("...and its refused requests did NOT spend the tenant-wide allowance", s.peek("book_tenant_H1") === 10, `tenant counter = ${s.peek("book_tenant_H1")}`);
  let legit = 0;
  for (let i = 0; i < 50; i++) if ((await attempt(s, `10.0.0.${i}`, `real${i}@example.com`)).ok) legit++;
  check("50 legitimate visitors are unaffected by that attacker", legit === 50);
}
{
  const s = memoryStore();
  let ok = 0;
  for (let i = 0; i < 300; i++) if ((await attempt(s, `20.0.${Math.floor(i / 10)}.${i % 10}`, `u${i}@example.com`)).ok) ok++;
  check("tenant-wide ceiling still holds (needs 10+ distinct clients to reach)", ok === 100, `${ok} allowed`);
}
{
  const s = memoryStore();
  for (let i = 0; i < 10; i++) await attempt(s, "5.5.5.5", `x${i}@example.com`, "H1");
  check("client cap resets in the next hour bucket", (await attempt(s, "5.5.5.5", "y@example.com", "H2")).ok);
  const t = hourAndDayBuckets(Date.UTC(2026, 9, 1, 12, 30));
  check("bucket helper returns hour + day keys and retry seconds", t.hour === "2026100112" && t.day === "20261001" && t.secondsToNextHour === 1800);
}

// ---- availability window clamp
{
  const now = new Date("2026-10-01T12:00:00Z");
  const d = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const w1 = clampAvailabilityWindow({ now, to: new Date("9999-12-31T00:00:00Z"), visibleDays: 14 });
  check("a year-9999 `to` is clamped to the maximum window", (w1.to.getTime() - w1.from.getTime()) / 86_400_000 === MAX_AVAILABILITY_WINDOW_DAYS);
  const w2 = clampAvailabilityWindow({ now, from: new Date("1990-01-01T00:00:00Z"), visibleDays: 14 });
  check("a far-past `from` is pulled up to at most 1 day ago", w2.from.getTime() === now.getTime() - 86_400_000);
  const w3 = clampAvailabilityWindow({ now, visibleDays: 14 });
  check("no params: normal visible window preserved", w3.from.getTime() === now.getTime() && w3.to.getTime() === d(14).getTime());
  const w4 = clampAvailabilityWindow({ now, from: d(3), to: d(10), visibleDays: 14 });
  check("a reasonable requested window is left alone", w4.from.getTime() === d(3).getTime() && w4.to.getTime() === d(10).getTime());
}

// ---- source-level ordering guarantees
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const book = strip(readFileSync("src/app/api/booking/[saId]/[slug]/book/route.ts", "utf8"));
const avail = strip(readFileSync("src/app/api/booking/[saId]/[slug]/availability/route.ts", "utf8"));
const at = (s: string, needle: string) => s.indexOf(needle);
check("book: no forgeable forwarding headers are read", !/x-forwarded-for|x-real-ip/i.test(book));
check("book: uses the trusted client IP", /trustedClientIp\(request\.headers\)/.test(book));
check("book: the old tenant-wide pre-validation counter is gone", !/subHits|SUB_HOURLY_CAP/.test(book));
const limitIdx = at(book, "consumeLimits(");
check("book: persistent limits run AFTER body/email/slot validation", limitIdx > at(book, "Selected slot is invalid.") && limitIdx > at(book, 'A valid email is required.'));
check("book: persistent limits run AFTER the published-page check", limitIdx > at(book, 'page.status !== "published"'));
check("book: nothing is created or emailed before the limits pass", limitIdx < at(book, "runTransaction(") && limitIdx < at(book, "reconcileBookingContact(") && limitIdx < at(book, "sendEmail("));
check("book: fails closed (503) when limits cannot be checked", /status: 503/.test(book) && at(book, "status: 503") > limitIdx);
check("book: per-email cap protects recipients", /book_email_/.test(book) && /EMAIL_BOOKINGS_PER_DAY = 3/.test(book));
check("availability: no forgeable forwarding headers", !/x-forwarded-for|x-real-ip/i.test(avail));
check("availability: window is clamped for the query AND the computation", /clampAvailabilityWindow\(/.test(avail) && (avail.match(/fromInstant: window\.from/g) ?? []).length === 2 && /window\.from\.getTime\(\) - lookbackMs/.test(avail));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
