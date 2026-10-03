import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { withDeliveryLink } from "@/lib/funnels/cta-integrity";
import { publicLinkBase } from "@/lib/email/public-link";
import { defaultCtaLabel, deliveryPathFor, type DeliveryKind } from "@/lib/funnels/delivery";
import type { FunnelSection, HeroConfig, OfferConfig, FunnelDoc } from "@/types/funnels";

/**
 * CONNECTING A PROMISED DELIVERABLE TO THE EMAIL THAT FULFILS IT.
 *
 * This used to live inline in the PDF upload route, which meant a second
 * kind of deliverable would have grown a second copy of it. One function
 * now, so an uploaded document and a referenced video are wired the same
 * way and cannot drift into different behaviour.
 *
 * The operator never sees an id, a route or a URL: they attach the thing
 * they promised, and the follow-up email for the form that funnel converts
 * through gains a button pointing at it.
 */
export async function wireDeliveryIntoWorkflows(opts: {
  subAccountId: string;
  funnelId: string;
  funnel: FunnelDoc;
  assetId: string;
  kind: DeliveryKind;
  filename: string;
  ctaLabel?: string | null;
}): Promise<{ wiredWorkflows: number; deliveryUrl: string }> {
  const db = getAdminDb();
  const path = deliveryPathFor(opts.assetId, opts.kind);
  // Written branded, and re-resolved at send time anyway, so a deployment
  // move cannot strand an automation configured today.
  const absoluteUrl = `${publicLinkBase()}${path}`;
  const label = (opts.ctaLabel ?? "").trim() || defaultCtaLabel(opts.kind);

  await db.doc(`funnels/${opts.funnelId}`).update({
    leadMagnetAsset: {
      assetId: opts.assetId,
      filename: opts.filename,
      url: path,
      kind: opts.kind,
      ctaLabel: label,
    },
  });

  const formIds = new Set<string>();
  for (const s of (opts.funnel.sections ?? []) as FunnelSection[]) {
    const fid = (s.config as HeroConfig | OfferConfig).formId;
    if (typeof fid === "string" && fid) formIds.add(fid);
  }
  if (formIds.size === 0) return { wiredWorkflows: 0, deliveryUrl: absoluteUrl };

  const wfs = await db.collection("workflows").where("subAccountId", "==", opts.subAccountId).get();
  let wired = 0;
  for (const wf of wfs.docs) {
    const data = wf.data() as {
      trigger?: { formId?: string };
      nodes?: Record<string, { type?: string; config?: { body?: string } }>;
    };
    if (!data.trigger?.formId || !formIds.has(data.trigger.formId) || !data.nodes) continue;
    let changed = false;
    const nodes = { ...data.nodes };
    for (const [nid, node] of Object.entries(nodes)) {
      if (node?.type !== "send_email" || !node.config || typeof node.config.body !== "string") continue;
      // Placement and de-duplication live in withDeliveryLink, beside the
      // publish check that verifies the result: the link lands above the
      // unsubscribe footer, and replacing a deliverable leaves exactly one.
      const nextBody = withDeliveryLink(node.config.body, absoluteUrl, label);
      if (nextBody === node.config.body) continue;
      nodes[nid] = { ...node, config: { ...node.config, body: nextBody } };
      changed = true;
    }
    if (changed) {
      await wf.ref.update({ nodes });
      wired++;
    }
  }
  return { wiredWorkflows: wired, deliveryUrl: absoluteUrl };
}
