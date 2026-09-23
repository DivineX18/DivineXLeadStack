"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { loadTourState, shouldAutoStart } from "@/lib/tour/tour-state";
import { tourForWorkspace } from "@/lib/tour/tours";
import { runTour } from "@/lib/tour/run-tour";
import { trackFunnelEvent } from "@/lib/analytics/track";

/**
 * FLOW'S TOUR — DECIDED HERE, NOT HANDED OVER.
 *
 * An Ascend customer arrives through the certified SSO handoff, which carries
 * no tour state and is not changed to carry any. Flow works out for itself
 * which story applies, from the `ascendOperations` grant already on the
 * workspace: an active grant means they crossed over from Intelligence and
 * need the continuation; no grant means a standalone Flow customer who must
 * never be shown Ascend features they do not own.
 *
 * Returns null and never blocks rendering. Every failure path is swallowed:
 * a tour that cannot run is a non-event, not an outage.
 */
export function ProductTour({ ascendGrantActive }: { ascendGrantActive: boolean }): null {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || loading || !user?.uid) return;
    // Only inside a workspace, where the nav this anchors to exists.
    if (!pathname?.startsWith("/sa/")) return;

    firedRef.current = true;
    const tour = tourForWorkspace(ascendGrantActive);
    const uid = user.uid;

    void (async () => {
      try {
        const state = await loadTourState(uid, tour.id, tour.version);
        if (!shouldAutoStart(state)) return;
        await runTour({
          tour,
          uid,
          experience: tour.id,
          startAt: state.status === "in_progress" ? state.currentStep : 0,
          track: (event, props) => trackFunnelEvent(event, props),
        });
      } catch {
        /* a tour must never break the workspace */
      }
    })();
  }, [loading, user?.uid, pathname, ascendGrantActive]);

  return null;
}

/** Restart from settings. Replays the CURRENT version from the beginning
 *  against that version's own record, so an earlier completion is untouched. */
export async function restartFlowTour(uid: string, ascendGrantActive: boolean): Promise<void> {
  const tour = tourForWorkspace(ascendGrantActive);
  await runTour({
    tour,
    uid,
    experience: tour.id,
    startAt: 0,
    track: (event, props) => trackFunnelEvent(event, props),
    restarted: true,
  });
}
