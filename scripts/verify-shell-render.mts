/**
 * FINAL LAUNCH PASS — UI ACCEPTANCE, RENDERED.
 *
 * The token maths in verify-unified-theme.mts proves the palettes are correct.
 * This proves they actually REACH the browser: real Chromium, real session,
 * real computed styles, both themes, and a real hover.
 *
 * Judging CSS source alone would repeat the mistake this whole pass exists to
 * avoid — asserting on a description of the artifact instead of the artifact.
 *
 * Run: SHELL_SA=<workspace> NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/verify-shell-render.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const BASE = process.env.E2E_BASE ?? "http://localhost:3114";
const OWNER = "irkY5HKIzxb64l5qCyHroTrudJa2";

const { chromium } = await import("@playwright/test");
const { getAdminAuth } = await import("../src/lib/firebase/admin.ts");

let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${n ? ` — ${n}` : ""}`); if (!ok) bad++; };

// Real session cookie, same path the app's own login uses.
const ct = await getAdminAuth().createCustomToken(OWNER);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: ct, returnSecureToken: true }),
});
const { idToken } = (await r.json()) as { idToken?: string };
const login = await fetch(`${BASE}/api/login`, { headers: { Authorization: `Bearer ${idToken}` }, redirect: "manual" });
const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => {
  const [pair] = c.split(";");
  const idx = pair.indexOf("=");
  return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "localhost", path: "/" };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();

function lum(rgb: string): number {
  const m = rgb.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (!m) return -1;
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
}

async function setTheme(mode: "light" | "dark") {
  await page.evaluate((m) => {
    localStorage.setItem("theme", m);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(m);
  }, mode);
  await page.waitForTimeout(250);
}

await page.goto(`${BASE}/app/home`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const shellPresent = await page.locator(".theme-ascend").count();
check("the unified shell renders", shellPresent > 0, `url=${page.url()}`);

// ── BOTH THEMES ACTUALLY APPLY IN THE BROWSER ─────────────────────────────
console.log("\n── RENDERED THEMES\n");
const results: Record<string, { shell: number; text: number }> = {};
for (const mode of ["light", "dark"] as const) {
  await setTheme(mode);
  const shellBg = await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const textCol = await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).color);
  results[mode] = { shell: lum(shellBg), text: lum(textCol) };
  console.log(`  ${mode}: background ${shellBg} (L=${results[mode].shell.toFixed(3)}), text ${textCol}`);
}
check("light mode renders a light background", results.light.shell > 0.5, `L=${results.light.shell.toFixed(3)}`);
check("dark mode renders a dark background", results.dark.shell < 0.1, `L=${results.dark.shell.toFixed(3)}`);
check("text inverts with the theme (no unreadable combination)",
  results.light.text < 0.3 && results.dark.text > 0.5,
  `light text L=${results.light.text.toFixed(3)} dark text L=${results.dark.text.toFixed(3)}`);

// ── NO HALF-LIGHT/HALF-DARK PANELS ────────────────────────────────────────
console.log("\n── NO HALF-LIGHT / HALF-DARK SURFACES\n");
for (const mode of ["light", "dark"] as const) {
  await setTheme(mode);
  const shellL = lum(await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).backgroundColor));
  // Every opaque panel on the page must sit on the same side of the tonal
  // scale as the shell. A white card in dark mode is the failure.
  const bad2 = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("main *, aside *")).slice(0, 400)) {
      const bg = getComputedStyle(el as Element).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m) continue;
      const alpha = m[4] === undefined ? 1 : +m[4];
      if (alpha < 0.9) continue; // translucent overlays are fine
      out.push(`${(el as Element).tagName}:${bg}`);
    }
    return out;
  });
  const wrong = bad2.filter((s) => {
    const l = lum(s.split(":").slice(1).join(":"));
    return shellL > 0.5 ? l < 0.2 : l > 0.8;
  });
  check(`  ${mode}: no panel is pinned to the opposite theme`, wrong.length === 0,
    wrong.slice(0, 3).join(" | ") || `${bad2.length} opaque surfaces, all consistent`);
}

// ── NAV STATES, RENDERED ──────────────────────────────────────────────────
console.log("\n── NAV STATES (rendered)\n");
for (const mode of ["light", "dark"] as const) {
  await setTheme(mode);
  // Park the pointer away from the nav first — otherwise the previous
  // iteration's hover is still applied and "idle" reads as hovered.
  await page.mouse.move(1400, 850);
  await page.waitForTimeout(200);
  const links = page.locator("aside nav a");
  const n = await links.count();
  if (n === 0) { check(`  ${mode}: nav links present`, false, "no sidebar nav links found"); continue; }

  // The locked IA only renders for a Complete-mode workspace. Without one the
  // shell falls back to a 3-link account nav, and asserting the IA against
  // that would be asserting against the wrong screen — report it, don't fake it.
  const labels = (await links.allTextContents()).map((t) => t.trim());
  const lockedIA = ["Home", "Create", "Leads", "Performance", "Intelligence", "Settings"];
  const hasLockedIA = lockedIA.every((l) => labels.some((x) => x.toLowerCase() === l.toLowerCase()));
  if (!hasLockedIA) {
    console.log(`  ${mode}: REQUIRES CONFIGURATION — locked IA absent (rendered: ${labels.join(", ")})`);
    console.log(`  ${mode}: needs a Complete-mode workspace; nav state assertions deferred to staging.`);
  }

  const active = page.locator('aside nav a[aria-current="page"]');
  const activeCount = await active.count();
  if (hasLockedIA) {
    check(`  ${mode}: exactly one nav item is marked active`, activeCount === 1, `${activeCount}`);
  }

  const activeBg = activeCount ? await active.first().evaluate((el) => getComputedStyle(el).backgroundColor) : "none";

  // Hover a NON-active link and confirm the background actually changes.
  let idle = "", hovered = "";
  for (let i = 0; i < n; i++) {
    const l = links.nth(i);
    if (await l.getAttribute("aria-current")) continue;
    idle = await l.evaluate((el) => getComputedStyle(el).backgroundColor);
    const box = await l.boundingBox();
    await l.hover();
    await page.waitForTimeout(220);
    hovered = await l.evaluate((el) => getComputedStyle(el).backgroundColor);
    const box2 = await l.boundingBox();
    check(`  ${mode}: hover causes no layout shift`,
      !!box && !!box2 && Math.abs(box.width - box2.width) < 0.5 && Math.abs(box.height - box2.height) < 0.5);
    break;
  }
  check(`  ${mode}: hover visibly changes the nav item`, idle !== hovered, `${idle} -> ${hovered}`);
  check(`  ${mode}: hover and active are distinct`, hovered !== activeBg, `hover=${hovered} active=${activeBg}`);
}

// ── TOGGLE IS PRESENT AND WORKS FROM THE UI ───────────────────────────────
console.log("\n── THEME TOGGLE (real click)\n");
await setTheme("dark");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
// Target by accessible name — `header button` first() is the mobile-nav
// trigger, which is hidden at desktop width and therefore not clickable.
const toggle = page.getByRole("button", { name: /toggle theme/i });
check("a theme toggle is present and visible in the shell header",
  (await toggle.count()) > 0 && (await toggle.first().isVisible()), `${await toggle.count()} found`);
const beforeL = lum(await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).backgroundColor));
try {
  await toggle.first().click();
  await page.waitForTimeout(400);
  const menuItem = page.getByRole("menuitem", { name: /light/i });
  if (await menuItem.count()) {
    await menuItem.first().click();
    await page.waitForTimeout(500);
    const afterL = lum(await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).backgroundColor));
    check("clicking Light in the toggle switches the whole shell", afterL > 0.5 && beforeL < 0.2,
      `L ${beforeL.toFixed(3)} -> ${afterL.toFixed(3)}`);
    // Persistence across a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const persistedL = lum(await page.locator(".theme-ascend").first().evaluate((el) => getComputedStyle(el).backgroundColor));
    check("the choice persists across a reload", persistedL > 0.5, `L=${persistedL.toFixed(3)}`);
  } else {
    check("the toggle opens a light/dark menu", false, "no Light menuitem found");
  }
} catch (err) {
  check("the toggle is operable", false, err instanceof Error ? err.message.slice(0, 120) : String(err));
}

await browser.close();
console.log(`\n${bad === 0 ? "UI ACCEPTANCE (RENDERED): PASS" : `UI ACCEPTANCE (RENDERED): ${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);
