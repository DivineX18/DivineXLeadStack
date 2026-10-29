import { chromium, getCustomTokenForEmail, signInBrowserWithCustomToken, APP_URL } from "./e2e-setup-prod.mts";

const SA_ID = "73BcuAKXx5mWSDQYVdj1";

const PAGES = [
  `/sa/${SA_ID}/dashboard`,
  `/sa/${SA_ID}/contacts`,
  `/sa/${SA_ID}/tasks`,
  `/sa/${SA_ID}/reports`,
  `/sa/${SA_ID}/calendar`,
];

const customToken = await getCustomTokenForEmail("hello@divinex.io");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}

try {
  await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
  await signInBrowserWithCustomToken(page, customToken);

  for (const path of PAGES) {
    const pageErrors: string[] = [];
    const listener = (e: Error) => pageErrors.push(e.message);
    page.on("pageerror", listener);
    await page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    page.off("pageerror", listener);
    check(`no hydration/page error on ${path}`, pageErrors.length === 0);
    if (pageErrors.length > 0) console.log("  errors:", pageErrors);
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\ne2e-hydration-sweep-smoke: all checks passed" : `\ne2e-hydration-sweep-smoke: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
