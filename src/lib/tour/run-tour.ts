"use client";

import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { prepareAnchor } from "./anchors";
import { saveTourState, type TourStatus } from "./tour-state";
import type { TourDef } from "./tours";

/**
 * THE TOUR RUNNER.
 *
 * Two rules govern everything here:
 *
 *   1. A TOUR MAY NEVER BLOCK THE APP. Every entry point is wrapped, a missing
 *      anchor skips its step instead of spotlighting empty space, and a thrown
 *      error tears the overlay down rather than leaving a modal the customer
 *      cannot dismiss.
 *   2. THE CUSTOMER IS NEVER TRAPPED. Back, Next, Skip and a progress readout
 *      are always present, Escape and overlay clicks close it, and closing is
 *      recorded as `skipped` so it does not ambush them again next login.
 */

export type TourAnalytics = (
  event: "tour_started" | "tour_step_viewed" | "tour_skipped" | "tour_completed" | "tour_restarted",
  props: { tour_id: string; tour_version: string; experience: string; step_id?: string },
) => void;

interface RunOptions {
  tour: TourDef;
  experience: string;
  /** Firestore is keyed by user here, unlike Ascend where the session
   *  identifies the caller server-side. */
  uid: string;
  startAt?: number;
  track: TourAnalytics;
  /** True when the customer pressed Restart rather than this being first-run. */
  restarted?: boolean;
}

/** Steps whose anchor is genuinely on screen, plus every anchorless step.
 *  Resolved BEFORE driver starts so the progress count is honest — telling
 *  someone "3 of 6" and then silently showing four is worse than showing
 *  fewer steps. */
async function resolvableSteps(tour: TourDef) {
  const out: { def: (typeof tour.steps)[number]; element?: HTMLElement }[] = [];
  for (const def of tour.steps) {
    if (!def.anchor) {
      out.push({ def });
      continue;
    }
    let el = await prepareAnchor(def.anchor);
    if (!el && def.fallbackAnchor) el = await prepareAnchor(def.fallbackAnchor);
    if (el) out.push({ def, element: el });
    // Absent anchor => the customer does not have that surface. Skip it
    // silently rather than describing something they cannot see.
  }
  return out;
}

export async function runTour(opts: RunOptions): Promise<void> {
  const { tour, experience, uid, track, startAt = 0, restarted = false } = opts;
  let active: Driver | null = null;

  try {
    const steps = await resolvableSteps(tour);
    if (steps.length === 0) return;

    let settled = false;
    /** Record once. Closing the overlay fires driver's destroy hook as well as
     *  our own handlers, and a tour must not write "skipped" over "completed". */
    const settle = (status: Extract<TourStatus, "completed" | "skipped">, step: number) => {
      if (settled) return;
      settled = true;
      saveTourState(uid, tour.id, tour.version, status, step);
      track(status === "completed" ? "tour_completed" : "tour_skipped", {
        tour_id: tour.id,
        tour_version: String(tour.version),
        experience,
      });
    };

    const driveSteps: DriveStep[] = steps.map(({ def, element }, index) => ({
      element,
      popover: {
        title: def.title,
        description: def.body,
        // Anchorless steps (Welcome) are centred by driver when element is
        // undefined; everything else points at the real nav item.
        onPopoverRender: () => {
          track("tour_step_viewed", {
            tour_id: tour.id,
            tour_version: String(tour.version),
            experience,
            step_id: def.anchor ?? `step-${index}`,
          });
          // Resuming should land where they left off, so the step index is
          // persisted as they move — an intentional transition, not a
          // cosmetic one.
          saveTourState(uid, tour.id, tour.version, "in_progress", index);
        },
      },
    }));

    active = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      showButtons: ["next", "previous", "close"],
      allowClose: true,
      steps: driveSteps,
      onDestroyed: () => {
        // Reached only when the customer closed it early; the Finish path
        // settles as completed before destroying.
        settle("skipped", active?.getActiveIndex() ?? 0);
      },
      onDestroyStarted: () => {
        const d = active;
        if (!d) return;
        if (!d.hasNextStep()) {
          settle("completed", driveSteps.length - 1);
        }
        d.destroy();
      },
    });

    saveTourState(uid, tour.id, tour.version, "in_progress", startAt);
    track(restarted ? "tour_restarted" : "tour_started", {
      tour_id: tour.id,
      tour_version: String(tour.version),
      experience,
    });

    active.drive(Math.min(Math.max(startAt, 0), driveSteps.length - 1));
  } catch {
    // Never leave an overlay the customer cannot escape.
    try {
      active?.destroy();
    } catch {
      /* nothing further to do */
    }
  }
}
