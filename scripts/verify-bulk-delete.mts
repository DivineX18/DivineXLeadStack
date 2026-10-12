/**
 * Bulk contact deletion — the properties that stop a convenience feature from
 * becoming a data-loss feature.
 *
 * The thing worth protecting here: this app deliberately does NOT cascade. A
 * contact linked to a deal, quote or booking cannot be deleted until those are
 * cleared. Bulk delete must honour that per contact. A bulk path with its own
 * weaker check would orphan records a hundred rows at a time, and nobody would
 * notice until the pipeline was already wrong.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-bulk-delete.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`);
  }
};

const service = readFileSync("src/lib/server/contacts-service.ts", "utf8");
const bulk = readFileSync("src/app/api/contacts/bulk-delete/route.ts", "utf8");
const single = readFileSync("src/app/api/contacts/[id]/route.ts", "utf8");
const table = readFileSync("src/components/contacts/contacts-table.tsx", "utf8");
const dialog = readFileSync("src/components/contacts/bulk-delete-contacts-dialog.tsx", "utf8");

console.log("-- one guard, shared, not two --");
{
  ck("the blocker check lives in the service", /export async function findContactBlockers/.test(service));
  ck("the single route uses it rather than its own copy",
    /findContactBlockers/.test(single) &&
      !/^async function findContactBlockers/m.test(single));
  ck("bulk delete goes through the same service function",
    /deleteContactServerSide/.test(bulk));
  ck("bulk delete does NOT reimplement the blocker query",
    !/collectionGroup\("submissions"\)/.test(bulk) && !/\.count\(\)/.test(bulk));

  // All seven reference types must still be checked. Dropping one silently
  // re-enables orphaning for that resource.
  for (const t of ["deals", "tasks", "events", "quotes", "submissions", "webChatSessions", "voiceCalls"]) {
    ck(`still checks ${t}`, service.includes(t));
  }
}

console.log("\n-- a blocked contact is never deleted --");
{
  ck("blockers short-circuit before any delete",
    /if \(blockers\.length > 0\)[\s\S]{0,120}status: "blocked"/.test(service));
  const iBlock = service.indexOf('status: "blocked"');
  const iDelete = service.indexOf("recursiveDelete");
  ck("the blocked return comes BEFORE the delete call",
    iBlock > -1 && iDelete > -1 && iBlock < iDelete, `blocked@${iBlock} delete@${iDelete}`);
  ck("the reason is returned, not swallowed", /blockers,?\s*\}/.test(service));
}

console.log("\n-- tenancy cannot be crossed on one authorization --");
{
  ck("the route authorizes against the named workspace", /requireSubAccountAdmin\(request, subAccountId\)/.test(bulk));
  ck("admin, not merely a member", !/requireSubAccountMember/.test(bulk));
  ck("every id is re-checked against that workspace",
    /expectedSubAccountId/.test(service) && /status: "wrong_workspace"/.test(service));
  ck("a foreign id is refused rather than deleted",
    /contact\.subAccountId !== opts\.expectedSubAccountId[\s\S]{0,120}wrong_workspace/.test(service));
  ck("and it is reported distinctly from not_found", /wrongWorkspace/.test(bulk));
}

console.log("\n-- the batch cannot run away --");
{
  ck("there is a per-request ceiling", /MAX_PER_REQUEST\s*=\s*\d+/.test(bulk));
  ck("over the ceiling is refused with the limit named", /Delete up to \$\{MAX_PER_REQUEST\}/.test(bulk));
  ck("ids are de-duplicated", /new Set\(/.test(bulk));
  ck("concurrency is bounded", /CONCURRENCY\s*=\s*\d+/.test(bulk));
  ck("one failed row does not abandon the batch", /catch \(err\)[\s\S]{0,400}return \{ contactId/.test(bulk));
  ck("a failed row is never counted as deleted",
    !/catch[\s\S]{0,200}status: "deleted"/.test(bulk));
  ck("the client chunks to the same ceiling", /CHUNK\s*=\s*100/.test(dialog));
}

console.log("\n-- the webhook still fires with what was deleted --");
{
  ck("contact.deleted is emitted", /emitContactDeleted/.test(service));
  const iEmit = service.lastIndexOf("emitContactDeleted");
  const iRead = service.lastIndexOf("snap.data()");
  ck("from the pre-delete snapshot, since the doc is gone by then",
    iEmit > -1 && iRead > -1);
}

console.log("\n-- the UI cannot delete the wrong rows --");
{
  // Selection keyed by index would follow the ROW POSITION through a re-sort
  // or a live Firestore update, and then delete whatever moved into it.
  ck("rows are selected by stable contact id, not index", /getRowId: \(row\) => row\.id/.test(table));
  ck("selection is admin-only", /enableRowSelection: isAdmin/.test(table));
  ck("the checkbox column is admin-only", /isAdmin\s*\?\s*\[/.test(table));
  ck("isAdmin is a dependency, so the column appears when memberships resolve",
    /territoryById, isAdmin\]/.test(table));
  ck("select-all covers only the filtered rows on screen", /toggleAllRowsSelected/.test(table));

  ck("deletion is confirmed before it runs", /BulkDeleteContactsDialog/.test(table));
  ck("the dialog states the action is permanent", /cannot be undone/i.test(dialog));
  ck("and explains that linked contacts are kept, not deleted",
    /kept, not deleted|kept<\/strong>/.test(dialog) || /will be <strong>kept/.test(dialog));
  ck("only rows that actually deleted are removed from the table",
    /onDeleted\(\s*deletedIds|onDeleted\(deletedIds\)/.test(dialog));
  ck("kept rows stay selected so they can be dealt with",
    /for \(const id of ids\) delete next\[id\]/.test(table));
  ck("a partial run reports the split rather than plain success",
    /Deleted \$\{deletedIds\.length\}\. \$\{blockedOut\.length\} kept/.test(dialog));
  ck("a run that deleted nothing says so", /Nothing was deleted/.test(dialog));
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
