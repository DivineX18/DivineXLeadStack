"use client";

import { useEffect, useState } from "react";

export interface AssignableMember {
  uid: string;
  name: string;
}

/**
 * The people a task in this workspace may be assigned to.
 *
 * Derived from ACTUAL active membership of this sub-account, never from the
 * plan's seat capacity: a Team plan allowing five users shows the three who
 * have actually joined, not five placeholders.
 *
 * Fetched from a route rather than read directly, because Firestore only
 * lets a collaborator read their own membership row. A client-side roster
 * read would work for admins and silently return a single entry for
 * everyone else.
 */
export function useAssignableMembers(subAccountId: string | null | undefined): {
  members: AssignableMember[];
  loading: boolean;
} {
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subAccountId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/assignable-members`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d: { members?: AssignableMember[] }) => {
        if (!cancelled) setMembers(Array.isArray(d.members) ? d.members : []);
      })
      // A failed load leaves the picker with Unassigned only. That is worse
      // than the full list and better than a broken dialog.
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  return { members, loading };
}

/** Initials for the avatar chip. "Jade Everett" -> "JE". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
