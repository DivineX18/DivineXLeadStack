/**
 * EXECUTABLE PROOF FOR THE TASK-ASSIGNEE RULE.
 *
 * Tasks are written by the CLIENT, so `firestore.rules` is the authoritative
 * check on who a task may be assigned to, not the picker that builds the
 * dropdown. A picker only offers authorized members; it cannot stop a
 * crafted write. This runs the REAL rules file in the emulator and makes
 * actual client-SDK writes.
 *
 * The property under test: plan capacity is not workspace authorization. A
 * user who belongs to the agency, or to a DIFFERENT client workspace, must
 * never be assignable inside this one.
 *
 * PREREQUISITE: a Java runtime for the emulator.
 *
 *   JAVA_HOME=<jre> npx firebase emulators:exec --only firestore \
 *     "NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify-task-assignment-rules.mts"
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc } from "firebase/firestore";

let failures = 0;
const check = async (label: string, run: () => Promise<unknown>) => {
  try {
    await run();
    console.log(`PASS ${label}`);
  } catch (err) {
    console.log(`FAIL ${label} — ${err instanceof Error ? err.message : String(err)}`);
    failures++;
  }
};

const AGENCY = "ag1";
const SA_A = "saA";       // the workspace under test
const SA_B = "saB";       // a different client in the same agency
const ALICE = "uidAlice"; // active member of A
const BOB = "uidBob";     // active member of A
const CARLA = "uidCarla"; // member of B ONLY
const DREW = "uidDrew";   // removed member of A
const ORPHAN = "uidOrphan"; // no membership anywhere

const env: RulesTestEnvironment = await initializeTestEnvironment({
  projectId: "divinex-task-assignee-test",
  firestore: {
    rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});

const alice = env.authenticatedContext(ALICE, {
  status: "active", agencyId: AGENCY, agencyRole: "member",
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const sa of [SA_A, SA_B]) {
    await setDoc(doc(db, `subAccounts/${sa}`), { id: sa, agencyId: AGENCY, name: sa });
  }
  await setDoc(doc(db, `subAccounts/${SA_A}/subAccountMembers/${ALICE}`), { status: "active", role: "admin", uid: ALICE });
  await setDoc(doc(db, `subAccounts/${SA_A}/subAccountMembers/${BOB}`), { status: "active", role: "collaborator", uid: BOB });
  // Removed, not deleted: the row exists but must not be assignable.
  await setDoc(doc(db, `subAccounts/${SA_A}/subAccountMembers/${DREW}`), { status: "removed", role: "collaborator", uid: DREW });
  // Carla belongs to the OTHER client only.
  await setDoc(doc(db, `subAccounts/${SA_B}/subAccountMembers/${CARLA}`), { status: "active", role: "admin", uid: CARLA });
  // A legacy task with no assignee field at all.
  await setDoc(doc(db, "tasks/legacy1"), {
    title: "Legacy", subAccountId: SA_A, agencyId: AGENCY, territoryId: "global",
    completed: false, createdByUid: ALICE,
  });
});

const db = alice.firestore();
const task = (id: string, extra: Record<string, unknown>) =>
  setDoc(doc(db, `tasks/${id}`), {
    title: "T", subAccountId: SA_A, agencyId: AGENCY, territoryId: "global",
    completed: false, createdByUid: ALICE, ...extra,
  });

console.log("── create ──");
await check("unassigned is allowed", () => assertSucceeds(task("t1", {})));
await check("explicit null is allowed", () => assertSucceeds(task("t2", { assigneeUserId: null })));
await check("an active member of THIS workspace is allowed", () => assertSucceeds(task("t3", { assigneeUserId: BOB })));
await check("assigning to yourself is allowed", () => assertSucceeds(task("t4", { assigneeUserId: ALICE })));

console.log("\n── create: the boundary ──");
await check("a member of ANOTHER client is REFUSED", () => assertFails(task("x1", { assigneeUserId: CARLA })));
await check("a REMOVED member is refused", () => assertFails(task("x2", { assigneeUserId: DREW })));
await check("a uid with no membership at all is refused", () => assertFails(task("x3", { assigneeUserId: ORPHAN })));
await check("a forged/garbage uid is refused", () => assertFails(task("x4", { assigneeUserId: "../../etc" })));

console.log("\n── update ──");
await check("reassigning to another active member is allowed", () =>
  assertSucceeds(updateDoc(doc(db, "tasks/t3"), { assigneeUserId: ALICE })));
await check("unassigning is allowed", () =>
  assertSucceeds(updateDoc(doc(db, "tasks/t3"), { assigneeUserId: null })));
await check("a legacy task can be assigned without a migration", () =>
  assertSucceeds(updateDoc(doc(db, "tasks/legacy1"), { assigneeUserId: BOB })));
await check("reassigning to a foreign member is REFUSED", () =>
  assertFails(updateDoc(doc(db, "tasks/t3"), { assigneeUserId: CARLA })));
await check("reassigning to a removed member is refused", () =>
  assertFails(updateDoc(doc(db, "tasks/t3"), { assigneeUserId: DREW })));
await check("completing a task leaves its assignment intact and allowed", () =>
  assertSucceeds(updateDoc(doc(db, "tasks/legacy1"), { completed: true })));

console.log(`\n${failures === 0 ? "TASK ASSIGNEE RULES: ALL CHECKS PASSED" : `TASK ASSIGNEE RULES: ${failures} CHECK(S) FAILED`}`);
await env.cleanup();
process.exit(failures === 0 ? 0 : 1);
