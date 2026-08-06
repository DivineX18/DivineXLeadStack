/**
 * Ascend OS Phase 2, Slice 7 — pure Workspace-selection decision logic. No
 * Firebase import. Deliberately does not auto-pick between multiple
 * candidate workspaces (no "most recently active" fallback exists — the
 * Slice 7 audit confirmed no such signal exists anywhere in the schema,
 * same "never invent a selection signal" discipline as Slice 4's primary-
 * profile selection and Slice 6's tier resolution).
 */

import type { WorkspaceSelection, WorkspaceSelectionReason } from "@/types/identity";

export function decideWorkspaceSelection(
  explicitWorkspaceId: string | null,
  candidateWorkspaceIds: string[],
): WorkspaceSelection {
  if (explicitWorkspaceId) {
    return { workspaceId: explicitWorkspaceId, reason: "explicit", candidates: candidateWorkspaceIds };
  }
  if (candidateWorkspaceIds.length === 0) {
    return { workspaceId: null, reason: "none_available", candidates: [] };
  }
  if (candidateWorkspaceIds.length === 1) {
    const reason: WorkspaceSelectionReason = "sole_membership";
    return { workspaceId: candidateWorkspaceIds[0], reason, candidates: candidateWorkspaceIds };
  }
  return { workspaceId: null, reason: "multiple_available", candidates: candidateWorkspaceIds };
}
