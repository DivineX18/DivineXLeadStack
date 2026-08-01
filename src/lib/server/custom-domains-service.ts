import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  addServiceCustomDomain,
  getServiceCustomDomain,
  getServiceOnrenderHostname,
  removeServiceCustomDomain,
  RenderError,
} from "@/lib/render/client";
import { effectiveCustomDomainsCap } from "@/lib/domains/limits";
import type { CustomDomainDoc } from "@/types/custom-domains";

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export async function listCustomDomains(
  subAccountId: string,
): Promise<CustomDomainDoc[]> {
  const snap = await getAdminDb()
    .collection("customDomains")
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs.map((d) => d.data() as CustomDomainDoc);
}

export type AddDomainResult =
  | { ok: true; domain: CustomDomainDoc }
  | { ok: false; error: string };

/**
 * Registers a domain against the Render service + writes the tracking doc.
 * Doc id = the lowercased domain, for O(1) middleware lookup. v1 only
 * supports subdomains (e.g. leads.client.com), not apex/root domains —
 * apex DNS setup on Render needs a different record type this feature
 * doesn't attempt to walk an operator through yet. Re-checks the
 * per-sub-account cap before calling Render, so a capped tenant never
 * burns an API call for nothing.
 */
export async function addCustomDomain(opts: {
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  domain: string;
  subAccountData: { maxCustomDomains?: number | null } | null;
}): Promise<AddDomainResult> {
  const domain = opts.domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, error: "That doesn't look like a valid domain." };
  }
  if (domain.split(".").length < 3) {
    return {
      ok: false,
      error:
        "Use a subdomain (e.g. leads.yourbrand.com), not a root domain — root domains need a different DNS setup this feature doesn't support yet.",
    };
  }

  const db = getAdminDb();
  const existingDoc = await db.doc(`customDomains/${domain}`).get();
  if (existingDoc.exists) {
    return { ok: false, error: "That domain is already registered." };
  }

  const cap = effectiveCustomDomainsCap(opts.subAccountData);
  const current = await listCustomDomains(opts.subAccountId);
  if (current.length >= cap) {
    return {
      ok: false,
      error: `This workspace is capped at ${cap} custom domain${cap === 1 ? "" : "s"}. Ask your agency owner to raise it.`,
    };
  }

  try {
    await addServiceCustomDomain(domain);
  } catch (err) {
    const msg =
      err instanceof RenderError
        ? err.message
        : "Couldn't register the domain with Render.";
    return { ok: false, error: msg };
  }

  const cnameTarget = await getServiceOnrenderHostname();
  const doc: Omit<CustomDomainDoc, "domain"> = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    funnelId: opts.funnelId,
    status: "pending",
    misconfigured: true,
    verificationRecords: cnameTarget
      ? [{ type: "CNAME", name: domain, value: cnameTarget }]
      : [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.doc(`customDomains/${domain}`).set({ domain, ...doc });

  return {
    ok: true,
    domain: { domain, ...doc },
  };
}

export async function removeCustomDomain(
  subAccountId: string,
  domain: string,
): Promise<boolean> {
  const ref = getAdminDb().doc(`customDomains/${domain}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return false;
  try {
    await removeServiceCustomDomain(domain);
  } catch {
    // Best-effort — the domain may already be gone on Render's side.
    // Still remove our tracking doc so the sub-account isn't stuck holding
    // a slot for a domain Render no longer recognizes either way.
  }
  await ref.delete();
  return true;
}

/** Re-checks a domain's verification status against Render and updates the doc. */
export async function recheckCustomDomain(
  domain: string,
): Promise<CustomDomainDoc | null> {
  const ref = getAdminDb().doc(`customDomains/${domain}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  let result;
  try {
    result = await getServiceCustomDomain(domain);
  } catch {
    return snap.data() as CustomDomainDoc;
  }
  if (!result) return snap.data() as CustomDomainDoc;

  const status: CustomDomainDoc["status"] =
    result.verificationStatus === "verified" ? "verified" : "pending";
  await ref.update({
    status,
    misconfigured: status !== "verified",
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ...(snap.data() as CustomDomainDoc), status, misconfigured: status !== "verified" };
}
