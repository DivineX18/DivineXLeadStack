"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { subscribeToForms } from "@/lib/firestore/forms";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";
import type { FunnelDoc } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

/**
 * Authenticated draft preview — renders the exact same PublicFunnelView the
 * real /lp/[funnelId] page uses (no second renderer to keep in sync), but
 * reads through the authed sub-account API instead of loadFunnelForRender,
 * which 404s on anything not `status: "published"` by design (an
 * unpublished funnel's existence is never leaked publicly). Deliberately
 * OUTSIDE the (dashboard) route group/its sidebar+header chrome — a
 * funnel is a full-bleed page, so a preview wrapped in the CRM shell would
 * misrepresent it. Auth is still enforced: middleware requires a session
 * for any non-public path, and the underlying GET /api/sub-accounts/[id]/
 * funnels/[funnelId] call re-checks sub-account membership server-side.
 *
 * Reflects the funnel's last SAVED state, same as any other builder
 * preview — unsaved edits in the open editor tab aren't shown until Save.
 */
export default function FunnelPreviewPage({
  params,
}: {
  params: Promise<{ subAccountId: string; funnelId: string }>;
}) {
  const { subAccountId, funnelId } = use(params);
  const [funnel, setFunnel] = useState<FunnelDoc | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [forms, setForms] = useState<LeadForm[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/funnels/${funnelId}`);
      const d = (await res.json().catch(() => ({}))) as { funnel?: FunnelDoc };
      if (cancelled) return;
      if (!res.ok || !d.funnel) {
        setLoadError(true);
        return;
      }
      setFunnel(d.funnel);
    })();
    return () => {
      cancelled = true;
    };
  }, [subAccountId, funnelId]);

  useEffect(() => {
    return subscribeToForms({ agencyId: "", subAccountId }, setForms);
  }, [subAccountId]);

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this funnel — you may not have access, or it may have been deleted.
        <br />
        <Link href={`/sa/${subAccountId}/funnels/${funnelId}`} className="text-primary underline-offset-2 hover:underline">
          Back to editor
        </Link>
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const formsById = Object.fromEntries(forms.map((f) => [f.id, f]));

  return (
    <div>
      <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <span className="font-medium">
          {funnel.status === "published" ? "Preview — this funnel is live" : "Draft preview — not published yet"}
        </span>
        <Link
          href={`/sa/${subAccountId}/funnels/${funnelId}`}
          className="flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to editor
        </Link>
      </div>
      <PublicFunnelView funnel={funnel} forms={formsById} />
    </div>
  );
}
