import { test, expect } from "@playwright/test";

/**
 * Ascend OS Phase 2, Slice 8.5 — SAFE, fully unauthenticated, read-only
 * checks. These run for real, every time, regardless of which Firebase
 * project .env.local points at — no login, no signup, no Firestore write
 * of any kind. This is the certification checklist's "Missing or
 * unresolved Workspace" / "no redirect loop" / "direct URL access remains
 * independently protected" items, exercised at the layer that's true for
 * EVERY caller before any identity is even resolved: middleware's session
 * gate.
 */

const APP_ROUTES = ["/app", "/app/home", "/app/identify", "/app/create", "/app/launch", "/app/grow", "/app/optimize", "/app/scale", "/app/settings"];

for (const route of APP_ROUTES) {
  test(`unauthenticated GET ${route} redirects to /login (never renders Ascend UI)`, async ({ page }) => {
    const response = await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
    // Never a 5xx/4xx dead end -- a clean redirect chain.
    expect(response?.status()).toBeLessThan(400);
    // No Ascend shell chrome ever reached the DOM for an unauthenticated caller.
    await expect(page.locator(".theme-ascend")).toHaveCount(0);
  });
}

test("redirect preserves the originally-requested path so a re-login lands back where the user meant to go", async ({ page }) => {
  await page.goto("/app/grow");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fapp%2Fgrow/);
});

test("no redirect loop: landing on /login from /app is a single hop, not a bounce cycle", async ({ page }) => {
  const seenUrls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) seenUrls.push(frame.url());
  });
  await page.goto("/app/home");
  await page.waitForLoadState("networkidle");
  // Exactly one navigation to a /login URL, not a repeating pattern.
  const loginHits = seenUrls.filter((u) => u.includes("/login")).length;
  expect(loginHits).toBeGreaterThan(0);
  expect(loginHits).toBeLessThanOrEqual(2); // allow one redirect + Next's own client resolution, never more
});

test("login page renders the real Firebase login form (not a broken/blank page)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("login page is keyboard-navigable end to end (tab order eventually reaches password and the submit button)", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").focus();
  await expect(page.locator("#email")).toBeFocused();
  // The form has a "Forgot password?" button between email and password in
  // DOM order (login-form.tsx), so email -> Tab legitimately lands there
  // first, not directly on #password. Assert reachability, not a specific
  // hop count -- this is pre-existing Flow UI, not part of the Slice 8
  // shell, so this test documents behavior rather than asserting a fix.
  let reachedPassword = false;
  for (let i = 0; i < 4 && !reachedPassword; i++) {
    await page.keyboard.press("Tab");
    reachedPassword = await page.locator("#password").evaluate((el) => el === document.activeElement);
  }
  expect(reachedPassword).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeFocused();
});

test("mobile viewport: unauthenticated /app/* still redirects cleanly (no half-rendered shell on small screens)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/home");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator(".theme-ascend")).toHaveCount(0);
});
