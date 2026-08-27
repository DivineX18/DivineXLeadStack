import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getFunnel } from "@/lib/server/funnels-service";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_BYTES, storeFunnelAsset } from "@/lib/funnels/assets";
import type { FunnelSection, HeroConfig, OfferConfig } from "@/types/funnels";

export const dynamic = "force-dynamic";

/**
 * Operator asset upload for a funnel (Multistep Journey pass): images for
 * section media, and the LEAD MAGNET PDF. A PDF upload additionally wires
 * DELIVERY: the download link is stored on the funnel
 * (`leadMagnetAsset`) and appended (idempotently) to the send_email nodes of
 * every workflow triggered by this funnel's capture form — so the file the
 * visitor signed up for actually arrives in the confirmation email.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; funnelId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, funnelId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const funnel = await getFunnel(subAccountId, funnelId);
  if (!funnel) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!ALLOWED_ASSET_TYPES[file.type]) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP images and PDF files are supported" }, { status: 400 });
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeFunnelAsset({
    subAccountId,
    agencyId: funnel.agencyId,
    funnelId,
    createdByUid: access.uid,
    contentType: file.type,
    filename: file.name || "upload",
    bytes,
  });

  // PDF = the lead magnet: store the reference + wire email delivery.
  if (file.type === "application/pdf") {
    const db = getAdminDb();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const absoluteUrl = `${appUrl}${stored.url}`;
    await db.doc(`funnels/${funnelId}`).update({
      leadMagnetAsset: { assetId: stored.assetId, filename: file.name || "download.pdf", url: stored.url },
    });

    // Find the capture form this funnel converts through, then append the
    // download link to every send_email node of workflows triggered by it.
    const formIds = new Set<string>();
    for (const s of funnel.sections as FunnelSection[]) {
      const fid = (s.config as HeroConfig | OfferConfig).formId;
      if (typeof fid === "string" && fid) formIds.add(fid);
    }
    if (formIds.size > 0 && appUrl) {
      const wfs = await db.collection("workflows").where("subAccountId", "==", subAccountId).get();
      for (const wf of wfs.docs) {
        const data = wf.data() as { trigger?: { formId?: string }; nodes?: Record<string, { type?: string; config?: { body?: string } }> };
        if (!data.trigger?.formId || !formIds.has(data.trigger.formId) || !data.nodes) continue;
        let changed = false;
        const nodes = { ...data.nodes };
        for (const [nid, node] of Object.entries(nodes)) {
          if (node?.type === "send_email" && node.config && typeof node.config.body === "string" && !node.config.body.includes(stored.url)) {
            nodes[nid] = {
              ...node,
              config: { ...node.config, body: `${node.config.body}\n\nDownload your copy here: ${absoluteUrl}` },
            };
            changed = true;
          }
        }
        if (changed) await wf.ref.update({ nodes });
      }
    }
  }

  return NextResponse.json({ assetId: stored.assetId, url: stored.url, kind: ALLOWED_ASSET_TYPES[file.type] });
}
