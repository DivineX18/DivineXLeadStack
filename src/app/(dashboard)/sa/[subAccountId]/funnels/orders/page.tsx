"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { FunnelOrdersList } from "@/components/funnels/funnel-orders-list";

export default function FunnelOrdersPage() {
  // saPath(), NEVER a hand-built /sa/{id}/... string.
  //
  // This page is mounted twice: at /sa/{id}/funnels/orders in Flow, and — via
  // UnifiedFeature — at /create/orders inside the Ascend shell. The back-link
  // below was hardcoded to the legacy path, so an Ascend customer who opened
  // Orders and clicked back was returned to the FLOW funnels list: same list
  // component, different route group, different layout, different sidebar.
  // That is the "it shows the previous UI" report. The hop INTO Orders was
  // already correct; only the hop back was hand-written.
  //
  // saPath() resolves to the identical legacy path in Flow and to the Ascend
  // funnels destination inside the Ascend shell, which is exactly the adapter
  // contract every other component here already follows.
  const { subAccountId, saPath } = useSubAccount();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <Link
          href={saPath("/funnels")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Funnels
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Every completed Stripe checkout across your funnels, newest first.
        </p>
      </div>
      <FunnelOrdersList saId={subAccountId} />
    </div>
  );
}
