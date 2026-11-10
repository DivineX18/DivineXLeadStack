import "server-only";

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { assertFirebaseProjectNotProductionInStaging } from "@/lib/env/deployment-environment";
import { normalizeFirebasePrivateKey } from "@/lib/firebase/private-key";

let _app: App | null = null;

function getAdminApp(): App {
  if (!_app) {
    if (getApps().length > 0) {
      _app = getApps()[0];
    } else {
      // Staging isolation (2026-11-09): the earliest point a misconfigured
      // staging service (DEPLOYMENT_ENV=staging) would otherwise start
      // reading/writing production data, if its env vars drifted back to
      // the production project. No-op on every deployment that hasn't set
      // DEPLOYMENT_ENV=staging, including production and local dev.
      assertFirebaseProjectNotProductionInStaging(
        process.env.FIREBASE_ADMIN_PROJECT_ID,
      );
      _app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: normalizeFirebasePrivateKey(
            process.env.FIREBASE_ADMIN_PRIVATE_KEY,
          ),
        }),
      });
    }
  }
  return _app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  const db = getFirestore(getAdminApp());
  // ignoreUndefinedProperties: skip undefined values on writes instead of
  // throwing. Defends against the easy mistake of `meta: { foo: x ?? undefined }`
  // which crashes the whole request. settings() can only be called once per
  // Firestore instance and must run before any other call; in Next.js dev,
  // hot-reload kicks the module state but the Firestore instance persists,
  // so subsequent calls throw "already initialized" — swallow that path.
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured on a prior import; nothing to do.
  }
  return db;
}

/** Admin SDK Storage bucket — same bucket the client SDK uploads to
 *  (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET). Bypasses storage.rules entirely
 *  (Admin SDK always has full access), so callers are responsible for
 *  their own authorization before reading/writing/signing a URL. */
export function getAdminStorageBucket() {
  return getStorage(getAdminApp()).bucket(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  );
}
