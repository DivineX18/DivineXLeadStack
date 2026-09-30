/**
 * Task assignment: the parts that run without a Firestore emulator.
 *
 * The AUTHORITATIVE cross-tenant guard is the `assigneeAllowed` rule in
 * firestore.rules, because tasks are written by the client. That is proved
 * separately in verify-task-assignment-rules.mts, which needs a JRE.
 * Nothing here should be read as covering it.
 */
import { matchesAssigneeFilter, type TaskAssigneeFilter } from "../src/types/tasks";
import { initialsOf } from "../src/hooks/use-assignable-members";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? `, ${detail}` : ""}`);
}

const ME = "uid_me";
const SARAH = "uid_sarah";
const t = (assigneeUserId?: string | null) => ({ assigneeUserId });
const legacy = {} as { assigneeUserId?: string | null }; // predates the field

console.log("══ the assignee filter ══");
{
  const f = (task: { assigneeUserId?: string | null }, filter: TaskAssigneeFilter) =>
    matchesAssigneeFilter(task, filter, ME);

  check("everyone shows an assigned task", f(t(SARAH), "everyone"));
  check("everyone shows an unassigned task", f(t(null), "everyone"));
  check("everyone shows a legacy task", f(legacy, "everyone"));

  check("mine shows my task", f(t(ME), "mine"));
  check("mine hides Sarah's", !f(t(SARAH), "mine"));
  check("mine hides unassigned", !f(t(null), "mine"));
  check("mine hides a legacy task", !f(legacy, "mine"));

  check("unassigned shows an unassigned task", f(t(null), "unassigned"));
  check("unassigned shows a LEGACY task", f(legacy, "unassigned"));
  check("unassigned hides an assigned task", !f(t(SARAH), "unassigned"));

  check("a specific member shows only theirs", f(t(SARAH), SARAH) && !f(t(ME), SARAH));
  check("a specific member hides unassigned", !f(t(null), SARAH));

  // A signed-out viewer must not inherit everyone's work.
  // The dangerous pair is a null viewer against a null assignee: a bare
  // equality check makes every UNASSIGNED task read as "mine" for someone
  // who is not signed in.
  check(
    "a signed-out viewer does not own the unassigned tasks",
    !matchesAssigneeFilter(t(null), "mine", null),
  );
  check(
    "...nor a legacy task with no assignee field",
    !matchesAssigneeFilter(legacy, "mine", null) && !matchesAssigneeFilter(legacy, "mine", undefined),
  );
  check(
    "...nor somebody else's task",
    !matchesAssigneeFilter(t(ME), "mine", null) && !matchesAssigneeFilter(t(null), "mine", undefined),
  );
  // An empty string is not a uid. It must behave as unassigned, and must
  // never be matched by a member filter.
  check(
    "an empty-string assignee counts as unassigned",
    matchesAssigneeFilter({ assigneeUserId: "" }, "unassigned", ME),
  );
  check(
    "an empty-string assignee is not 'mine'",
    !matchesAssigneeFilter({ assigneeUserId: "" }, "mine", ME),
  );
}

console.log("\n══ it combines with the existing views ══");
{
  // The axis is applied to whatever the view already produced, so the
  // combination is just composition. Proved on a realistic bucket.
  const todayBucket = [t(ME), t(SARAH), t(null), legacy];
  const mine = todayBucket.filter((x) => matchesAssigneeFilter(x, "mine", ME));
  const sarah = todayBucket.filter((x) => matchesAssigneeFilter(x, SARAH, ME));
  const unassigned = todayBucket.filter((x) => matchesAssigneeFilter(x, "unassigned", ME));
  const everyone = todayBucket.filter((x) => matchesAssigneeFilter(x, "everyone", ME));
  check("Today + My tasks", mine.length === 1);
  check("Today + Sarah", sarah.length === 1);
  check("Today + Unassigned includes the legacy task", unassigned.length === 2);
  check("Today + Everyone keeps all of them", everyone.length === 4);
  check("the axis partitions cleanly", mine.length + sarah.length + unassigned.length === everyone.length);
}

console.log("\n══ ownership display ══");
{
  check("two names give two initials", initialsOf("Jade Everett") === "JE");
  check("one name gives two letters", initialsOf("Sarah") === "SA");
  check("three names use first and last", initialsOf("Ana Maria Ruiz") === "AR");
  check("extra whitespace does not break it", initialsOf("  Jade   Everett  ") === "JE");
  check("an empty name does not throw", initialsOf("") === "?");
  // A task whose assignee has been removed keeps the uid on the document
  // so history stays truthful. The list resolves no name for it, and the
  // item must still render.
  check(
    "a task assigned to a removed member is still matched by that member's filter",
    matchesAssigneeFilter(t("uid_gone"), "uid_gone", ME),
  );
  check(
    "...and is not silently reclassified as unassigned",
    !matchesAssigneeFilter(t("uid_gone"), "unassigned", ME),
  );
}

console.log(`\n${failures === 0 ? "TASK ASSIGNMENT: ALL CHECKS PASSED" : `TASK ASSIGNMENT: ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
