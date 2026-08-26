// Screenshot-QA seeder (art-direction upgrade): copies the two locked
// benchmark funnels into TEMPORARY published docs with the CURRENT generation
// pipeline applied (applyArtDirection + benefits-from-bullets fallback +
// density override) — i.e. exactly what a fresh generation now produces — so
// the rendered pages can be screenshotted and judged visually, per the
// acceptance criterion (LOOK AT THE PAGE, not the JSON).
//
// Seed:    NODE_OPTIONS="--conditions=react-server" npx tsx scripts/preview-art-direction.mts
// Cleanup: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/preview-art-direction.mts --cleanup
//
// Never touches the user's real funnels — writes only to the two qa-art-* ids.

import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const { getAdminDb } = await import("../src/lib/firebase/admin");
const { applyArtDirection, deriveArtDirection } = await import("../src/lib/funnels/art-direction");
const { imageryConfigured, searchSubjectImages } = await import("../src/lib/funnels/imagery");
import type { FunnelSection, HeroConfig, BenefitsGridConfig } from "../src/types/funnels";

const db = getAdminDb();
const SUB = "x4NOJFn8bTyav7OeJc1v";

const BENCH = [
  // imageryBrief mirrors what the model's media_subject produces at generation.
  { qaId: "qa-art-dental", match: "Lakeside", transformation: "fear_to_safety" as const, imageryBrief: "calm modern dental office" },
  { qaId: "qa-art-hvac", match: "Summit HVAC", transformation: "panic_to_relief" as const, imageryBrief: "air conditioning repair technician home" },
];

if (process.argv.includes("--cleanup")) {
  for (const b of BENCH) await db.doc(`funnels/${b.qaId}`).delete().catch(() => {});
  console.log("QA docs deleted.");
  process.exit(0);
}

const snap = await db.collection("funnels").where("subAccountId", "==", SUB).get();
const all = snap.docs.map((d) => d.data()).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

for (const b of BENCH) {
  const src = all.find((f) => typeof f.name === "string" && f.name.includes(b.match) && !f.name.startsWith("[QA]"));
  if (!src) { console.error(`benchmark not found: ${b.match}`); continue; }

  let sections = (src.sections as FunnelSection[]).map((s) => ({ ...s, config: { ...s.config } }));
  // Generation-time benefits fallback: seed empty benefits from the offer's bullets.
  const offer = sections.find((s) => s.type === "offer");
  const offerBullets: string[] = ((offer?.config as { bullets?: string[] })?.bullets ?? []);
  sections = sections.map((s) =>
    s.type === "benefits_grid" && ((s.config as { items?: unknown[] }).items ?? []).length === 0 && offerBullets.length > 0
      ? { ...s, config: { ...s.config, headline: "What you can expect", items: offerBullets.map((t) => ({ title: t, description: "A calm, clearly explained step — you set the pace and nothing happens without your OK." })) } }
      : s,
  );

  const profile = deriveArtDirection({ transformation: b.transformation });

  // Mirror generation-time auto-imagery (hero + benefits rows, honesty-guarded).
  if (imageryConfigured()) {
    const photos = await searchSubjectImages(b.imageryBrief, 4);
    let photoIdx = 0;
    sections = sections.map((s) => {
      if (s.type === "hero") {
        const c = s.config as HeroConfig;
        if (!c.mediaUrl && c.mediaType !== "none" && photoIdx < photos.length) {
          const p = photos[photoIdx++];
          return { ...s, config: { ...c, mediaType: "image" as const, mediaUrl: p.url, mediaIsStock: true, mediaPlaceholderLabel: "" } };
        }
        return s;
      }
      if (s.type === "benefits_grid" && profile.energy !== "urgent") {
        const c = s.config as BenefitsGridConfig;
        return { ...s, config: { ...c, items: c.items.map((it) => (!it.imageUrl && photoIdx < photos.length ? { ...it, imageUrl: photos[photoIdx++].url, imageIsStock: true } : it)) } };
      }
      return s;
    });
    console.log(`  imagery: ${photos.length} photos fetched for "${b.imageryBrief}"`);
  }

  sections = applyArtDirection(sections, profile);

  const densityOverride = profile.density === "rich" ? "high" : profile.density === "minimal" ? "low" : null;
  const designStrategy =
    src.designStrategy && densityOverride && src.designStrategy.visualDensity !== densityOverride
      ? { ...src.designStrategy, visualDensity: densityOverride }
      : (src.designStrategy ?? null);

  await db.doc(`funnels/${b.qaId}`).set({
    ...src,
    id: b.qaId,
    name: `[QA] ${src.name}`,
    status: "published",
    sections,
    designStrategy,
    artDirection: profile,
  });
  console.log(`${b.qaId}: seeded (${b.transformation}) -> http://localhost:3000/lp/${b.qaId}`);
}
process.exit(0);
