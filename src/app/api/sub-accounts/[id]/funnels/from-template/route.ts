import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { createFunnelServerSide, updateFunnelServerSide } from "@/lib/server/funnels-service";
import { getFunnelTemplate } from "@/lib/funnels/templates";
import type { HeroConfig } from "@/types/funnels";

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

  // Seed the hero with the template's starter copy so the first thing the
  // operator sees is a real page, not a page of "Write your headline here".
  // Only the hero: inventing copy for every section would put words in the
  // business's mouth about things a template cannot know.
  const created = await getAdminDb().doc(`funnels/${funnelId}`).get();
  const sections = (created.data()?.sections ?? []) as { id: string; type: string; config: Record<string, unknown> }[];
  const hero = sections.find((s) => s.type === "hero");
  if (hero) {
    const c = hero.config as unknown as HeroConfig;
    await updateFunnelServerSide({
      subAccountId,
      funnelId,
      patch: {
      sections: sections.map((s) =>
        s.id === hero.id
          ? {
              ...s,
              config: {
                ...c,
                headline: template.headline,
                subheadline: template.subheadline,
                ctaLabel: template.ctaLabel,
              },
            }
          : s,
      ) as never,
      },
    });
  }

  return NextResponse.json({ ok: true, funnelId, templateId: template.id });
}
