/**
 * The funnel-editor defects that LOSE WORK or MISLEAD, as opposed to
 * frustrating.
 *
 * QA reported five editor complaints. Three are depth (free drag, image
 * controls, replacing a split-section image) and are a project. These are
 * different in kind: one discarded unsaved edits without a word, one deleted
 * an entire section on a single click with no way back, and one told the
 * operator their file was "a image/gif".
 *
 * All three were reported, fixed, and then FAILED retest — because the fixes
 * sat on a branch that render.yaml does not deploy. That is also why the
 * nav-guard and keyboard-undo checks below exist: the first pass covered tab
 * close and a toast, QA pressed the two things a person actually does next
 * (click the sidebar, hit Ctrl+Z), and both did nothing.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-funnel-editor-work-loss.mts
 */

import { readFileSync } from "node:fs";
import { checkUploadable, describeFileType } from "../src/lib/funnels/upload-client.ts";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  if (ok) console.log(`PASS  ${n}`);
  else { fails++; console.log(`FAIL  ${n}${d ? ` | ${d}` : ""}`); }
};
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUILDER = "src/components/funnels/funnel-builder.tsx";
const GUARD = "src/hooks/use-unsaved-changes-guard.ts";
const raw = readFileSync(BUILDER, "utf8");
const code = strip(raw);
const guardRaw = readFileSync(GUARD, "utf8");
const guard = strip(guardRaw);

console.log("-- deleting a section is recoverable --");
{
  ck("delete offers Undo", /label: "Undo"/.test(code));

  // Restoring at the end would be a different page. For a page built in an
  // order, putting it back where it was is most of what undo has to mean.
  ck("it restores at the original index, not appended",
    /next\.splice\(Math\.min\(entry\.index, next\.length\), 0, entry\.section\)/.test(code));

  // MUTATION — undo must act on the list as it is WHEN undo is clicked, not
  // replay a snapshot. Between delete and undo the operator may have changed
  // something else, and undo must not revert that too.
  ck("MUTATION: undo re-reads current state rather than replaying a snapshot",
    /setSections\(\(cur\) =>/.test(code) && !/setSections\(prev\)/.test(code));

  // Double-clicking Undo, or clicking the toast and then pressing Ctrl+Z,
  // must not insert the section twice.
  ck("undoing twice cannot duplicate the section",
    /if \(cur\.some\(\(s\) => s\.id === entry\.section\.id\)\) return cur;/.test(code));

  // MUTATION — React may invoke a state updater more than once for a single
  // event. A toast or a stack push inside the updater therefore fires twice
  // for one click: two toasts, and an undo stack one entry too deep.
  // Scoped to the function body. An unbounded [\s\S]* here reaches the next
  // toast() anywhere later in the 2,000-line file and reports a problem that
  // is not there — which is exactly what it did on the first run of this check.
  const removeBody = code.slice(code.indexOf("function removeSection"), code.indexOf("function duplicateSection"));
  ck("MUTATION: the toast and the undo-stack push are OUTSIDE the state updater",
    removeBody.indexOf("deleted.current.push(") < removeBody.indexOf("setSections(")
    // A single-expression updater has nowhere for a side effect to hide; a
    // block body would, so its absence is the thing being asserted.
    && /setSections\(\(prev\) => prev\.filter\(\(s\) => s\.id !== id\)\);/.test(removeBody)
    && !/setSections\(\(prev\) => \{/.test(removeBody)
    && removeBody.indexOf("toast(") > removeBody.indexOf("setSections("));

  // QA reached for Ctrl+Z, which is what anyone editing a page does.
  ck("Ctrl/Cmd+Z restores a deleted section",
    /e\.key !== "z" && e\.key !== "Z"/.test(code) && /e\.metaKey \|\| e\.ctrlKey/.test(code));

  // MUTATION — hijacking undo inside a text field would break ordinary
  // typing to fix section deletes. That is a worse trade than leaving it.
  ck("MUTATION: Ctrl+Z is NOT stolen from a field being typed in",
    /t\.isContentEditable\) return/.test(code)
    && /tag === "INPUT" \|\| tag === "TEXTAREA"/.test(code));

  // One source of truth for "the last delete", so the toast and the keyboard
  // cannot disagree about what undo means.
  ck("both affordances pop the same stack",
    (code.match(/restoreLastDeleted/g) ?? []).length >= 3
    && /deleted\.current\.pop\(\)/.test(code));

  // Pressing Ctrl+Z with nothing deleted must leave the browser's own
  // behaviour alone rather than swallowing the keystroke.
  ck("an empty stack does not preventDefault",
    code.indexOf("if (deleted.current.length === 0) return;") > 0
    && code.indexOf("if (deleted.current.length === 0) return;") < code.indexOf("restoreLastDeleted();"));

  // A confirm() would tax every deliberate delete to catch the rare accident,
  // and people learn to dismiss it unread.
  ck("it did NOT add a confirm dialog on every delete",
    !/confirm\(["'`][^)]*section/i.test(code));
}

console.log("\n-- unsaved edits are not discarded silently --");
{
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

  ck("the editor delegates the asking to the shared guard",
    /useUnsavedChangesGuard\(\s*dirty,/.test(code));
}

console.log("\n-- the guard covers in-app navigation, which is what QA hit --");
{
  ck("the document unload case is still covered", /beforeunload/.test(guard));

  // The reported failure exactly: clicking the sidebar discarded edits in
  // silence, because App Router swaps a subtree and never unloads the page.
  ck("an in-app anchor click is intercepted",
    /document\.addEventListener\("click", onClickCapture, true\)/.test(guard)
    && /closest\("a\[href\]"\)/.test(guard));

  // MUTATION — without the capture flag, next/link's own handler runs first
  // and the navigation is committed before we are asked.
  ck("MUTATION: the listener is in the CAPTURE phase",
    /addEventListener\("click", onClickCapture, true\)/.test(guard)
    && /removeEventListener\("click", onClickCapture, true\)/.test(guard));

  // MUTATION — preventDefault alone leaves Link's handler free to navigate.
  ck("MUTATION: it stops propagation, not just the default action",
    /e\.preventDefault\(\);[\s\S]{0,200}?e\.stopImmediatePropagation\(\);/.test(guard));

  // Only a blocking prompt can stop a click. A React dialog resolves a turn
  // later, by which point the editor has already gone.
  ck("it asks with a prompt that can actually block the click",
    /if \(!window\.confirm\(message\)\)/.test(guard));

  ck("MUTATION: a cmd/ctrl/shift/middle click passes through untouched",
    /e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(guard));
  ck("MUTATION: a download or a new-tab link is not a navigation",
    /hasAttribute\("download"\)/.test(guard) && /anchor\.target !== "_self"/.test(guard));

  // A tab, an accordion or an in-page anchor discards nothing, so it must not
  // prompt — a guard that nags on every click gets clicked through blind.
  ck("MUTATION: staying on the same page does not prompt",
    /dest\.pathname === window\.location\.pathname && dest\.search === window\.location\.search/.test(guard));

  // Leaving for another origin unloads the document, so beforeunload already
  // asks. Asking twice is worse than asking once.
  ck("MUTATION: a cross-origin link is left to beforeunload, not double-prompted",
    /dest\.origin !== window\.location\.origin/.test(guard));

  ck("nothing is registered while the page is clean", /if \(!dirty\) return;/.test(guard));
  ck("and both listeners are torn down",
    /removeEventListener\("beforeunload"/.test(guard) && /removeEventListener\("click"/.test(guard));

  // The first pass claimed only what it covered, and that honesty is what let
  // QA aim straight at the gap. Keep it.
  ck("the remaining gaps are named, not implied away",
    /does NOT guard browser back\/forward/.test(guardRaw) && /router\.push/.test(guardRaw));
}

console.log("\n-- a refused upload says what the file IS, in English --");
{
  // Executed, not pattern-matched: these are pure functions, so the real
  // answer is cheaper to get than a regex that approximates it.
  const f = (name: string, type: string, size = 1024) => ({ name, type, size }) as File;

  ck('a GIF reads as "a GIF", not "a image/gif"', describeFileType(f("logo.gif", "image/gif")) === "a GIF");
  ck("an accepted type still reads by its own name", describeFileType(f("a.png", "image/png")) === "a PNG");

  // MUTATION — an acronym is read letter by letter, so the article follows how
  // the first letter SOUNDS, not how it is spelled. "a SVG" was the first
  // version of this and is the same class of defect as BUG-040 itself.
  ck("MUTATION: an acronym starting with a vowel SOUND takes \"an\"",
    describeFileType(f("d.svg", "image/svg+xml")) === "an SVG"
    && describeFileType(f("p.heic", "image/heic")) === "an HEIC"
    && describeFileType(f("c.mp4", "video/mp4")) === "a video");
  ck("MUTATION: and a consonant-sound acronym still takes \"a\"",
    describeFileType(f("s.pdf", "application/pdf")) === "a PDF"
    && describeFileType(f("b.bmp", "image/bmp")) === "a BMP"
    && describeFileType(f("t.csv", "text/csv")) === "a CSV file"
    && describeFileType(f("w.webp", "image/webp")) === "a WebP");

  // MUTATION — the MIME table must be consulted BEFORE the extension, since
  // that is what the check rejected on. Leading with the extension would let
  // a mislabelled file be described as the thing it is not.
  ck("MUTATION: MIME wins over a contradicting extension",
    describeFileType(f("screenshot.gif", "application/pdf")) === "a PDF");

  // Browsers hand over an empty type for anything they do not recognise.
  ck("an empty file.type falls back to the extension", describeFileType(f("clip.mov", "")) === "a video");
  ck("an unrecognised type names the extension, not the MIME type",
    describeFileType(f("art.psd", "application/octet-stream")) === "a .psd file");
  ck("and a file with no extension at all still reads as a sentence",
    describeFileType(f("README", "application/octet-stream")) === "a file of a type we don't accept");

  const msg = checkUploadable(f("logo.gif", "image/gif"), ["image/jpeg", "image/png", "image/webp"]);
  ck("the rejection message is produced", typeof msg === "string" && (msg ?? "").length > 0);
  ck("MUTATION: no MIME type reaches the operator", !/image\/|application\//.test(msg ?? ""));
  ck("it names the file and what IS accepted", /logo\.gif/.test(msg ?? "") && /JPEG, PNG, WebP/.test(msg ?? ""));
  ck("MUTATION: the article agrees with the word after it",
    !/\bis a [aeiou]/i.test(msg ?? "") && !/\bis a [FHLMNRSX]{2,}/.test(msg ?? ""));

  // The size and empty branches were already human and must stay that way.
  const big = checkUploadable(f("big.png", "image/png", 99 * 1024 * 1024));
  ck("an oversized file still explains itself", /over the/.test(big ?? "") && !/image\//.test(big ?? ""));
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
