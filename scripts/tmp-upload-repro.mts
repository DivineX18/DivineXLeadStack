import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.BASE ?? "https://flow-growth-scan-staging.onrender.com";
const SA = "x4NOJFn8bTyav7OeJc1v";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase/admin.ts");
const db = getAdminDb();

const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await r.json()) as { idToken: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("session cookie acquired:", cookie.length > 0);

// Throwaway funnel in the real workspace, deleted at the end.
const ref = db.collection("funnels").doc();
await ref.set({
  id: ref.id, subAccountId: SA, agencyId: "U5SBAHsB0nZ7ce552H9h", createdByUid: OWNER,
  name: "[TMP] upload repro", genre: "lead_magnet", status: "draft", theme: "light", accentColor: "#2563eb",
  sections: [{ id: "s1", type: "hero", config: { headline: "tmp" } }], chainRole: "standalone", parentFunnelId: null,
  createdAt: new Date(), updatedAt: new Date(),
});
console.log("throwaway funnel:", ref.id);

/** Minimal but structurally real PDF, padded to an exact byte size. */
function makePdf(bytes: number): Buffer {
  const head = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "latin1");
  const padTarget = Math.max(0, bytes - head.length - 20);
  const pad = Buffer.from(`%${"A".repeat(padTarget)}\n`, "latin1");
  return Buffer.concat([head, pad, Buffer.from("\n%%EOF\n", "latin1")]);
}

const SIZES: [string, number][] = [
  ["7.5MB", 7_500_000],
  ["8MB", 8_000_000],
  ["8.4MB", 8_400_000],
  ["9MB", 9_000_000],
  ["10MB", 10_000_000],
];

for (const [label, size] of SIZES) {
  const pdf = makePdf(size);
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), `repro-${label}.pdf`);
  const url = `${BASE}/api/sub-accounts/${SA}/funnels/${ref.id}/assets`;
  const t0 = Date.now();
  let res: Response | null = null;
  let body = "";
  try {
    res = await fetch(url, { method: "POST", headers: { cookie }, body: fd, signal: AbortSignal.timeout(180_000) });
    body = await res.text();
  } catch (e) {
    console.log(`${label.padEnd(7)} NETWORK ERROR after ${Date.now() - t0}ms: ${(e as Error).message}`);
    continue;
  }
  const ctype = res.headers.get("content-type") ?? "";
  const isHtml = /text\/html/.test(ctype) || body.trimStart().startsWith("<");
  console.log(
    `${label.padEnd(7)} POST ${res.status} ${ctype.split(";")[0]} ${Date.now() - t0}ms ${isHtml ? "<<< HTML RESPONSE >>>" : ""}`,
  );
  console.log(`        body[0..220]: ${JSON.stringify(body.slice(0, 220))}`);
}

if (process.env.KEEP !== "1") {
  await ref.delete();
  console.log("\nthrowaway funnel deleted");
}
process.exit(0);
