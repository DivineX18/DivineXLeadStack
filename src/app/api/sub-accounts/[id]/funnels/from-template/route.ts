import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { createFunnelServerSide, updateFunnelServerSide } from "@/lib/server/funnels-service";
import { getFunnelTemplate } from "@/lib/funnels/templates";
import type { HeroConfig } from "@/types/funnels";
import { starterConfigFor } from "@/lib/funnels/template-starter-content";
import type { FunnelSectionType } from "@/types/funnels";

/**
 * POST — start a new funnel from a template.
 *
 * A template is a preset of arguments to the SAME creation path an operator or
 * Zeno already uses, so what comes out is an ordinary draft funnel: same
 * renderer, same publish boundary, same builder, same Critic. There is
 * deliberately no template-specific document type — nothing here can rot
 * separately from the rest of Funnels.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as { templateId?: string; name?: string } | null;
  const template = body?.templateId ? getFunnelTemplate(body.templateId) : undefined;
  if (!template) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const sub = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!sub.exists) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (sub.data()?.funnelsEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Funnels aren't enabled for this workspace yet. Ask your agency owner to switch them on." },
      { status: 403 },
    );
  }

  const funnelId = await createFunnelServerSide({
    subAccountId,
    createdByUid: access.uid,
    name: (body?.name || template.name).slice(0, 120),
    genre: template.genre,
    designPack: template.designPack,
    ...(template.depth ? { depth: template.depth } : {}),
    ...(template.complexity ? { complexity: template.complexity } : {}),
  });

  // SEED THE WHOLE PAGE, NOT JUST THE HERO.
  //
  // This used to seed the hero alone, on the reasoning that inventing copy
  // for every section would put words in the business's mouth. That reasoning
  // is right about FACTS and wrong about STRUCTURE, and the cost of
  // conflating them was that every template published as a hero, an empty
  // offer card and a "Ready? / Get started" banner — empty sections render
  // null, so the architecture the template existed to provide was invisible.
  //
  // starterConfigFor() writes prompts and structure only, never anything a
  // visitor could read as a fact about the business. Proof placeholders say
  // "Paste a real customer quote here" precisely so an unedited page is
  // obviously a draft to its owner rather than quietly false to a reader, and
  // logo/badge rows stay empty because no honest placeholder logo exists.
  //
  // Generated pages are untouched: they never call this.
  const created = await getAdminDb().doc(`funnels/${funnelId}`).get();
  const sections = (created.data()?.sections ?? []) as { id: string; type: string; config: Record<string, unknown> }[];
  if (sections.length > 0) {
    await updateFunnelServerSide({
      subAccountId,
      funnelId,
      patch: {
        sections: sections.map((s) => {
          if (s.type === "hero") {
            const c = s.config as unknown as HeroConfig;
            return {
              ...s,
              config: {
                ...c,
                headline: template.headline,
                subheadline: template.subheadline,
                ctaLabel: template.ctaLabel,
              },
            };
          }
          const starter = starterConfigFor(s.type as FunnelSectionType, template);
          return starter ? { ...s, config: { ...s.config, ...starter } } : s;
        }) as never,
      },
    });
  }

  return NextResponse.json({ ok: true, funnelId, templateId: template.id });
}
