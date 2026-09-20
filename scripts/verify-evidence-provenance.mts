/**
 * A CLASSIFICATION IS NOT A PROVENANCE.
 *
 * A generated page published "AS SEEN IN" over seven images scraped from the
 * customer's own website. Nothing was invented: every URL was real, approved
 * and first-party. The fabrication was the HEADING, reached through a chain of
 * individually-reasonable hops —
 *
 *   website image -> auto classification -> operator approves the asset
 *     -> classified "partner" -> backfilled into suppliedEvidenceLogos
 *     -> proof strip -> component default heading "As seen in"
 *
 * — which is the same mistake the tenant boundary made: an ATTRIBUTE read as
 * an AUTHORIZATION.
 *
 * This suite pins the invariant in both directions. It must stay impossible to
 * reach a third-party claim from classification, AND still possible to render
 * one from evidence the operator actually verified. A suite that only proved
 * the first would pass against an engine that had simply deleted the feature.
 *
 * Pure: no Firestore, no network, no model. Run:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-evidence-provenance.mts
 */
import { readFileSync } from "node:fs";
import {
  parseEvidenceProofInput,
  verifiedEvidenceFromStore,
  evidenceStripConfig,
  renderableEvidenceStrip,
} from "../src/lib/funnels/evidence-proof.ts";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/**
 * Source with comments removed.
 *
 * Checks that assert the ABSENCE of a pattern have to run against code, not
 * prose. These files deliberately quote the defect they fixed — "As seen in",
 * `heading ||` — in the comment explaining why it is gone, and two drafts of
 * this suite failed against their own documentation before this existed.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── 1-3. Classification can never become proof ────────────────────────────
{
  const consume = code("src/lib/divinex/consume-profile.ts");
  check(
    "1. discovered+classified 'partner'+approved yields NO evidence logos",
    /const evidenceLogos: \{ url: string; label: string \}\[\] = \[\];/.test(consume),
    "the producer is hard-empty",
  );
  check(
    "2. and no classification set is consulted to build them",
    !/EVIDENCE_CLASSES\.has\([^)]*\)\s*\)\s*\n?\s*\.slice/.test(consume) &&
      !/classification === "certification" \? "Certification" : "Partner"/.test(consume),
    "the classification->label mapping is gone",
  );

  const caps = code("src/lib/ai-suite/capabilities.ts");
  check(
    "3. the server does NOT backfill evidence when the model returns null",
    !/args\.suppliedEvidenceLogos\s*=/.test(caps),
    "no assignment to suppliedEvidenceLogos anywhere",
  );
  check(
    "3b. and generation reads evidence from the verified store instead",
    /evidenceStripConfig\(\s*verifiedEvidenceFromStore\(/.test(caps),
  );
  // The tempting near-miss: swapping one heuristic for another.
  check(
    "3c. no replacement heuristic (filename/alt/domain/confidence)",
    !/evidenceLogos\s*=\s*.*(filename|alt|domain|confidence|looksLikeLogo)/i.test(caps),
  );
}

// ── 4-5. Verified evidence still renders, with ITS OWN semantics ──────────
{
  const partner = [
    { url: "https://cdn.example.com/stripe.svg", label: "Stripe", category: "partner" },
    { url: "https://cdn.example.com/xero.svg", label: "Xero", category: "partner" },
  ];
  const parsedPartner = parseEvidenceProofInput(partner);
  check("4. explicit verified PARTNER evidence is admissible", parsedPartner.ok);
  const partnerCfg = evidenceStripConfig(verifiedEvidenceFromStore(partner));
  check("4b. and renders partner semantics", partnerCfg?.heading === "Partners", partnerCfg?.heading);

  const press = [{ url: "https://cdn.example.com/bbc.svg", label: "BBC", category: "press" }];
  const pressCfg = evidenceStripConfig(verifiedEvidenceFromStore(press));
  check("5. explicit verified PRESS evidence renders press semantics", pressCfg?.heading === "As featured in", pressCfg?.heading);

  const cert = [{ url: "https://cdn.example.com/iso.svg", label: "ISO 9001", category: "certification" }];
  check(
    "5b. certification renders certification semantics",
    evidenceStripConfig(verifiedEvidenceFromStore(cert))?.heading === "Certifications",
  );
  const award = [{ url: "https://cdn.example.com/aw.svg", label: "Queen's Award", category: "award" }];
  check("5c. award renders award semantics", evidenceStripConfig(verifiedEvidenceFromStore(award))?.heading === "Awards");
}

// ── 6. A weaker category is never upgraded into a press claim ─────────────
{
  const partnerCfg = evidenceStripConfig(
    verifiedEvidenceFromStore([{ url: "https://cdn.example.com/a.svg", label: "Acme", category: "partner" }]),
  );
  check("6. partner evidence does NOT render 'As seen in'", partnerCfg?.heading !== "As seen in" && !/seen in/i.test(partnerCfg?.heading ?? ""), partnerCfg?.heading);

  const strip = code("src/components/funnels/sections/proof-strip-section.tsx");
  check(
    "6b. the component has no `heading || <default>` fallback in CODE",
    !/heading\s*\|\|/.test(strip) && !/As seen in/.test(strip),
  );
  check("6c. and derives its heading from the verified contract", /renderableEvidenceStrip\(/.test(strip) && /evidence\.heading/.test(strip));

  // Mixed categories cannot be described by one heading.
  const mixed = evidenceStripConfig([
    { url: "https://cdn.example.com/a.svg", label: "Acme", category: "partner" },
    { url: "https://cdn.example.com/b.svg", label: "BBC", category: "press" },
  ]);
  check("6d. mixed categories render NOTHING rather than pick one", mixed === null);
}

// ── 7. No verified evidence -> no strip ───────────────────────────────────
{
  check("7. absent store renders no strip", evidenceStripConfig(verifiedEvidenceFromStore(null)) === null);
  check("7b. empty store renders no strip", evidenceStripConfig(verifiedEvidenceFromStore([])) === null);
  check(
    "7c. an uncategorised mark is refused outright",
    !parseEvidenceProofInput([{ url: "https://cdn.example.com/a.svg", label: "Acme" }]).ok,
  );
  check(
    "7d. an unnamed mark is refused (evidence nobody can name is not evidence)",
    !parseEvidenceProofInput([{ url: "https://cdn.example.com/a.svg", category: "partner" }]).ok,
  );
  check(
    "7e. a non-https URL is refused",
    !parseEvidenceProofInput([{ url: "http://x.com/a.svg", label: "A", category: "partner" }]).ok,
  );
  const caps = code("src/lib/ai-suite/capabilities.ts");
  check(
    "7f. an unverified strip left by a template is PRUNED, not shipped empty",
    /sectionsToSave = sectionsToSave\.filter\(\s*\n?\s*\(x\) => !\(x\.type === "proof_strip"/.test(caps),
  );
}

// ── 8. The existing validated reviewProof contract is untouched ───────────
{
  const rp = read("src/lib/funnels/review-proof.ts");
  check("8. review-proof still validates on the way out", /export function reviewProofFromStore/.test(rp) && /parseReviewProofInput\(stored\)/.test(rp));
  const strip = read("src/components/funnels/sections/proof-strip-section.tsx");
  check("8b. the rating variant still renders through its own path", /config\.variant === "rating"/.test(strip));
  const caps = code("src/lib/ai-suite/capabilities.ts");
  check("8c. and generation still reads it from the store", /ratingStripConfig\(verifiedReviewProof\)/.test(caps));
}

// ── 9. DEFENSE IN DEPTH — the renderer re-establishes the claim ───────────
{
  // Exactly the shape the old backfill produced: real https URLs, plausible
  // labels, no category. It must not render even though it reaches the
  // component fully formed.
  const fabricated = {
    variant: "logos",
    heading: "As seen in",
    logos: [
      { url: "https://divinex.io/wp-content/uploads/2026/08/4-3.png", alt: "Partner" },
      { url: "https://divinex.io/wp-content/uploads/2026/08/1-5.png", alt: "Partner" },
    ],
  };
  check("9. the ORIGINAL defect payload renders nothing", renderableEvidenceStrip(fabricated) === null);

  check(
    "9b. a categorised strip under the WRONG heading renders nothing",
    renderableEvidenceStrip({
      variant: "logos",
      heading: "As featured in",
      logos: [{ url: "https://cdn.example.com/a.svg", alt: "Acme", category: "partner" }],
    }) === null,
  );
  check(
    "9c. a correctly verified strip DOES render",
    renderableEvidenceStrip({
      variant: "logos",
      heading: "Partners",
      logos: [{ url: "https://cdn.example.com/a.svg", alt: "Acme", category: "partner" }],
    })?.heading === "Partners",
  );
  check(
    "9d. a legacy category-less strip stops rendering",
    renderableEvidenceStrip({ variant: "logos", heading: "Partners", logos: [{ url: "https://cdn.example.com/a.svg", alt: "Acme" }] }) === null,
  );
}

console.log(
  failures === 0 ? `\nverify-evidence-provenance: all checks passed` : `\nverify-evidence-provenance: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
