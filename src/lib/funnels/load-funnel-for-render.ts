import "server-only";
import { cache } from "react";

import { getAdminDb } from "@/lib/firebase/admin";
import type { CheckoutConfig, FunnelDoc, HeroConfig, OfferConfig, TicketTiersConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

export interface RenderableFunnel {
  funnel: FunnelDoc;
  /** formId -> serialized LeadForm, for any hero/offer/ticket_tiers/checkout
   *  sections referencing an embedded lead-capture form. */
  forms: Record<string, LeadForm>;
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
  if (data.status !== "published") return null;

  const funnel: FunnelDoc = { id: snap.id, ...data, createdAt: null, updatedAt: null };

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

  return { funnel, forms };
}
