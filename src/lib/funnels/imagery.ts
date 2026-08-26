import "server-only";

/**
 * Auto-imagery for funnels (Pexels) — the "warmth" layer of the art-direction
 * upgrade. Fetches SUBJECT/AMBIENT stock photography (a roof, a Phoenix home,
 * a calm dental office) chosen by the campaign's imagery brief, so generated
 * pages stop feeling AI-cold before the operator adds their own photos.
 *
 * HONESTY GUARD (user-approved, enforced structurally by the call sites):
 * stock imagery is ONLY placed as environmental/subject media — the hero and
 * benefits-row visuals. It is NEVER placed in testimonial, team, or proof
 * contexts (a stock "technician" presented as the business's own crew is
 * fabricated proof, which this platform does not do). Every placement is
 * flagged (`mediaIsStock`/`imageIsStock`) so the builder labels it
 * "stock — replace with your real photo" and the operator's uploads override.
 *
 * PEXELS_API_KEY is optional + agency-level (free at pexels.com/api; Pexels
 * photos are free for commercial use, no attribution required). Absent key,
 * network failure, or zero results all degrade to today's behavior — imagery
 * is always best-effort and never blocks funnel creation.
 */

export function imageryConfigured(): boolean {
  return !!process.env.PEXELS_API_KEY;
}

export interface StockImage {
  url: string;
  alt: string;
  photographer: string;
}

/** Search Pexels for up to `count` DISTINCT landscape photos matching the
 *  campaign's imagery brief. Returns [] on any failure — never throws. */
export async function searchSubjectImages(query: string, count = 4): Promise<StockImage[]> {
  const key = process.env.PEXELS_API_KEY;
  const q = query.trim();
  if (!key || !q) return [];
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${Math.min(count * 3, 15)}&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { photos?: { id?: number; alt?: string; photographer?: string; src?: { large2x?: string; large?: string } }[] };
    const photos = Array.isArray(json?.photos) ? json.photos : [];
    const out: StockImage[] = [];
    const seen = new Set<number>();
    for (const p of photos) {
      const url = p?.src?.large2x || p?.src?.large;
      if (!url || (typeof p.id === "number" && seen.has(p.id))) continue;
      if (typeof p.id === "number") seen.add(p.id);
      out.push({ url, alt: p.alt || q, photographer: p.photographer || "" });
      if (out.length >= count) break;
    }
    return out;
  } catch {
    return [];
  }
}
