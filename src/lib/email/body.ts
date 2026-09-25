/**
 * EMAIL BODY RENDERING: paragraphs, call-to-action buttons, and escaping.
 *
 * Two problems this fixes, and the second one is the serious one.
 *
 * A link in an automated email used to render as a raw URL in the middle of a
 * paragraph, because the body was only ever split into <p> tags. The thing the
 * email exists to get clicked looked like debris.
 *
 * And nothing was escaped. The body reaches here with merge tags ALREADY
 * resolved, so a contact whose name contained markup had that markup injected
 * into every email their record touched. A contact field is attacker-supplied
 * data on any workspace with a public form, which is all of them. Everything
 * that is not a recognised button is escaped now.
 *
 * The button markup is deliberately old-fashioned: a single-cell table with
 * the padding on the <td> rather than on the <a>. Outlook renders mail through
 * Word, which ignores padding on an inline element, so the widely-used
 * "bulletproof" shape puts the box on the cell and lets the anchor fill it.
 * No VML, no conditional comments, nothing that needs a build step.
 */

export type ButtonStyle = "primary" | "secondary";

export interface BrandColors {
  /** Fill for the primary button, and the border/text for the secondary. */
  accent: string;
  /** Text on top of the accent fill, chosen for contrast. */
  onAccent: string;
}

/** The product's own accent, used when a workspace has not set one. */
export const DEFAULT_ACCENT = "#059669";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function expand(hex: string): string {
  const h = hex.replace("#", "");
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

/**
 * Text colour for a filled button.
 *
 * A workspace that picks a pale brand colour would otherwise get white text on
 * a near-white button, which is a CTA nobody can read. Relative luminance per
 * WCAG, then near-black or white, whichever the fill can carry.
 */
function readableOn(hex: string): string {
  const h = expand(hex);
  const channel = (i: number): number => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.45 ? "#111827" : "#ffffff";
}

/** Brand colours for this workspace, falling back to the product accent. */
export function resolveBrandColors(brandColor?: string | null): BrandColors {
  const raw = (brandColor ?? "").trim();
  const accent = HEX.test(raw) ? raw : DEFAULT_ACCENT;
  return { accent, onAccent: readableOn(accent) };
}

/**
 * `[button: Label](https://…)` on its own line, optionally
 * `[button secondary: Label](https://…)`.
 */
const BUTTON_LINE =
  /^\[button(?:\s+(primary|secondary))?\s*:\s*([^\]]{1,120}?)\s*\]\(\s*(\S+?)\s*\)$/i;

export interface ParsedButton {
  style: ButtonStyle;
  label: string;
  href: string;
}

/** A button line, or null when the line is ordinary prose. */
export function parseButtonLine(line: string): ParsedButton | null {
  const m = line.trim().match(BUTTON_LINE);
  if (!m) return null;
  const href = m[3];
  // Only schemes that can safely become an href in mail. Anything else (most
  // obviously javascript:) is not a link, and is left to render as text.
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return null;
  return {
    style: (m[1] ?? "primary").toLowerCase() as ButtonStyle,
    label: m[2].trim(),
    href,
  };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One call-to-action button, as table markup mail clients agree on. */
export function renderButtonHtml(btn: ParsedButton, colors: BrandColors): string {
  const label = escapeHtml(btn.label);
  const href = escapeHtml(btn.href);
  const filled = btn.style === "primary";
  const cell = filled
    ? `background-color:${colors.accent};border:2px solid ${colors.accent};border-radius:8px;`
    : `background-color:#ffffff;border:2px solid ${colors.accent};border-radius:8px;`;
  const textColor = filled ? colors.onAccent : colors.accent;
  return (
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:separate;">` +
    `<tr><td align="center" style="${cell}padding:13px 26px;">` +
    `<a href="${href}" style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:${textColor};text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

export interface RenderOptions {
  colors?: BrandColors;
  /** A placeholder swapped for a real unsubscribe anchor after escaping. */
  unsub?: { token: string; href: string };
}

/**
 * Body → HTML. Buttons become buttons; everything else is escaped prose.
 */
export function renderBodyHtml(resolved: string, opts: RenderOptions = {}): string {
  const colors = opts.colors ?? resolveBrandColors(null);
  const unsub = opts.unsub;
  const anchor = unsub
    ? `<a href="${escapeHtml(unsub.href)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`
    : "";

  const out: string[] = [];
  for (const block of resolved.split(/\n\s*\n/)) {
    if (!block.trim()) continue;

    // The unsubscribe line keeps its own quiet footer treatment.
    if (unsub && block.trim() === unsub.token) {
      out.push(
        `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">${anchor}</p>`,
      );
      continue;
    }

    // A button sits on its own line, so a paragraph is split around it
    // rather than the whole block being all-or-nothing.
    let prose: string[] = [];
    const flush = () => {
      if (prose.length === 0) return;
      const escaped = prose.map(escapeHtml).join("<br>");
      const withUnsub = unsub ? escaped.split(escapeHtml(unsub.token)).join(anchor) : escaped;
      out.push(`<p style="margin:0 0 16px;">${withUnsub}</p>`);
      prose = [];
    };
    for (const line of block.split(/\r?\n/)) {
      const btn = parseButtonLine(line);
      if (btn) {
        flush();
        out.push(renderButtonHtml(btn, colors));
      } else {
        prose.push(line);
      }
    }
    flush();
  }
  return out.join("");
}

/**
 * Body → plain text. A button becomes "Label: https://…", because a
 * plain-text reader who sees `[button: Book a call](https://…)` has been
 * shown the markup instead of the link.
 */
export function renderBodyText(resolved: string): string {
  return resolved
    .split(/\r?\n/)
    .map((line) => {
      const btn = parseButtonLine(line);
      return btn ? `${btn.label}: ${btn.href}` : line;
    })
    .join("\n");
}

/** One sentence of help, shown wherever an email body is edited. */
export const BUTTON_SYNTAX_HELP =
  "Put a link on its own line as [button: Book a call](https://example.com) to render it as a button. Use [button secondary: …](…) for the outlined style.";
