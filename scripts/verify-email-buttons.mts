/**
 * Call-to-action buttons in automated emails, and the escaping that had to
 * come with them.
 *
 * A link used to render as a raw URL mid-paragraph, because the body was only
 * ever split into <p> tags. And nothing was escaped: the body reaches the
 * renderer with merge tags ALREADY resolved, so a contact whose name held
 * markup had it injected into every email their record touched. On any
 * workspace with a public form that is attacker-supplied data.
 *
 * Run: npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/verify-email-buttons.mts
 */
import fs from "node:fs";
import {
  DEFAULT_ACCENT,
  parseButtonLine,
  renderBodyHtml,
  renderBodyText,
  resolveBrandColors,
} from "../src/lib/email/body";

let fails = 0;
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` - ${d}` : ""}`);
  if (!ok) fails++;
};

const BOOK = "https://crm.divinex.io/b/abc/30-minute-consultation";

console.log("-- the syntax --");
ck("a primary button parses", parseButtonLine(`[button: Book a call](${BOOK})`)?.style === "primary");
ck("a secondary button parses", parseButtonLine(`[button secondary: See pricing](${BOOK})`)?.style === "secondary");
ck("an explicit primary parses", parseButtonLine(`[button primary: Go](${BOOK})`)?.style === "primary");
ck("the label is captured", parseButtonLine(`[button: Book a 30-minute call](${BOOK})`)?.label === "Book a 30-minute call");
ck("ordinary prose is not a button", parseButtonLine("Have a look at https://example.com when you can") === null);
ck("a markdown link is not a button", parseButtonLine("[Book a call](https://example.com)") === null);
ck("surrounding whitespace is tolerated", parseButtonLine(`   [button: Go](${BOOK})   `) !== null);

console.log("\n-- a link that cannot be trusted is not made into one --");
for (const scheme of ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "vbscript:x"]) {
  ck(`${scheme.split(":")[0]}: is refused`, parseButtonLine(`[button: Click](${scheme})`) === null);
}
ck("mailto is allowed", parseButtonLine("[button: Email us](mailto:hi@example.com)") !== null);
ck("a refused scheme renders as escaped text, not a link", (() => {
  const html = renderBodyHtml("[button: Click](javascript:alert(1))");
  return !html.includes("<a href") && !html.includes("javascript:alert(1)</a>");
})());

console.log("\n-- everything that is not a button is escaped --");
{
  // Merge tags are resolved BEFORE this runs, so a contact's own field is
  // what lands here.
  const html = renderBodyHtml('Hi <script>alert("x")</script> & "friends"');
  ck("script tags cannot survive", !/<script>/.test(html), html.slice(0, 70));
  ck("angle brackets are entities", html.includes("&lt;script&gt;"));
  ck("ampersands are escaped", html.includes("&amp;"));
  ck("quotes are escaped", html.includes("&quot;") || html.includes("&#39;"));
}
{
  const html = renderBodyHtml(`[button: <img src=x onerror=alert(1)>](${BOOK})`);
  ck("a hostile button LABEL is escaped too", !/<img/.test(html), html.slice(0, 90));
}
{
  const html = renderBodyHtml(`[button: Go]("onmouseover="alert(1))`);
  ck("a label cannot break out of the href attribute", !/onmouseover=/.test(html) || !html.includes('href="'));
}

console.log("\n-- the button renders as something mail clients agree on --");
{
  const html = renderBodyHtml(`Ready when you are.\n\n[button: Book a 30-minute call](${BOOK})`);
  ck("it is a table, not a styled anchor", html.includes("<table role=\"presentation\""));
  // Outlook renders through Word, which ignores padding on an inline element,
  // so the box has to be on the cell.
  ck("the padding is on the cell, where Outlook will honour it", /<td[^>]*padding:13px 26px;/.test(html));
  ck("the href survives intact", html.includes(BOOK));
  ck("the label is the anchor text", html.includes(">Book a 30-minute call</a>"));
  ck("the prose above it is still a paragraph", html.includes("<p style=\"margin:0 0 16px;\">Ready when you are.</p>"));
}

console.log("\n-- primary is filled, secondary is outlined --");
{
  const colors = resolveBrandColors("#7c3aed");
  const primary = renderBodyHtml(`[button: Go](${BOOK})`, { colors });
  const secondary = renderBodyHtml(`[button secondary: Go](${BOOK})`, { colors });
  ck("primary fills with the brand colour", primary.includes("background-color:#7c3aed"));
  ck("secondary does not fill", secondary.includes("background-color:#ffffff"));
  ck("secondary is outlined in the brand colour", secondary.includes("border:2px solid #7c3aed"));
  ck("secondary text is the brand colour", secondary.includes("color:#7c3aed"));
  ck("an unset workspace gets the product accent",
    renderBodyHtml(`[button: Go](${BOOK})`).includes(DEFAULT_ACCENT));
  ck("a bad colour falls back rather than reaching the style attribute",
    renderBodyHtml(`[button: Go](${BOOK})`, { colors: resolveBrandColors("red; } evil {") })
      .includes(DEFAULT_ACCENT));
}
{
  // A pale brand colour with white text is a CTA nobody can read.
  ck("dark fill takes white text", resolveBrandColors("#111827").onAccent === "#ffffff");
  ck("pale fill takes dark text", resolveBrandColors("#fde047").onAccent === "#111827");
  ck("shorthand hex works", resolveBrandColors("#0a0").accent === "#0a0");
}

console.log("\n-- the plain-text version --");
{
  const body = `Ready when you are.\n\n[button: Book a 30-minute call](${BOOK})\n\n[button secondary: Run a Growth Assessment](https://example.com/scan)`;
  const text = renderBodyText(body);
  ck("a button becomes label then URL", text.includes(`Book a 30-minute call: ${BOOK}`), text.split("\n").find((l) => l.includes("Book")) ?? "");
  ck("the secondary one too", text.includes("Run a Growth Assessment: https://example.com/scan"));
  ck("no markup is left for a plain-text reader", !text.includes("[button"));
  ck("the prose is untouched", text.includes("Ready when you are."));
}

console.log("\n-- the unsubscribe footer still behaves --");
{
  const html = renderBodyHtml(`Hello.\n\n[button: Go](${BOOK})\n\n@@U@@`, {
    unsub: { token: "@@U@@", href: "https://x.test/u/tok" },
  });
  ck("the token becomes the quiet footer", html.includes("border-top:1px solid #e5e7eb") && html.includes(">Unsubscribe</a>"));
  ck("the token itself never ships", !html.includes("@@U@@"));
  ck("the button is unaffected", html.includes(BOOK));
}

console.log("\n-- it is wired where it has to be --");
{
  const engine = fs.readFileSync("src/lib/workflows/engine.ts", "utf8");
  ck("the workflow engine renders through it", /renderBodyHtml\(/.test(engine));
  ck("plain text uses the fallback", /renderBodyText\(/.test(engine));
  ck("the workspace colour reaches the renderer", /brandColor/.test(engine));
  const dialog = fs.readFileSync("src/components/workflows/node-config-dialog.tsx", "utf8");
  ck("the editor tells the operator the syntax exists", /BUTTON_SYNTAX_HELP/.test(dialog));
  const caps = fs.readFileSync("src/lib/ai-suite/capabilities.ts", "utf8");
  ck("Zeno is told the syntax exists", /\[button: Book a 30-minute call\]/.test(caps));
  const route = fs.readFileSync("src/app/api/sub-accounts/[id]/branding/route.ts", "utf8");
  ck("the colour can only be saved as a hex value", /HEX_RE\.test\(trimmed\)/.test(route));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
