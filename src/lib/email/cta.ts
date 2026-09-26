/**
 * EDITING THE CALL TO ACTION WITHOUT REWRITING THE EMAIL.
 *
 * Zeno could change an email only by replacing its whole body, so "add a Book
 * a Call button to email 2" meant regenerating the message. Everything the
 * customer had written was re-decided by a model that had been asked to
 * change one line: their subject survived, their sentences did not, and in a
 * workflow the whole sequence went back through the compiler for a button.
 *
 * So a CTA is edited as a CTA. These functions take a body, change one
 * button in it, and return the body with every other character where it was.
 * They are pure, so both callers, a saved template and one email step inside
 * a workflow, share the same rules while writing through their own services.
 *
 * The syntax is the one that already renders: `[button: Label](https://…)`
 * and `[button secondary: Label](https://…)`, parsed by the existing
 * parseButtonLine so a button this file writes is exactly a button the
 * renderer draws, including its plain-text fallback.
 *
 * ONE PLACEMENT RULE, and it is a legal one. The unsubscribe link is the
 * last thing in the message for a reason: a call to action underneath the
 * way out is a dark pattern, and in a bulk send it is the kind of thing that
 * gets a sending domain blocked. A button is therefore inserted BEFORE the
 * line carrying {{unsubscribeLink}}, never after it, and this file never
 * removes or rewrites that line.
 */
import { parseButtonLine, type ButtonStyle, type ParsedButton } from "@/lib/email/body";

export interface BodyButton extends ParsedButton {
  /** Index of the line this button occupies in the body. */
  line: number;
  /** 1-based position among the buttons, which is how a person refers to one. */
  position: number;
}

/** Every button in the body, in the order they appear. */
export function findButtons(body: string): BodyButton[] {
  const out: BodyButton[] = [];
  body.split("\n").forEach((line, i) => {
    const btn = parseButtonLine(line);
    if (btn) out.push({ ...btn, line: i, position: out.length + 1 });
  });
  return out;
}

export function buttonSyntax(btn: {
  style: ButtonStyle;
  label: string;
  href: string;
}): string {
  const kind = btn.style === "secondary" ? "button secondary" : "button";
  return `[${kind}: ${btn.label}](${btn.href})`;
}

/**
 * The line index a new button goes before: the unsubscribe line if there is
 * one, otherwise the end. Anything after the unsubscribe line (a footer, an
 * address) stays after it.
 */
function insertionPoint(lines: string[]): number {
  const unsub = lines.findIndex((l) => l.includes("{{unsubscribeLink}}"));
  if (unsub === -1) return lines.length;
  // Step back over blank lines so the button is not welded to the footer.
  let at = unsub;
  while (at > 0 && lines[at - 1].trim() === "") at--;
  return at;
}

export type CtaEditResult =
  | { ok: true; body: string; button: { label: string; href: string; style: ButtonStyle } }
  | { ok: false; reason: "no_buttons" | "ambiguous" | "not_found" | "duplicate"; buttons?: BodyButton[] };

/** Add a button. Refuses to add one that is already there. */
export function addButton(
  body: string,
  btn: { label: string; href: string; style?: ButtonStyle },
): CtaEditResult {
  const style: ButtonStyle = btn.style ?? "primary";
  const existing = findButtons(body);
  // Asked to add what is already present, adding it twice is not what was
  // meant. The caller turns this into "it is already there".
  if (existing.some((b) => b.href === btn.href && b.label.toLowerCase() === btn.label.toLowerCase())) {
    return { ok: false, reason: "duplicate", buttons: existing };
  }
  const lines = body.split("\n");
  const at = insertionPoint(lines);
  const block = at > 0 && lines[at - 1].trim() !== "" ? ["", buttonSyntax({ style, ...btn })] : [buttonSyntax({ style, ...btn })];
  if (at < lines.length) block.push("");
  lines.splice(at, 0, ...block);
  return { ok: true, body: tidy(lines.join("\n")), button: { ...btn, style } };
}

/**
 * Change one button's label and/or destination. With several buttons and no
 * position given the caller is asked which, because changing the wrong one
 * silently repoints a link the customer relies on.
 */
export function updateButton(
  body: string,
  patch: { position?: number; label?: string; href?: string; style?: ButtonStyle },
): CtaEditResult {
  const buttons = findButtons(body);
  if (buttons.length === 0) return { ok: false, reason: "no_buttons" };
  let target: BodyButton | undefined;
  if (patch.position !== undefined) {
    target = buttons.find((b) => b.position === patch.position);
    if (!target) return { ok: false, reason: "not_found", buttons };
  } else if (buttons.length === 1) {
    target = buttons[0];
  } else {
    return { ok: false, reason: "ambiguous", buttons };
  }
  const next = {
    style: patch.style ?? target.style,
    label: patch.label ?? target.label,
    href: patch.href ?? target.href,
  };
  const lines = body.split("\n");
  lines[target.line] = buttonSyntax(next);
  return { ok: true, body: lines.join("\n"), button: next };
}

/** Remove one button, leaving the surrounding copy alone. */
export function removeButton(body: string, position?: number): CtaEditResult {
  const buttons = findButtons(body);
  if (buttons.length === 0) return { ok: false, reason: "no_buttons" };
  let target: BodyButton | undefined;
  if (position !== undefined) {
    target = buttons.find((b) => b.position === position);
    if (!target) return { ok: false, reason: "not_found", buttons };
  } else if (buttons.length === 1) {
    target = buttons[0];
  } else {
    return { ok: false, reason: "ambiguous", buttons };
  }
  const lines = body.split("\n");
  lines.splice(target.line, 1);
  return { ok: true, body: tidy(lines.join("\n")), button: target };
}

/** Collapse the blank-line runs an insert or a delete can leave behind. */
function tidy(body: string): string {
  return body.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "");
}
