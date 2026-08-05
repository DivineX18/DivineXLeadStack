import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  FEATURE_FLAG_IDS,
  type FeatureFlagDoc,
  type FeatureFlagId,
  type FeatureFlagRolloutStage,
} from "@/types/feature-flags";

export async function listFeatureFlags(): Promise<FeatureFlagDoc[]> {
  const snap = await getAdminDb().collection("featureFlags").get();
  const byId = new Map(snap.docs.map((d) => [d.id, d.data() as FeatureFlagDoc]));
  // Every known flag ID always appears in the list, even if its doc hasn't
  // been created yet — surfaces "not yet configured" rather than silently
  // omitting a flag the admin UI should be showing a toggle for.
  return FEATURE_FLAG_IDS.map(
    (id) =>
      byId.get(id) ?? {
        id,
        name: id,
        description: "",
        rolloutStage: "off",
        allowedWorkspaceIds: [],
        allowedUids: [],
        createdAt: null,
        updatedAt: null,
        updatedByUid: "",
      },
  );
}

export async function setFeatureFlag(params: {
  id: FeatureFlagId;
  rolloutStage: FeatureFlagRolloutStage;
  allowedWorkspaceIds?: string[];
  allowedUids?: string[];
  description?: string;
  updatedByUid: string;
}): Promise<void> {
  const ref = getAdminDb().doc(`featureFlags/${params.id}`);
  const snap = await ref.get();
  await ref.set(
    {
      id: params.id,
      name: params.id,
      description: params.description ?? snap.data()?.description ?? "",
      rolloutStage: params.rolloutStage,
      allowedWorkspaceIds: params.allowedWorkspaceIds ?? snap.data()?.allowedWorkspaceIds ?? [],
      allowedUids: params.allowedUids ?? snap.data()?.allowedUids ?? [],
      createdAt: snap.exists ? snap.data()!.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: params.updatedByUid,
    },
    { merge: false },
  );
}
