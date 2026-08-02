"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { FunnelOrdersList } from "@/components/funnels/funnel-orders-list";

export default function FunnelOrdersPage() {
  const { subAccountId } = useSubAccount();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div>
        <Link
          href={`/sa/${subAccountId}/funnels`}
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
