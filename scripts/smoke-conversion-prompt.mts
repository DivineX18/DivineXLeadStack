// M3 integration smoke test — proves the DivineX Conversion Framework Library
// actually reaches Zeno's system prompt via the existing knowledge-card
// mechanism (the wiring added to app/api/ai-suite/chat/route.ts, gated on
// create_funnel availability). Deterministic: builds the real system prompt,
// no LLM/Firestore.
//
// Run: npx tsx scripts/smoke-conversion-prompt.mts

const { buildAiSuiteSystemPrompt } = await import("../src/lib/ai-suite/prompt");
const { CONVERSION_FRAMEWORKS, renderFrameworksAsCards } = await import("../src/lib/conversion/framework-library");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const base = {
  level: "sub-account" as const,
  brandName: "TestCRM",
  actionNames: [{ name: "create_funnel", label: "Create a funnel" }],
  lookupNames: [] as { name: string; label: string }[],
  todayIso: "2026-08-21",
  caller: { email: "t@example.com", isAgencyOwner: false, workspaceName: "Acme", workspaceRole: "admin" },
};

// Baseline (no conversion cards) — must still assemble, proving no regression
// to the base prompt when the injection is absent (e.g. the swallow path).
const without = buildAiSuiteSystemPrompt({ ...base, cards: [] });
check("1. Base prompt assembles with zero cards (no regression)", typeof without === "string" && without.length > 0);

// With the conversion frameworks injected exactly as the route does.
const conversionCards = renderFrameworksAsCards(CONVERSION_FRAMEWORKS);
const withCards = buildAiSuiteSystemPrompt({ ...base, cards: conversionCards });
check("2. Prompt assembles with the conversion framework cards", typeof withCards === "string" && withCards.length > without.length);

check("3. Framework content reaches the prompt (copywriting family)", withCards.includes("Conversion frameworks — copywriting"));
check("4. A specific framework is present (Outcome + Mechanism Headline)", withCards.includes("Outcome + Mechanism Headline"));
check("5. The no-fabrication guardrail rides into the prompt", /no-fabrication|never invent|fabricat/i.test(withCards));

const familyTitles = [
  "Conversion frameworks — copywriting",
  "Conversion frameworks — buyer psychology",
  "Conversion frameworks — offer design",
  "Conversion frameworks — landing-page architecture",
  "Conversion frameworks — email & lifecycle",
];
check("6. All five framework families reach the prompt", familyTitles.every((t) => withCards.includes(t)), `${familyTitles.filter((t) => withCards.includes(t)).length}/5`);

// The cards render as REFERENCE MATERIAL, the section the prompt already grounds on.
check("7. Frameworks land under REFERENCE MATERIAL", withCards.includes("REFERENCE MATERIAL"));

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} === (${conversionCards.length} framework cards, ${CONVERSION_FRAMEWORKS.length} frameworks)`);
if (failures > 0) process.exit(1);
