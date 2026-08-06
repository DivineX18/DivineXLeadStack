import type { Page } from "@playwright/test";
import type { TestAccount } from "./test-accounts";

/**
 * Ascend OS Phase 2, Slice 8.5 — logs in through the EXISTING Firebase
 * login form (src/components/auth/login-form.tsx) exactly as a real
 * customer would. Does not create a session any other way (no direct
 * cookie injection, no bypassing the real auth flow) — the point of this
 * slice is to certify the REAL login path, not a shortcut around it.
 */
export async function loginAs(page: Page, account: TestAccount, redirectTo?: string): Promise<void> {
  const target = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login";
  await page.goto(target);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // The login form flips to a Firebase session cookie via /api/login then
  // client-side navigates; wait for the URL to leave /login rather than a
  // fixed timeout.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}
