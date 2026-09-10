import "server-only";
import { cache } from "react";

import { getAdminDb } from "@/lib/firebase/admin";
import { isPubliclyRenderable } from "@/types/funnels";
import type { CheckoutConfig, FunnelDoc, HeroConfig, MultiStepFormConfig, OfferConfig, TicketTiersConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

export interface RenderableFunnel {
  funnel: FunnelDoc;
  /** formId -> serialized LeadForm, for any hero/offer/ticket_tiers/checkout
   *  sections referencing an embedded lead-capture form. */
  forms: Record<string, LeadForm>;
  /**
   * Whether an email can actually reach someone who submits this page: at
   * least one ACTIVE workflow is triggered by one of its capture forms.
   *
   * The confirmation a visitor sees used to say "Check your inbox, everything
   * you need is on its way to your email" whenever a funnel was published,
   * with nothing checking that anything could send. A hundred and three
   * published funnels had only draft workflows behind them, so that sentence
   * was false on every one of them: the lead was captured, the inbox stayed
   * empty, and nobody was told.
   *
   * Publishing now refuses that state, but pages published BEFORE that guard
   * are still live and still collecting. This is what lets the renderer stop
   * promising an email it knows cannot arrive, without changing what the page
   * captures, sending anything, or touching stored data.
   */
  deliveryLive: boolean;
}

/** Shared by /lp/[funnelId] and the custom-domain resolver so both entry
 *  points can never drift. Returns null when the funnel doesn't exist or
 *  isn't published — callers should notFound() on null (draft and missing
 *  treated identically, same as the booking page's pattern, so an
 *  unpublished funnel's existence is never leaked). */
/** Per-request dedupe (React cache): generateMetadata + the page component
 *  both call this — one Firestore read serves both. */
export const loadFunnelForRender = cache(loadFunnelForRenderUncached);

async function loadFunnelForRenderUncached(
  funnelId: string,
): Promise<RenderableFunnel | null> {
  const db = getAdminDb();
  const snap = await db.collection("funnels").doc(funnelId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<FunnelDoc, "id">;
  // PUBLISH BOUNDARY. Uses the explicit whitelist rather than a !== check so
  // that adding a state (approved, scheduled, paused…) can never accidentally
  // make it public. Approving is not publishing.
  if (!isPubliclyRenderable(data.status)) return null;

  const funnel: FunnelDoc = { id: snap.id, ...data, createdAt: null, updatedAt: null };

  const forms = await loadFunnelFormsForPreview(funnel);
  return { funnel, forms, deliveryLive: await resolveDeliveryLive(funnel, Object.keys(forms)) };
}

/** One equality query per render, deduped by the React cache above. Fails
 *  CLOSED: if the lookup throws, the page simply stops claiming an email is
 *  coming, which is the safe direction to be wrong in. */
async function resolveDeliveryLive(funnel: FunnelDoc, formIds: string[]): Promise<boolean> {
  if (formIds.length === 0) return false;
  try {
    const snap = await getAdminDb()
      .collection("workflows")
      .where("subAccountId", "==", funnel.subAccountId)
      .where("status", "==", "active")
      .get();
    return snap.docs.some((d) => {
      const t = (d.data() as { trigger?: { formId?: string } }).trigger;
      return !!t?.formId && formIds.includes(t.formId);
    });
  } catch {
    return false;
  }
}

/**
 * The section→form resolution used by BOTH the published renderer and the
 * authenticated draft preview, so preview and production can never drift.
 * Exported for the preview route (drafts are rejected by the loader above
 * on purpose — publishing is a deliberate act).
 */
export async function loadFunnelFormsForPreview(funnel: FunnelDoc): Promise<Record<string, LeadForm>> {
  const db = getAdminDb();
  const formIds = new Set<string>();
  for (const section of funnel.sections) {
    if (section.type === "hero") {
      const c = section.config as HeroConfig;
      if (c.formId) formIds.add(c.formId);
    }
    if (section.type === "offer") {
      const c = section.config as OfferConfig;
      if (c.formId) formIds.add(c.formId);
    }
    if (section.type === "ticket_tiers") {
      const c = section.config as TicketTiersConfig;
      for (const t of c.tiers) if (t.formId) formIds.add(t.formId);
    }
    if (section.type === "multi_step_form") {
      const c = section.config as MultiStepFormConfig;
      if (c.formId) formIds.add(c.formId);
    }
    if (section.type === "checkout") {
      const c = section.config as CheckoutConfig;
      if (c.checkoutMode === "form_capture" && c.formId) formIds.add(c.formId);
    }
  }

  const forms: Record<string, LeadForm> = {};
  await Promise.all(
    [...formIds].map(async (formId) => {
      const fSnap = await db.collection("forms").doc(formId).get();
      if (fSnap.exists) {
        const fd = fSnap.data() as Omit<LeadForm, "id">;
        forms[formId] = { id: fSnap.id, ...fd, createdAt: null, updatedAt: null };
      }
    }),
  );
  return forms;
}
