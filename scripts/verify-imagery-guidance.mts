/**
 * IMAGERY GUIDANCE — unit certification.
 *
 * The property: when a section would benefit from a real photograph and none
 * exists, the customer is TOLD, and when the slot is already filled they are
 * not nagged. Nothing here may invent or imply imagery.
 */
const { imageryGuidance } = await import("../src/lib/funnels/imagery-guidance.ts");
let bad = 0;
const check = (l: string, ok: boolean, n = "") => { console.log(`${ok?"PASS":"FAIL"} ${l}${n?` — ${n}`:""}`); if(!ok) bad++; };
const sec = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, type, config }) as never;

// Page with no imagery anywhere.
const bare = [sec("h","hero"), sec("p","problem_solution"), sec("s","story"), sec("o","offer"), sec("c","cta_banner")];
const hints = imageryGuidance({ sections: bare });
check("advice is produced when a page has no imagery", hints.length > 0, `${hints.length} hint(s)`);
check("hero is flagged", hints.some(h => h.sectionType === "hero"));
check("every hint carries an actionable brief", hints.every(h => h.brief.length > 10 && h.message.length > 10));
check("hints map to real sections on the page",
  hints.every(h => h.sectionId === null || bare.some(s => (s as unknown as {id:string}).id === h.sectionId)));
for (const h of hints) console.log(`   ${h.sectionType.padEnd(18)} ${h.necessity.padEnd(11)} ${h.message.slice(0,58)}`);

// A filled hero must not be nagged.
const filled = [sec("h","hero",{ mediaUrl:"https://x.test/a.jpg" }), sec("s","story",{ photoUrl:"https://x.test/b.jpg" }), sec("o","offer")];
const after = imageryGuidance({ sections: filled });
check("a filled slot produces no advice", !after.some(h => h.sectionType === "hero" || h.sectionType === "story"),
  after.map(h=>h.sectionType).join(", ") || "none");

// Guidance must never claim imagery exists.
check("no hint fabricates an image url", !JSON.stringify(hints).includes("http"));
// Empty page is safe.
check("an empty page yields no advice", imageryGuidance({ sections: [] }).length === 0);
// Text-led hero is a legitimate decision, not a gap.
const textLed = imageryGuidance({ sections: bare, heroPrefersText: true });
check("a deliberately text-led hero is not flagged as missing",
  !textLed.some(h => h.sectionType === "hero"), textLed.map(h=>h.sectionType).join(", ") || "none");
console.log(`\n${bad===0?"IMAGERY GUIDANCE: PASS":`IMAGERY GUIDANCE: ${bad} FAILURE(S)`}`);
process.exit(bad?1:0);
