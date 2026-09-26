import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { effectiveWebsiteCap, consumesWebsiteSlot, countConsumedWebsiteSlots, DRAFT_HEADROOM } from "@/lib/website/limits";
import { resolvePlanLimits } from "@/lib/billing/plan-limits";
import {
  validateWebsiteConfig,
  type ValidationErrors,
} from "@/lib/website/validation";
import { isNicheKey } from "@/lib/website/niches";
import {
  GitpageError,
  gitpageIsConfigured,
  submitBuild,
} from "@/lib/gitpage/client";
import {
  markGitpageBuildSucceeded,
  markGitpageKeyInvalid,
} from "@/lib/gitpage/heartbeat";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import {
  blankWebsiteConfig,
  type WebsiteConfig,
  type WebsiteDoc,
} from "@/types/website";

/**
 * Server-side website create + build — the single write path shared by the
 * website API routes (`POST /api/sub-accounts/[id]/website` and
 * `.../website/[siteId]/build`) and the AI Suite `create_website`
 * capability. Extracted (same pattern as sub-accounts-service) so both
 * callers hit identical guards: the `websiteEnabledByAgency` agency gate,
 * the per-sub-account site cap, gitpage configuration, config
 * normalization + validation, and the QStash poll scheduling.
 *
 * Auth stays with the callers — this module trusts its inputs.
 */

/**
 * Typed failure the routes map back to their existing JSON shapes and the
 * AI capability surfaces as a friendly chat message. `fieldErrors` is set
 * for validation failures; `gitpageStatus`/`gitpageBody` for gitpage 4xx.
 */
export class WebsiteServiceError extends Error {
  readonly status: number;
  readonly fieldErrors?: ValidationErrors;
  readonly gitpageStatus?: number;
  readonly gitpageBody?: unknown;
  constructor(
    message: string,
    status: number,
    extra?: { fieldErrors?: ValidationErrors; gitpageStatus?: number; gitpageBody?: unknown },
  ) {
    super(message);
    this.name = "WebsiteServiceError";
    this.status = status;
    this.fieldErrors = extra?.fieldErrors;
    this.gitpageStatus = extra?.gitpageStatus;
    this.gitpageBody = extra?.gitpageBody;
  }
}

const GATE_OFF_MESSAGE =
  "The website builder is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.";

/** Load the sub-account doc + enforce the agency website gate. */
async function requireWebsiteEnabledSub(subAccountId: string): Promise<{
  agencyId: string;
  name: string | undefined;
  data: Record<string, unknown>;
  maxSites: number;
}> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    throw new WebsiteServiceError("Sub-account not found", 404);
  }
  const data = snap.data() as Record<string, unknown>;
  if (data.websiteEnabledByAgency !== true) {
    throw new WebsiteServiceError(GATE_OFF_MESSAGE, 403);
  }
  const agencyId = data.agencyId as string | undefined;
  if (!agencyId) {
    throw new WebsiteServiceError("Sub-account is missing agencyId.", 500);
  }
  // The plan's website ceiling, with the per-workspace override still winning.
  // Order matters: an owner who granted one client extra sites did so
  // deliberately, and a plan default must not silently revoke that grant.
  // Resolved from THIS workspace's own plan; `data` is already loaded above.
  const planLimits = await resolvePlanLimits(subAccountId, data);
  return {
    agencyId,
    name: data.name as string | undefined,
    data,
    maxSites: effectiveWebsiteCap(data, planLimits.maxWebsites),
  };
}

/**
 * Create a new (blank, draft) website doc, enforcing the gate + the
 * per-sub-account cap. Returns the new site id.
 */
export async function createWebsiteForSubAccount(input: {
  subAccountId: string;
  /** Optional operator-facing card label; defaults to "Website N". */
  name?: string;
}): Promise<{ siteId: string; agencyId: string }> {
  const { subAccountId } = input;
  const { agencyId, maxSites } = await requireWebsiteEnabledSub(subAccountId);

  const db = getAdminDb();
  const col = db.collection(`subAccounts/${subAccountId}/website`);
  const existing = await col.get();
  // THE CAP METERS PUBLISHED SITES, NOT DOCUMENTS. A blank draft and a build
  // that failed inside gitpage delivered the customer nothing, so neither
  // spends a slot. See consumesWebsiteSlot().
  const sites = existing.docs.map((d) => d.data() as { status?: string; liveUrl?: string | null });
  const consumed = countConsumedWebsiteSlots(sites);
  if (consumed >= maxSites) {
    throw new WebsiteServiceError(
      Number.isFinite(maxSites)
        ? `You have ${consumed} of ${maxSites} websites published. Remove one to add another.`
        : "Unexpected site cap reached.",
      409,
    );
  }
  // Drafts are free but not unlimited — see DRAFT_HEADROOM.
  const draftCeiling = Number.isFinite(maxSites) ? maxSites + DRAFT_HEADROOM : Infinity;
  if (existing.size >= draftCeiling) {
    throw new WebsiteServiceError(
      `You have ${existing.size} unfinished website drafts. Delete one before starting another.`,
      409,
    );
  }

  const ref = col.doc();
  const now = FieldValue.serverTimestamp();
  const docData: Omit<WebsiteDoc, "createdAt" | "updatedAt" | "lastBuildAt"> & {
    createdAt: FieldValue;
    updatedAt: FieldValue;
    lastBuildAt: null;
  } = {
    id: ref.id,
    agencyId,
    subAccountId,
    name: input.name?.trim() || `Website ${existing.size + 1}`,
    status: "draft",
    gitpageJobId: null,
    liveUrl: null,
    errorMessage: null,
    partialErrors: null,
    contentFlags: null,
    pollAttempts: 0,
    lastBuildAt: null,
    lastBuildByUid: null,
    config: blankWebsiteConfig(),
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(docData);

  return { siteId: ref.id, agencyId };
}

/**
 * Normalize an untrusted WebsiteConfig in place, exactly as the build route
 * always has: hard-code system fields, default build_type, validate niche,
 * force/clean page selections per build type + niche.
 */
export function normalizeWebsiteConfig(config: WebsiteConfig): void {
  config.site_type = "LocalSite";
  config.astra_theme = false;

  if (config.build_type !== "vsl") {
    config.build_type = "local";
  }

  if (config.niche != null && !isNicheKey(config.niche)) {
    throw new WebsiteServiceError(
      "niche must be one of: home_services, real_estate, gym_fitness. Omit for a generic build.",
      400,
    );
  }
  config.niche = isNicheKey(config.niche) ? config.niche : null;

  if (config.build_type === "local") {
    if (!config.local_page_selections) {
      throw new WebsiteServiceError("local_page_selections is required.", 400);
    }
    config.local_page_selections.index = true;

    if (config.niche) {
      // Niche locks the page set to all five pages. Force the selections so
      // the persisted doc reflects what gitpage actually built.
      config.local_page_selections = {
        index: true,
        services: true,
        contact: true,
        privacy: true,
        terms: true,
      };
    } else {
      // Generic local: drop conditional sections that don't apply.
      if (!config.local_page_selections.services) {
        config.services_config = null;
      }
      if (!config.local_page_selections.contact) {
        config.business_details = null;
      }
    }
  } else {
    // VSL is single-page — force a clean shape so Firestore doesn't hold
    // stale data from a previous local-mode draft.
    config.local_page_selections = {
      index: true,
      services: false,
      contact: false,
      privacy: false,
      terms: false,
    };
    config.services_config = null;
    config.business_details = null;
  }
}

/**
 * Validate, submit to gitpage, persist the queued state, and schedule the
 * QStash poll for one site. Mutates `config` via normalization first.
 */
export async function submitWebsiteBuildForSubAccount(input: {
  subAccountId: string;
  siteId: string;
  config: WebsiteConfig;
  buildByUid: string;
}): Promise<{ formResponseId: string; estimatedDurationSeconds?: number }> {
  const { subAccountId, siteId, config } = input;
  const { agencyId, name: subAccountName } =
    await requireWebsiteEnabledSub(subAccountId);

  if (!gitpageIsConfigured()) {
    throw new WebsiteServiceError(
      "gitpage is not configured on this deployment (GITPAGE_API_KEY missing).",
      503,
    );
  }

  // ENFORCED HERE BECAUSE THIS IS WHERE A SITE BECOMES REAL.
  //
  // Creation is now capped on PUBLISHED sites, so the cap has to be checked
  // again at the moment a draft is about to become one — otherwise a
  // workspace could sit under the limit while drafting and quietly publish
  // past it. A rebuild of a site that ALREADY consumes its slot is always
  // allowed: it is the same website, not an additional one.
  {
    const col = getAdminDb().collection(`subAccounts/${subAccountId}/website`);
    const all = await col.get();
    const thisSite = all.docs.find((d) => d.id === siteId)?.data() as
      | { status?: string; liveUrl?: string | null }
      | undefined;
    if (!consumesWebsiteSlot(thisSite)) {
      const { maxSites } = await requireWebsiteEnabledSub(subAccountId);
      const consumed = countConsumedWebsiteSlots(
        all.docs.map((d) => d.data() as { status?: string; liveUrl?: string | null }),
      );
      if (consumed >= maxSites) {
        throw new WebsiteServiceError(
          `You already have ${consumed} of ${maxSites} websites published. Remove one before publishing another.`,
          409,
        );
      }
    }
  }

  normalizeWebsiteConfig(config);

  const errors = validateWebsiteConfig(config);
  if (Object.keys(errors).length > 0) {
    throw new WebsiteServiceError("Validation failed.", 400, {
      fieldErrors: errors,
    });
  }

  // Submit to gitpage. On 4xx surface their error verbatim; on 5xx /
  // network failure tell the caller we couldn't reach gitpage.
  let submission;
  try {
    submission = await submitBuild({
      config,
      subAccountId,
      subAccountName,
    });
  } catch (err) {
    if (err instanceof GitpageError) {
      // 401 means the API key is invalid (rotated upstream, never set,
      // typo'd). Flip the cached status so the UI surfaces the correct CTA.
      if (err.status === 401) {
        await markGitpageKeyInvalid();
      }
      throw new WebsiteServiceError(err.message, err.status, {
        gitpageStatus: err.status,
        gitpageBody: err.body,
      });
    }
    throw new WebsiteServiceError(
      err instanceof Error ? err.message : "Could not reach gitpage.",
      502,
    );
  }

  // The build was accepted (202) — stronger activation evidence than the
  // heartbeat; clear any stale `agency: false` cache.
  await markGitpageBuildSucceeded();

  const db = getAdminDb();
  const docRef = db.doc(`subAccounts/${subAccountId}/website/${siteId}`);
  const snap = await docRef.get();
  const isFirst = !snap.exists;

  const update: Partial<WebsiteDoc> & {
    config: WebsiteConfig;
    updatedAt: FieldValue;
  } = {
    config,
    status: "queued",
    gitpageJobId: submission.formResponseId,
    liveUrl: null,
    errorMessage: null,
    partialErrors: null,
    contentFlags: null,
    pollAttempts: 0,
    lastBuildAt: FieldValue.serverTimestamp() as unknown as null,
    lastBuildByUid: input.buildByUid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isFirst) {
    // The doc is normally created up-front, but a direct build on a
    // never-created id (e.g. the legacy `main`) still stamps tenancy.
    Object.assign(update, {
      id: siteId,
      agencyId,
      subAccountId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await docRef.set(update, { merge: true });

  // Schedule the first QStash poll. Without QStash the build doc just sits
  // at "queued" — verifiable in gitpage's dashboard; don't fail the request.
  if (qstashIsConfigured()) {
    await publishCallback({
      pathname: `/api/sub-accounts/${subAccountId}/website/${siteId}/poll`,
      body: {
        subAccountId,
        siteId,
        formResponseId: submission.formResponseId,
      },
      delaySeconds: 20,
      deduplicationId: `website_${subAccountId}_${siteId}_${submission.formResponseId}_0`,
    });
  } else {
    console.warn(
      "[website/build] QStash not configured. Status will sit at queued",
    );
  }

  return {
    formResponseId: submission.formResponseId,
    estimatedDurationSeconds: submission.estimatedDurationSeconds,
  };
}

/** The copy fields an assistant may change on a website. */
export interface WebsiteCopyPatch {
  name?: string;
  heading?: string;
  hero_statement?: string;
  features?: string;
  benefits?: string;
  services_list?: string;
}

export type WebsitePatchResult =
  | { ok: true; siteId: string; name: string; changed: string[]; wasPublished: boolean }
  | { ok: false; reason: "missing" | "building" };

/**
 * PATCH A WEBSITE'S COPY. It does not build, and it never replaces the config.
 *
 * Three things about this architecture decide the shape:
 *
 *  1. `config` on the doc is the LAST-BUILT config. There is no separate
 *     draft store: the builder holds edits in component state and persists
 *     them only when the operator presses Build. So an edit here lands in
 *     exactly the place the form hydrates from, and the operator sees it
 *     next time they open the builder, which is the same position they are
 *     in after typing a change themselves.
 *  2. Building is a SEPARATE, explicit act in the UI, so it is separate
 *     here. A model edit must not silently republish a live site.
 *  3. The stored config is read and merged key by key. A partial payload
 *     can never erase a section the request said nothing about, which is
 *     the whole risk with a generated document.
 *
 * Deliberately NOT patchable: the address, phone, email and opening hours.
 * Those are operator-supplied facts about a real place, read from the
 * workspace by verifiedBusinessFacts(), and a generator may never write
 * them. See lib/ai-suite/capabilities.ts.
 */
export async function patchWebsiteCopyServerSide(input: {
  subAccountId: string;
  siteId: string;
  patch: WebsiteCopyPatch;
}): Promise<WebsitePatchResult> {
  const db = getAdminDb();
  // The document path is itself the tenancy boundary: a site id from
  // another workspace resolves to a path that does not exist here, so a
  // foreign id behaves exactly like a missing one.
  const ref = db.doc(`subAccounts/${input.subAccountId}/website/${input.siteId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "missing" };

  const doc = snap.data() as { status?: string; liveUrl?: string | null; name?: string; config?: WebsiteConfig };
  // A queued or building site has a job in flight at gitpage. Changing the
  // config underneath it would mean the stored config no longer describes
  // the site that is about to appear.
  if (doc.status === "queued" || doc.status === "building") {
    return { ok: false, reason: "building" };
  }

  const current = (doc.config ?? blankWebsiteConfig()) as WebsiteConfig;
  const next: WebsiteConfig = { ...current };
  const changed: string[] = [];
  const COPY_KEYS = ["heading", "hero_statement", "features", "benefits", "services_list"] as const;
  for (const key of COPY_KEYS) {
    const v = input.patch[key];
    if (typeof v === "string" && v.trim()) {
      (next as unknown as Record<string, unknown>)[key] = v.trim();
      changed.push(key);
    }
  }

  const update: Record<string, unknown> = { config: next, updatedAt: FieldValue.serverTimestamp() };
  if (typeof input.patch.name === "string" && input.patch.name.trim()) {
    update.name = input.patch.name.trim().slice(0, 80);
    changed.push("name");
  }
  if (changed.length === 0) return { ok: false, reason: "missing" };

  // status, liveUrl and gitpageJobId are deliberately absent: an edit does
  // not change what is currently published, and does not consume a slot.
  await ref.set(update, { merge: true });

  return {
    ok: true,
    siteId: input.siteId,
    name: String(update.name ?? doc.name ?? next.heading ?? "Untitled site"),
    changed,
    wasPublished: doc.status === "ready" && !!doc.liveUrl,
  };
}

/** The stored config for a site, for an explicit rebuild that must not
 *  invent one. Null when the site does not exist in this workspace. */
export async function getWebsiteForSubAccount(
  subAccountId: string,
  siteId: string,
): Promise<{ id: string; name: string; status: string; liveUrl: string | null; config: WebsiteConfig } | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/website/${siteId}`).get();
  if (!snap.exists) return null;
  const d = snap.data() as { name?: string; status?: string; liveUrl?: string | null; config?: WebsiteConfig };
  return {
    id: siteId,
    name: d.name ?? d.config?.heading ?? "Untitled site",
    status: d.status ?? "draft",
    liveUrl: d.liveUrl ?? null,
    config: (d.config ?? blankWebsiteConfig()) as WebsiteConfig,
  };
}
