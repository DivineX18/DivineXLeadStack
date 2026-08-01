import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  addProjectDomain,
  getProjectDomainConfig,
  removeProjectDomain,
  VercelError,
} from "@/lib/vercel/client";
import { effectiveCustomDomainsCap } from "@/lib/domains/limits";
import { publishCallback } from "@/lib/automations/qstash";
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
 * Registers a domain against the Vercel project + writes the tracking doc.
 * Doc id = the lowercased domain, for O(1) middleware lookup. Re-checks the
 * per-sub-account cap (mirrors the website-slot cap enforcement) before
 * calling Vercel, so a capped tenant never burns an API call for nothing.
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

  let vercelResult;
  try {
    vercelResult = await addProjectDomain(domain);
  } catch (err) {
    const msg =
      err instanceof VercelError
        ? err.message
        : "Couldn't register the domain with Vercel.";
    return { ok: false, error: msg };
  }

  const doc: Omit<CustomDomainDoc, "domain"> = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    funnelId: opts.funnelId,
    status: "pending",
    misconfigured: true,
    verificationRecords: (vercelResult.verification ?? []).map((v) => ({
      type: v.type,
      name: v.domain,
      value: v.value,
    })),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.doc(`customDomains/${domain}`).set({ domain, ...doc });

  // Kick off the background verify chain immediately (20s first tick) so the
  // Domains tab doesn't sit at "pending" until the next scheduled check.
  void publishCallback({
    pathname: "/api/domains/poll",
    body: { domain, attempts: 0 },
    delaySeconds: 20,
    deduplicationId: `domain_${domain}_0`,
  });

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
    await removeProjectDomain(domain);
  } catch {
    // Best-effort — the domain may already be gone on Vercel's side.
    // Still remove our tracking doc so the sub-account isn't stuck holding
    // a slot for a domain Vercel no longer recognizes either way.
  }
  await ref.delete();
  return true;
}

/** Re-checks a domain's DNS status against Vercel and updates the doc. */
export async function recheckCustomDomain(
  domain: string,
): Promise<CustomDomainDoc | null> {
  const ref = getAdminDb().doc(`customDomains/${domain}`);
  const snap = await ref.get();
  if (!snap.exists) return null;

  let config;
  try {
    config = await getProjectDomainConfig(domain);
  } catch {
    return snap.data() as CustomDomainDoc;
  }

  const status: CustomDomainDoc["status"] = config.misconfigured
    ? "pending"
    : "verified";
  await ref.update({
    status,
    misconfigured: config.misconfigured,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ...(snap.data() as CustomDomainDoc), status, misconfigured: config.misconfigured };
}
