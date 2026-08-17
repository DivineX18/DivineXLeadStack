import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  DesignPrinciple,
  DesignPrincipleCategory,
} from "@/types/design-intelligence";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";

/**
 * The Design Knowledge Vault — CRUD + the retrieval/rendering step that
 * feeds learned principles back into Zeno's create_funnel generation (see
 * src/app/api/ai-suite/chat/route.ts). This is the "gets better every week"
 * mechanism: every principle written here makes every future funnel
 * generation smarter, platform-wide.
 */

const COLLECTION = "designPrinciples";

export async function createPrinciple(input: {
  text: string;
  category: DesignPrincipleCategory;
  archetype?: string | null;
  industryTag?: string | null;
  source: DesignPrinciple["source"];
  createdFromFeedbackId?: string | null;
}): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  const doc: Omit<DesignPrinciple, "id"> = {
    text: input.text.trim(),
    category: input.category,
    archetype: input.archetype ?? null,
    industryTag: input.industryTag ?? null,
    source: input.source,
    timesReinforced: 1,
    active: true,
    createdFromFeedbackId: input.createdFromFeedbackId ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return ref.id;
}

export async function reinforcePrinciple(principleId: string): Promise<void> {
  const db = getAdminDb();
  await db.doc(`${COLLECTION}/${principleId}`).update({
    timesReinforced: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function setPrincipleActive(
  principleId: string,
  active: boolean,
): Promise<void> {
  const db = getAdminDb();
  await db.doc(`${COLLECTION}/${principleId}`).update({
    active,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listPrinciples(): Promise<DesignPrinciple[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data() as DesignPrinciple);
}

/**
 * Active principles relevant to a generation call — broadly-applicable ones
 * (archetype: null) plus any scoped to the given archetype. Capped so the
 * AI Suite prompt never bloats no matter how large the vault grows; ranked
 * by reinforcement count so the most-validated principles always make the
 * cut first.
 */
export async function listActivePrinciplesForArchetype(
  archetype: string | null,
  limit = 12,
): Promise<DesignPrinciple[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTION)
    .where("active", "==", true)
    .get();
  const all = snap.docs.map((d) => d.data() as DesignPrinciple);
  const relevant = all.filter(
    (p) => !p.archetype || !archetype || p.archetype === archetype,
  );
  return relevant
    .sort((a, b) => b.timesReinforced - a.timesReinforced)
    .slice(0, limit);
}

/**
 * Renders vault principles into the exact AiSuiteKnowledgeCard shape the
 * existing prompt builder already knows how to render (see
 * lib/ai-suite/prompt.ts's renderCards()) — reuses that "REFERENCE
 * MATERIAL" mechanism instead of adding a second parallel prompt section,
 * so create_funnel's system prompt gains this section with zero changes
 * to prompt.ts itself.
 */
export function renderPrinciplesAsCards(
  principles: DesignPrinciple[],
): AiSuiteKnowledgeCard[] {
  if (principles.length === 0) return [];
  const byCategory = new Map<DesignPrincipleCategory, DesignPrinciple[]>();
  for (const p of principles) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const CATEGORY_TITLES: Record<DesignPrincipleCategory, string> = {
    visual_system: "Learned design principles — visual systems",
    section_pattern: "Learned design principles — section patterns",
    typography_system: "Learned design principles — typography",
    cro_principle: "Learned design principles — conversion (CRO)",
    archetype_note: "Learned design principles — archetype notes",
  };
  const cards: AiSuiteKnowledgeCard[] = [];
  for (const [category, list] of byCategory) {
    cards.push({
      id: `design-principle-${category}`,
      levels: ["sub-account"],
      title: CATEGORY_TITLES[category],
      location: "Design Knowledge Vault (Command Center → Design Intelligence)",
      keywords: ["design", "funnel", "landing page", "archetype", category],
      body:
        "Apply these when relevant to this funnel's business/archetype — they were learned from real operator feedback and design reviews, not invented:\n" +
        list.map((p) => `- ${p.text}`).join("\n"),
    });
  }
  return cards;
}
