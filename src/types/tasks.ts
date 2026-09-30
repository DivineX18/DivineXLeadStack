import type { Timestamp, FieldValue } from "firebase/firestore";

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueAt: Timestamp | FieldValue | null;
  completed: boolean;
  completedAt: Timestamp | FieldValue | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  /**
   * The one person responsible. Optional and absent on every task that
   * predates assignment, which reads as Unassigned without a migration.
   *
   * Always a uid with an ACTIVE membership of this task's sub-account,
   * validated server-side at write time. Agency membership alone never
   * qualifies: capacity is not authorization.
   *
   * A uid that later loses access is left in place rather than cleared, so
   * history stays truthful; the UI renders it as a former member.
   */
  assigneeUserId?: string | null;
  /**
   * Denormalized territory tag, inherited from the linked contact at
   * creation and kept in sync when the contact is re-tagged. `null` =
   * unscoped / standalone (admin-only triage when scoping is on).
   * Ignored unless the sub-account's `territoryScopingEnabled` is true.
   */
  territoryId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type TaskFormData = {
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  /** undefined = leave unchanged on edit. null = explicitly Unassigned. */
  assigneeUserId?: string | null;
};

/**
 * The assignee axis of the Tasks list. Combines with TaskFilter rather than
 * replacing it, so "Today + Sarah" and "Done + Unassigned" both work.
 *
 * "everyone" is the default and the widest. A bare uid narrows to that one
 * member.
 */
export type TaskAssigneeFilter = "everyone" | "mine" | "unassigned" | (string & {});

/**
 * Does this task belong in the current assignee view?
 *
 * Pure and exported so the list and its tests run the same predicate. A
 * task with no assignee field at all is Unassigned, which is what every
 * task predating assignment is.
 */
export function matchesAssigneeFilter(
  task: Pick<Task, "assigneeUserId">,
  filter: TaskAssigneeFilter,
  viewerUid: string | null | undefined,
): boolean {
  // An empty string is not a uid. Normalised here so a stray "" behaves as
  // Unassigned everywhere rather than as a member nobody can match.
  const raw = task.assigneeUserId;
  const assignee = typeof raw === "string" && raw.trim() !== "" ? raw : null;
  if (filter === "everyone") return true;
  if (filter === "unassigned") return assignee === null;
  // A signed-out viewer has no tasks of their own, rather than all of them.
  if (filter === "mine") return viewerUid != null && assignee === viewerUid;
  return assignee === filter;
}

export type TaskFilter = "today" | "overdue" | "upcoming" | "done" | "all";
