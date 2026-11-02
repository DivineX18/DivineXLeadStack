/**
 * The two funnel-editor defects that LOSE WORK, as opposed to frustrating.
 *
 * QA reported five editor complaints. Three are depth (free drag, image
 * controls, replacing a split-section image) and are a project. These two are
 * different in kind: one discarded unsaved edits without a word, the other
 * deleted an entire section on a single click with no way back. Both destroy
 * something the operator already made.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-editor-work-loss.mts
 */

import { readFileSync } from "node:fs";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  if (ok) console.log(`PASS  ${n}`);
  else { fails++; console.log(`FAIL  ${n}${d ? ` | ${d}` : ""}`); }
};
const BUILDER = "src/components/funnels/funnel-builder.tsx";
const raw = readFileSync(BUILDER, "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("-- deleting a section is recoverable --");
{
  ck("delete offers Undo", /label: "Undo"/.test(code));

  // Restoring at the end would be a different page. For a page built in an
  // order, putting it back where it was is most of what undo has to mean.
  ck("it restores at the original index, not appended",
    /const index = prev\.findIndex/.test(code) && /next\.splice\(Math\.min\(index, next\.length\), 0, removed\)/.test(code));

  // MUTATION — undo must act on the list as it is WHEN undo is clicked, not
  // replay a snapshot. Between delete and undo the operator may have changed
  // something else, and undo must not revert that too.
  ck("MUTATION: undo re-reads current state rather than replaying a snapshot",
    /setSections\(\(cur\) =>/.test(code) && !/setSections\(prev\)/.test(code));

  // Double-clicking Undo must not insert the section twice.
  ck("undoing twice cannot duplicate the section",
    /if \(cur\.some\(\(s\) => s\.id === removed\.id\)\) return cur;/.test(code));

  // A confirm() would tax every deliberate delete to catch the rare accident,
  // and people learn to dismiss it unread.
  ck("it did NOT add a confirm dialog on every delete",
    !/confirm\(["'`][^)]*section/i.test(code));
}

console.log("\n-- unsaved edits are not discarded silently --");
{
  ck("the browser asks before discarding", /beforeunload/.test(code));
  ck("and only while there is something to lose", /if \(!dirty\) return;/.test(code));

  // DERIVED, not flagged. A dozen edit paths exist and more arrive; one
  // forgotten setDirty is a silent hole in the guard against silent loss.
  ck("dirty is derived from the saved shape, not set by hand",
    /const dirty = savedShape\.current !== null && savedShape\.current !== currentShape;/.test(code));
  ck("MUTATION: no imperative setDirty an edit path could forget",
    !/setDirty\(/.test(code));

  // A failed save must leave the document dirty and still guarded.
  ck("the baseline moves only after the PATCH actually succeeded",
    code.indexOf("markSaved(sections)") > code.indexOf("if (!res.ok)"));
  ck("and a baseline is taken when the funnel loads",
    /savedShape\.current = JSON\.stringify\(d\.funnel\.sections\)/.test(code));

  // Honest scope: beforeunload does not fire on in-app navigation. The comment
  // has to say so rather than imply full protection.
  ck("the comment names what this does NOT cover",
    /In-app navigation/.test(raw) && /does not fire beforeunload/.test(raw));
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
