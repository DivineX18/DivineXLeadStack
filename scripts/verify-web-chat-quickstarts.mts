// Regression coverage for the opening-state quick-start chips (2026-09-27).
// Pure-logic checks (sanitiser + source-level guarantees). Visual/interaction
// behaviour (chip render, collapse-on-send, mobile wrap, "Ask anything" focus-only,
// the "Options" toggle) was verified with Playwright against a local preview
// harness and is documented with screenshots in the handoff, not committed here
// (no backend/DB is exercised by that harness).
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-web-chat-quickstarts.mts

import { readFileSync } from "node:fs";

const { sanitiseQuickStarts } = await import("../src/lib/comms/web-chat/cta");

let failures = 0;
const check = (l: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${l}${d ? " — " + d : ""}`); if (!ok) failures++; };

// ---- sanitiser
{
  const good = sanitiseQuickStarts([
    { id: "grow-business", label: "Grow My Business", prompt: "I want to grow my business. Where should I start?" },
    { id: "ask-anything", label: "Ask Zeno Anything", prompt: "" }, // empty prompt is valid: focus-only chip
  ]);
  check("valid entries kept, including one with an empty (focus-only) prompt", good.length === 2 && good[1]!.prompt === "");

  check("missing id rejected", sanitiseQuickStarts([{ label: "x", prompt: "y" }]).length === 0);
  check("empty label rejected", sanitiseQuickStarts([{ id: "a", label: "  ", prompt: "y" }]).length === 0);
  check("bad-character id rejected", sanitiseQuickStarts([{ id: "not an id!", label: "x", prompt: "y" }]).length === 0);
  check("duplicate id keeps only the first", sanitiseQuickStarts([{ id: "a", label: "First", prompt: "1" }, { id: "a", label: "Second", prompt: "2" }]).length === 1);
  check("label is trimmed and capped at 40 chars", sanitiseQuickStarts([{ id: "a", label: "  " + "x".repeat(60) + "  ", prompt: "" }])[0]!.label.length === 40);
  check("prompt is capped at 300 chars", sanitiseQuickStarts([{ id: "a", label: "x", prompt: "y".repeat(500) }])[0]!.prompt.length === 300);
  check("id is lowercased", sanitiseQuickStarts([{ id: "GrowBiz", label: "x", prompt: "" }])[0]!.id === "growbiz");
  check("non-array input -> empty", sanitiseQuickStarts("nope" as never).length === 0);
  check("non-object items skipped", sanitiseQuickStarts([null, 5, "x", { id: "ok", label: "OK", prompt: "" }] as never).length === 1);
  check("at most 8 kept", sanitiseQuickStarts(Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, label: `Q${i}`, prompt: "" }))).length === 8);

  // Server never invents a business-specific prompt — this is purely a validator, it does not
  // fabricate content; every field comes only from what was configured.
  const passthrough = sanitiseQuickStarts([{ id: "custom", label: "Whatever The Tenant Wants", prompt: "Totally tenant-specific text" }]);
  check("sanitiser is content-agnostic: passes through exactly what the tenant configured", passthrough[0]!.label === "Whatever The Tenant Wants" && passthrough[0]!.prompt === "Totally tenant-specific text");
}

// ---- source-level: genuinely generic, no hardcoded business content in shared widget code
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const chatWindow = strip(readFileSync("src/components/web-chat/chat-window.tsx", "utf8"));
const embedPage = strip(readFileSync("src/app/(embed)/embed/chat/[subAccountId]/page.tsx", "utf8"));
check("chat-window.tsx never hardcodes DivineX/ASCEND/Flow copy (fully tenant-configurable)", !/DivineX|ASCEND\b|\bFlow\b/.test(chatWindow));
check("embed page passes the configured quickStarts through, not a hardcoded list", /quickStarts=\{config\.webChat\.quickStarts/.test(embedPage));
check("clicking a chip goes through the SAME sendMessage() pipeline as typed text (no second path)", /handleQuickStart[\s\S]{0,200}sendMessage\(qs\.prompt\)/.test(chatWindow));
check("an empty prompt only focuses the input; it does not call sendMessage", /qs\.prompt\.trim\(\)\)\s*\{\s*void sendMessage/.test(chatWindow) && /inputRef\.current\?\.focus\(\)/.test(chatWindow));
check("sending a normal message also collapses the quick-start row", /setShowQuickStarts\(false\)/.test(chatWindow.slice(0, chatWindow.indexOf("const userMsg: LocalMessage"))));
check("a way to bring the options back exists without clearing message history", /setShowQuickStarts\(true\)/.test(chatWindow) && !/setMessages\(\[\]\)/.test(chatWindow));
check("chip row uses flexWrap (compact on mobile, no tall button stack)", /flexWrap[\s\S]{0,40}wrap[\s\S]{0,120}quickStarts\.map/.test(chatWindow));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
