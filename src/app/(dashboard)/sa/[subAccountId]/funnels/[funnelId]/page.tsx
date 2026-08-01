"use client";

import { use } from "react";
import { useSubAccount } from "@/context/sub-account-context";
import { FunnelBuilder } from "@/components/funnels/funnel-builder";

export default function FunnelEditorPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { subAccountId } = useSubAccount();
  const { funnelId } = use(params);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <FunnelBuilder saId={subAccountId} funnelId={funnelId} />
    </div>
  );
}
