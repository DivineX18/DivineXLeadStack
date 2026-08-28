import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";

/**
 * Ascend Intelligence Library bridge (read side).
 *
 * Ascend's Framework Library (Postgres `frameworks` table on app.divinex.io —
 * strategy/funnels/offers/copywriting/positioning frameworks, the same
 * institutional knowledge Zeno-on-Ascend reasons from) is SYNCED into Flow's
 * Firestore at `intelligenceFrameworks/{slug}` by
 * `scripts/sync-ascend-frameworks.mts` (manual/on-demand, mirroring the
 * script-triggered Ascend→Flow CRM lead sync — no runtime coupling between
 * the two systems, no new env vars on this side).
 *
 * This loader feeds the synced frameworks into the SAME knowledge-card slot
 * of the generation context as Flow's own static CONVERSION_FRAMEWORKS, so
 * one Zeno persona reasons from one shared library across both products.
 * Zero synced docs = empty array = context unchanged (pre-sync behavior).
 */

export interface AscendFramework {
  slug: string;
  name: string;
  category: string;
  content: string;
  sortOrder: number;
}

const COLLECTION = "intelligenceFrameworks";

export async function listAscendFrameworks(): Promise<AscendFramework[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .where("active", "==", true)
    .get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        slug: d.id,
        name: String(x.name ?? d.id),
        category: String(x.category ?? "strategy"),
        content: String(x.content ?? ""),
        sortOrder: Number(x.sortOrder ?? 0),
      };
    })
    .filter((f) => f.content.trim().length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function renderAscendFrameworksAsCards(
  frameworks: AscendFramework[],
): AiSuiteKnowledgeCard[] {
  return frameworks.map((f) => ({
    id: `ascend-framework-${f.slug}`,
    levels: ["sub-account" as const],
    title: `DivineX Intelligence — ${f.name}`,
    location: `Ascend Intelligence Library (${f.category})`,
    keywords: ["ascend", "intelligence", "framework", f.category],
    body: f.content,
  }));
}
