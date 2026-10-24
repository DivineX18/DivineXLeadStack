import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
export { chromium } from "../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs";
export { getCustomTokenForEmail, signInBrowserWithCustomToken } from "./e2e-session-cookie.mts";
export const APP_URL = "http://localhost:3000";
