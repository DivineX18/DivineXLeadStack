"use client";

import { useSubAccount } from "@/context/sub-account-context";
import { FunnelsList } from "@/components/funnels/funnels-list";

export default function FunnelsPage() {
  const { subAccountId } = useSubAccount();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <FunnelsList saId={subAccountId} />
    </div>
  );
}
