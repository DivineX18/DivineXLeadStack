/**
 * A dialog's footer must stay reachable, however long its content.
 *
 * The bug: DialogContent is centred with -translate-y-1/2 and had no height
 * cap and no overflow, so content taller than the viewport grew off BOTH
 * edges at once with no way to scroll to the bottom. On the contact email
 * dialog that made the Send button impossible to click once a message ran
 * long — measured at 1026px tall in a 720px viewport, footer at y=827.
 *
 * Nine dialogs had already hand-patched the same two classes locally, which
 * is the tell that it belonged in the primitive rather than in each caller.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-dialog-reachability.mts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ck = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail ? ` | ${detail}` : ""}`); }
};

console.log("-- the primitive bounds itself --");
{
  const d = readFileSync("src/components/ui/dialog.tsx", "utf8");
  // Strip comments: the file EXPLAINS the bug, and matching prose would pass
  // for the wrong reason.
  const code = d.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ck("DialogContent caps its height", /max-h-\[calc\(100dvh-2rem\)\]/.test(code));
  ck("and scrolls when content exceeds it", /overflow-y-auto/.test(code));
  // dvh, not vh: the mobile viewport shrinks when the keyboard opens, which is
  // exactly when someone is typing a long message.
  ck("uses dvh so a mobile keyboard doesn't hide the footer", /100dvh/.test(code));
  // Local overrides (nine dialogs set their own max-h) must keep winning, so
  // `className` has to be the LAST argument to cn().
  // Scope to the DialogContent popup. A bare search matches DialogOverlay's
  // cn() first and would assert against the wrong component entirely.
  const popup = code.slice(code.indexOf('data-slot="dialog-content"'));
  const call = /className=\{cn\(([\s\S]*?)\n\s*\)\}/.exec(popup)?.[1] ?? "";
  const args = call.split("\n").map((l) => l.trim()).filter(Boolean);
  ck("the caller's className is merged last, so local overrides still win",
    args[args.length - 1].replace(/,$/, "") === "className", args.join(" | ").slice(0, 120));
}

console.log("\n-- the long-form field can't push the footer away --");
{
  const email = readFileSync("src/components/contacts/send-email-dialog.tsx", "utf8");
  ck("the message box caps its own growth", /max-h-\[45vh\]/.test(email));
  const ta = readFileSync("src/components/ui/textarea.tsx", "utf8");
  ck("which matters because the primitive auto-grows", /field-sizing-content/.test(ta));
}

console.log("\n-- every dialog inherits the fix --");
{
  // Count callers so a regression in the primitive is understood as affecting
  // all of them, not one screen.
  const roots = ["src/components", "src/app"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx")) files.push(p);
    }
  };
  for (const r of roots) walk(r);
  const callers = files.filter((f) => /<DialogContent/.test(readFileSync(f, "utf8")));
  ck(`every DialogContent caller inherits it (${callers.length} found)`, callers.length > 10);
}

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails ? 1 : 0);
