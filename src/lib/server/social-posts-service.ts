import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { publishSocialPost } from "@/lib/automations/qstash";
import { qstashIsConfigured } from "@/lib/automations/qstash";
import type { MetaConfig, SubAccountDoc } from "@/types/tenancy";
import type { SocialPlatform, SocialPostDoc, SocialPostTargetResult } from "@/types/social";

/**
 * THE SOCIAL LIFECYCLE, REACHABLE FROM SOMEWHERE OTHER THAN A BROWSER.
 *
 * The composer's route already owns every rule that matters: Instagram
 * needs an image, scheduling needs a publish-capable connection, a
 * scheduled time must be in the future, QStash carries the job. All of it
 * lived inside the POST handler, so the only way to reach it was a form
 * submission. Zeno needs the same rules, and the wrong way to get them is
 * a second copy that drifts the first time one of them changes.
 *
 * So the rules moved here and the route calls them. Zeno calls them too.
 * The publish worker is untouched: it already claims a post atomically
 * (scheduled -> publishing) and it remains the only thing that talks to
 * the Graph API on a schedule.
 *
 * WHAT IS DELIBERATELY NOT HERE: a second scheduler. Flow schedules through
 * QStash, and a post's schedule is a QStash message whose id is stored on
 * the post. Nothing in this file invents timing.
 */

export const PLATFORMS: SocialPlatform[] = ["facebook", "instagram"];

export type SocialFailure =
  | { reason: "gate_off" }
  | { reason: "missing" }
  | { reason: "not_connected" }
  | { reason: "no_instagram" }
  | { reason: "no_qstash" }
  | { reason: "invalid"; detail: string }
  | { reason: "already_gone"; detail: string };

/** A connection that is actually able to post, proven from storage. */
export async function resolvePublishTarget(subAccountId: string): Promise<
  | { ok: true; pageId: string; pageName: string; instagramBusinessAccountId: string | null; instagramUsername: string | null }
  | { ok: false; reason: "gate_off" | "not_connected" }
> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = snap.data() as SubAccountDoc | undefined;
  if (sub?.socialPlannerEnabledByAgency !== true) return { ok: false, reason: "gate_off" };
  const meta = sub.metaConfig as MetaConfig | null | undefined;
  // metaCanPublish is the single readiness check the composer, the create
  // route and the publish callback all use, so a connection made for the
  // inbox alone never looks post-ready here either.
  if (!metaCanPublish(meta) || !meta?.pageId) return { ok: false, reason: "not_connected" };
  return {
    ok: true,
    pageId: meta.pageId,
    pageName: String(meta.pageName ?? "the connected Page"),
    instagramBusinessAccountId: meta.instagramBusinessAccountId ?? null,
    instagramUsername: meta.instagramUsername ?? null,
  };
}

/** The shared contract a post must satisfy before it may leave. */
export function validateForPublish(input: {
  caption: string;
  imageUrl: string | null;
  targets: SocialPlatform[];
  target: Awaited<ReturnType<typeof resolvePublishTarget>>;
}): { ok: true } | { ok: false } & SocialFailure {
  if (!input.caption && !input.imageUrl) {
    return { ok: false, reason: "invalid", detail: "Add a caption or an image before publishing." };
  }
  if (input.targets.length === 0) {
    return { ok: false, reason: "invalid", detail: "Pick at least one platform." };
  }
  if (input.targets.includes("instagram") && !input.imageUrl) {
    // Instagram's publishing API is URL-based and will not accept a
    // caption alone, so this is the provider's rule, not a preference.
    return { ok: false, reason: "invalid", detail: "Instagram needs an image." };
  }
  if (!input.target.ok) return { ok: false, reason: input.target.reason === "gate_off" ? "gate_off" : "not_connected" };
  if (input.targets.includes("instagram") && !input.target.instagramBusinessAccountId) {
    return { ok: false, reason: "no_instagram" };
  }
  return { ok: true };
}

export async function createSocialDraftServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  caption: string;
  imageUrl?: string | null;
  targets?: SocialPlatform[];
}): Promise<{ ok: true; id: string } | ({ ok: false } & SocialFailure)> {
  const snap = await getAdminDb().doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = snap.data() as SubAccountDoc | undefined;
  if (!sub) return { ok: false, reason: "missing" };
  if (sub.socialPlannerEnabledByAgency !== true) return { ok: false, reason: "gate_off" };

  const caption = opts.caption.trim().slice(0, 5000);
  const imageUrl = opts.imageUrl?.trim() ? opts.imageUrl.trim().slice(0, 2000) : null;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return { ok: false, reason: "invalid", detail: "An image has to be a public https link." };
  }
  if (!caption && !imageUrl) return { ok: false, reason: "invalid", detail: "A post needs a caption or an image." };

  const db = getAdminDb();
  const ref = db.collection("socialPosts").doc();
  const targets = (opts.targets ?? []).filter((t) => PLATFORMS.includes(t));
  const now = FieldValue.serverTimestamp();
  // A draft is inert: no schedule, no QStash message, nothing queued.
  await ref.set({
    agencyId: String(sub.agencyId ?? ""),
    subAccountId: opts.subAccountId,
    createdByUid: opts.createdByUid,
    caption,
    imageUrl,
    targets,
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    results: [],
    qstashMessageId: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as Omit<SocialPostDoc, "id">);
  return { ok: true, id: ref.id };
}

export interface SocialDraftView {
  id: string;
  caption: string;
  imageUrl: string | null;
  targets: SocialPlatform[];
  status: SocialPostDoc["status"];
  scheduledAt: string | null;
  results: SocialPostTargetResult[];
}

/**
 * This workspace's posts, newest first.
 *
 * The rule W4 established the hard way: an id a capability returns is
 * invisible to the next human turn, so anything a person may refer to
 * later needs a way to be found again. "Make the second one shorter" is
 * exactly that, and it is why this exists before the editing does.
 */
export async function listSocialPostsServerSide(subAccountId: string): Promise<SocialDraftView[]> {
  const snap = await getAdminDb()
    .collection("socialPosts")
    .where("subAccountId", "==", subAccountId)
    .limit(100)
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        caption: String(x.caption ?? ""),
        imageUrl: (x.imageUrl as string) ?? null,
        targets: (x.targets ?? []) as SocialPlatform[],
        status: x.status as SocialPostDoc["status"],
        scheduledAt: x.scheduledAt?.toDate?.()?.toISOString?.() ?? null,
        results: (x.results ?? []) as SocialPostTargetResult[],
        created: x.createdAt?.toDate?.()?.getTime?.() ?? 0,
      };
    })
    .sort((a, b) => b.created - a.created)
    .map(({ created: _created, ...r }) => r);
}

/** Path-independent read that still proves the workspace owns it. */
export async function getSocialPostServerSide(
  subAccountId: string,
  postId: string,
): Promise<(SocialDraftView & { subAccountId: string }) | null> {
  const snap = await getAdminDb().doc(`socialPosts/${postId}`).get();
  if (!snap.exists) return null;
  const x = snap.data()!;
  // A post from another workspace reads exactly as one that is not there.
  if (x.subAccountId !== subAccountId) return null;
  return {
    id: snap.id,
    subAccountId,
    caption: String(x.caption ?? ""),
    imageUrl: (x.imageUrl as string) ?? null,
    targets: (x.targets ?? []) as SocialPlatform[],
    status: x.status as SocialPostDoc["status"],
    scheduledAt: x.scheduledAt?.toDate?.()?.toISOString?.() ?? null,
    results: (x.results ?? []) as SocialPostTargetResult[],
  };
}

/**
 * Change ONE draft, field by field. A post that has left, or is leaving,
 * is not editable: the copy on the platform would no longer match, and
 * nothing here can edit what a provider already published.
 */
export async function patchSocialPostServerSide(opts: {
  subAccountId: string;
  postId: string;
  caption?: string;
  imageUrl?: string | null;
  targets?: SocialPlatform[];
}): Promise<
  | { ok: true; id: string; changed: string[]; caption: string }
  | ({ ok: false } & SocialFailure)
> {
  const current = await getSocialPostServerSide(opts.subAccountId, opts.postId);
  if (!current) return { ok: false, reason: "missing" };
  if (current.status === "publishing" || current.status === "published") {
    return {
      ok: false,
      reason: "already_gone",
      detail: current.status === "published"
        ? "That post has already gone out, so its wording can't be changed here."
        : "That post is being published right now, so it can't be changed.",
    };
  }

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const changed: string[] = [];
  if (opts.caption !== undefined) {
    const caption = opts.caption.trim().slice(0, 5000);
    if (!caption && !(opts.imageUrl ?? current.imageUrl)) {
      return { ok: false, reason: "invalid", detail: "A post needs a caption or an image." };
    }
    patch.caption = caption;
    changed.push("caption");
  }
  if (opts.imageUrl !== undefined) {
    if (opts.imageUrl && !/^https:\/\//i.test(opts.imageUrl)) {
      return { ok: false, reason: "invalid", detail: "An image has to be a public https link." };
    }
    patch.imageUrl = opts.imageUrl ? opts.imageUrl.trim().slice(0, 2000) : null;
    changed.push("image");
  }
  if (opts.targets !== undefined) {
    const targets = opts.targets.filter((t) => PLATFORMS.includes(t));
    if (targets.includes("instagram") && !(opts.imageUrl ?? current.imageUrl)) {
      return { ok: false, reason: "invalid", detail: "Instagram needs an image." };
    }
    patch.targets = targets;
    changed.push("platforms");
  }
  if (changed.length === 0) return { ok: false, reason: "invalid", detail: "Nothing to change." };

  await getAdminDb().doc(`socialPosts/${opts.postId}`).update(patch);
  return { ok: true, id: opts.postId, changed, caption: String(patch.caption ?? current.caption) };
}

/**
 * Hand a draft to the existing scheduler. This does NOT publish: QStash
 * holds the job and the publish callback is the only thing that talks to
 * the Graph API, exactly as the composer's route already arranged.
 */
export async function scheduleSocialPostServerSide(opts: {
  subAccountId: string;
  postId: string;
  when: Date;
  targets?: SocialPlatform[];
}): Promise<
  | { ok: true; id: string; scheduledAt: string; targets: SocialPlatform[]; pageName: string }
  | ({ ok: false } & SocialFailure)
> {
  const current = await getSocialPostServerSide(opts.subAccountId, opts.postId);
  if (!current) return { ok: false, reason: "missing" };
  if (current.status !== "draft" && current.status !== "failed") {
    return {
      ok: false,
      reason: "already_gone",
      detail:
        current.status === "scheduled"
          ? "That post is already scheduled."
          : "That post has already gone out.",
    };
  }
  const targets = (opts.targets ?? current.targets).filter((t) => PLATFORMS.includes(t));
  const target = await resolvePublishTarget(opts.subAccountId);
  const valid = validateForPublish({ caption: current.caption, imageUrl: current.imageUrl, targets, target });
  if (!valid.ok) return valid;
  if (!qstashIsConfigured()) return { ok: false, reason: "no_qstash" };

  const nowMs = Date.now();
  if (Number.isNaN(opts.when.getTime())) return { ok: false, reason: "invalid", detail: "That isn't a valid date and time." };
  if (opts.when.getTime() < nowMs - 60_000) {
    return { ok: false, reason: "invalid", detail: "That time has already passed." };
  }
  const delaySeconds = Math.max(0, Math.floor((opts.when.getTime() - nowMs) / 1000));

  // The existing scheduler, with the existing dedup id. Nothing new times
  // anything.
  const scheduled = await publishSocialPost({ postId: opts.postId, subAccountId: opts.subAccountId, delaySeconds });
  if (!scheduled) return { ok: false, reason: "invalid", detail: "The scheduler wouldn't accept it. Try again." };

  await getAdminDb().doc(`socialPosts/${opts.postId}`).update({
    status: "scheduled",
    scheduledAt: opts.when,
    targets,
    results: targets.map((platform) => ({ platform, status: "pending", externalId: null, error: null })),
    qstashMessageId: scheduled.messageId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    id: opts.postId,
    scheduledAt: opts.when.toISOString(),
    targets,
    pageName: target.ok ? target.pageName : "the connected Page",
  };
}
