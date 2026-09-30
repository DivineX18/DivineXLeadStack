/**
 * The home-screen icon endpoint must not answer with a host it invented.
 *
 * Production served every icon request a 302 to
 * https://localhost:10000/apple-touch-icon.png, because the route built the
 * redirect from `request.url` and behind the proxy that is the container's
 * own address. iOS fetches apple-touch-icon when someone adds the app to
 * their home screen; it got an unreachable URL and fell back to a
 * screenshot of the page.
 */
import { GET } from "../src/app/api/pwa/icon/[variant]/route";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

const call = async (variant: string, requestUrl: string) =>
  GET(new Request(requestUrl), { params: Promise.resolve({ variant }) });

console.log("══ the redirect is host-independent ══");
{
  // The exact shape production sends: an internal origin the device cannot
  // reach. The answer must not contain it.
  for (const origin of [
    "https://localhost:10000",
    "http://127.0.0.1:3000",
    "https://app.divinex.io",
  ]) {
    const res = await call("apple", `${origin}/api/pwa/icon/apple`);
    const loc = res.headers.get("location") ?? "";
    check(
      `from ${origin} the Location carries no host`,
      res.status === 302 && loc.startsWith("/") && !/localhost|127\.0\.0\.1|divinex/.test(loc),
      `${res.status} ${loc}`,
    );
  }

  // Every variant the manifest and the apple-touch link reference.
  for (const [variant, expected] of [
    ["192", "/icon-192.png"],
    ["512", "/icon-512.png"],
    ["maskable", "/icon-maskable-512.png"],
    ["apple", "/apple-touch-icon.png"],
  ] as const) {
    const res = await call(variant, "https://localhost:10000/api/pwa/icon/" + variant);
    check(`${variant} points at ${expected}`, res.headers.get("location") === expected, String(res.headers.get("location")));
  }

  const unknown = await call("nope", "https://localhost:10000/api/pwa/icon/nope");
  check("an unknown variant is a 404, not a redirect", unknown.status === 404, String(unknown.status));
}

console.log(`\n${failures === 0 ? "PWA ICON REDIRECT: ALL CHECKS PASSED" : `PWA ICON REDIRECT: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
