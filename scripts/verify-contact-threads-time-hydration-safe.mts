/**
 * Found during the systematic hydration sweep (final QA certification,
 * 2026-10-28): contact-whatsapp-thread.tsx and contact-messages-thread.tsx
 * each have a MessageBubble sub-component that read
 * `ts.toLocaleString(undefined, {...})` unconditionally during render to
 * show a message's timestamp — same bug class as flow-dashboard.tsx:
 * toLocaleString() formats in the caller's locale/timezone, which the
 * server and a real visitor's browser disagree on.
 *
 * MessageBubble is itself a React component (not a plain helper function
 * called from a .map() in the parent), so it can call the
 * useHydrationSafeNow() hook directly — each list item is its own
 * component instance, so this isn't "a hook inside a loop."
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-contact-threads-time-hydration-safe.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

for (const file of [
  "src/components/contacts/contact-whatsapp-thread.tsx",
  "src/components/contacts/contact-messages-thread.tsx",
]) {
  const src = read(file);
  check(`${file}: imports the shared useHydrationSafeNow hook`, /import \{ useHydrationSafeNow \} from "@\/hooks\/use-hydration-safe-now";/.test(src));
  check(`${file}: MessageBubble calls the hook`, /function MessageBubble\(\{ message \}: \{ message: MessageDoc \}\) \{[\s\S]{0,600}const now = useHydrationSafeNow\(\);/.test(src));
  check(`${file}: the rendered timestamp is gated on now !== null, not unconditional`, /\{now !== null && ts\s*\?\s*ts\.toLocaleString/.test(src));
}

console.log(
  failures === 0
    ? `\nverify-contact-threads-time-hydration-safe: all checks passed`
    : `\nverify-contact-threads-time-hydration-safe: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
