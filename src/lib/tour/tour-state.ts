"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * TOUR STATE — SERVER-AUTHORITATIVE, IN THE PLACE PER-USER STATE ALREADY LIVES.
 *
 * `users/{uid}/settings/{settingId}` already exists for per-user preferences
 * (push notifications use it) and its rule is exactly what this needs:
 * `allow read, write: if request.auth.uid == userId`. No rules change, no new
 * collection.
 *
 * localStorage is a cache for two narrow jobs and is never the authority:
 * suppressing a flash of the tour while the read is in flight, and
 * suppressing REPLAY when Firestore cannot be reached. Whenever the server
 * answers, its answer wins.
 */

export type TourStatus = "not_started" | "in_progress" | "completed" | "skipped";

export interface TourState {
  status: TourStatus;
  currentStep: number;
}

const DOC_ID = "productTour";
const cacheKey = (uid: string, tourId: string, version: number) =>
  `divinex_flow_tour_${uid}_${tourId}_v${version}`;

function readCache(uid: string, tourId: string, version: number): TourStatus | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(uid, tourId, version));
    return raw === "completed" || raw === "skipped" || raw === "in_progress" ? raw : null;
  } catch {
    return null;
  }
}

function writeCache(uid: string, tourId: string, version: number, status: TourStatus): void {
  try {
    window.localStorage.setItem(cacheKey(uid, tourId, version), status);
  } catch {
    /* cache is optional */
  }
}

/** Keyed by tour AND version inside one document, so shipping a new version
 *  starts fresh without destroying the record of an earlier completion. */
const field = (tourId: string, version: number) => `${tourId}_v${version}`;

export async function loadTourState(
  uid: string,
  tourId: string,
  version: number,
): Promise<TourState & { serverReachable: boolean }> {
  try {
    const snap = await getDoc(doc(getFirebaseDb(), `users/${uid}/settings/${DOC_ID}`));
    const entry = (snap.data() ?? {})[field(tourId, version)] as
      | { status?: TourStatus; currentStep?: number }
      | undefined;
    const status = entry?.status ?? "not_started";
    writeCache(uid, tourId, version, status);
    return {
      status,
      currentStep: typeof entry?.currentStep === "number" ? entry.currentStep : 0,
      serverReachable: true,
    };
  } catch {
    return {
      status: readCache(uid, tourId, version) ?? "not_started",
      currentStep: 0,
      serverReachable: false,
    };
  }
}

/** Records an INTENTIONAL transition. Fire-and-forget: a failed write must
 *  never interrupt the tour the customer is looking at, and the cache already
 *  holds the suppression. */
export function saveTourState(
  uid: string,
  tourId: string,
  version: number,
  status: TourStatus,
  currentStep: number,
): void {
  writeCache(uid, tourId, version, status);
  void setDoc(
    doc(getFirebaseDb(), `users/${uid}/settings/${DOC_ID}`),
    { [field(tourId, version)]: { status, currentStep, updatedAt: Date.now() } },
    { merge: true },
  ).catch(() => {
    /* best effort */
  });
}

/** Auto-start only for someone who has never finished or dismissed it — and
 *  never on a guess, when the server could not be reached and the device has
 *  no record either. Replaying a tour someone already completed is worse than
 *  missing a first run they can still start from settings. */
export function shouldAutoStart(state: TourState & { serverReachable: boolean }): boolean {
  if (state.status === "completed" || state.status === "skipped") return false;
  if (!state.serverReachable && state.status === "not_started") return false;
  return true;
}
