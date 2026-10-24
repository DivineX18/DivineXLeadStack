/**
 * Mint a real, genuinely-authenticated session cookie for a known uid,
 * without ever typing a password, for Playwright browser certification.
 *
 * Admin SDK createCustomToken(uid) -> Firebase REST signInWithCustomToken
 * (exchanges for a real ID token) -> POST that ID token to this app's own
 * /api/login (GET with Authorization: Bearer, per next-firebase-auth-edge's
 * contract — see src/lib/firebase/auth.ts::createSessionCookie, the exact
 * same call the login form itself makes) -> capture the Set-Cookie header.
 *
 * Exported so other e2e scripts can import getSessionCookie() directly
 * instead of re-deriving this.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

export async function getUidByEmail(email: string): Promise<string> {
  const user = await getAuth().getUserByEmail(email);
  return user.uid;
}

export async function getCustomTokenForEmail(email: string): Promise<string> {
  const uid = await getUidByEmail(email);
  return getAuth().createCustomToken(uid);
}

export async function getSessionCookieForUid(
  uid: string,
  appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
): Promise<{ name: string; value: string }> {
  const customToken = await getAuth().createCustomToken(uid);

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchangeJson = (await exchangeRes.json()) as { idToken?: string; error?: { message?: string } };
  if (!exchangeRes.ok || !exchangeJson.idToken) {
    throw new Error(`signInWithCustomToken failed: ${exchangeJson.error?.message ?? exchangeRes.status}`);
  }

  const loginRes = await fetch(`${appUrl}/api/login`, {
    method: "GET",
    headers: { Authorization: `Bearer ${exchangeJson.idToken}` },
    redirect: "manual",
  });
  if (![200, 204].includes(loginRes.status)) {
    throw new Error(`/api/login failed: ${loginRes.status} ${await loginRes.text().catch(() => "")}`);
  }
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("/api/login did not return a Set-Cookie header");
  const match = setCookie.match(/^([^=]+)=([^;]+)/);
  if (!match) throw new Error(`Could not parse Set-Cookie: ${setCookie}`);
  return { name: match[1], value: match[2] };
}

export async function getSessionCookieForEmail(email: string, appUrl?: string) {
  const uid = await getUidByEmail(email);
  return getSessionCookieForUid(uid, appUrl);
}

/**
 * Real browser sign-in, not just a server cookie. Minting /api/login's
 * cookie alone leaves the Firebase JS SDK's CLIENT-side auth state empty
 * (it persists to this origin's IndexedDB, separate from the httpOnly
 * session cookie), so any component reading useAuth()/onAuthStateChanged
 * sees no user even though the server-rendered chrome looks authenticated.
 * This runs signInWithCustomToken() INSIDE the page via the real Firebase
 * modular SDK (same version as the app, loaded from gstatic) so the
 * client's own persisted auth state is set exactly like a real sign-in —
 * matching what the app's own SSO bridge finish page does (see
 * src/lib/firebase/auth.ts::createSessionCookie, "same call the login form
 * makes").
 */
export async function signInBrowserWithCustomToken(
  page: { addScriptTag: (opts: { url?: string; type?: string; content?: string }) => Promise<unknown>; evaluate: <T>(fn: () => Promise<T> | T) => Promise<T> },
  customToken: string,
): Promise<void> {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  await page.addScriptTag({
    type: "module",
    content: `
      import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
      import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
      const app = initializeApp(${JSON.stringify(config)});
      const auth = getAuth(app);
      const cred = await signInWithCustomToken(auth, ${JSON.stringify(customToken)});
      const idToken = await cred.user.getIdToken();
      await fetch("/api/login", { headers: { Authorization: "Bearer " + idToken } });
      window.__e2eSignedIn = true;
    `,
  });
  await page.evaluate(async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if ((window as unknown as { __e2eSignedIn?: boolean }).__e2eSignedIn) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Browser-side signInWithCustomToken did not complete in time");
  });
}

// Allow running standalone: `npx tsx scripts/e2e-session-cookie.mts user@email`
if (process.argv[2]) {
  const cookie = await getSessionCookieForEmail(process.argv[2]);
  console.log(JSON.stringify(cookie));
}
