"use client";

import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { SubAccountManageDialog } from "@/components/agency/sub-account-manage-dialog";
import type { SubAccountDoc } from "@/types";

/**
 * Thin fetch-and-open wrapper around the EXISTING SubAccountManageDialog
 * (the same component the /agency/sub-accounts list page uses) — Command
 * Center never re-implements the gates/billing/danger-zone UI, it just
 * needs to fetch the SubAccountDoc the dialog requires as a prop before
 * opening it, since (unlike the agency list page) this surface doesn't
 * keep a live Firestore listener per row.
 */
export function CommandCenterManageTrigger({
  subAccountId,
  onAfterClose,
  children,
}: {
  subAccountId: string;
  /** Optional — a Server Component caller (e.g. the workspace detail page)
   *  can't pass a function across the RSC boundary, so this defaults to a
   *  no-op there; a client caller (the workspace list) passes a real
   *  refetch. */
  onAfterClose?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subAccount, setSubAccount] = useState<SubAccountDoc | null>(null);

  async function handleOpen() {
    setLoading(true);
    try {
      const res = await fetch(`/api/command-center/workspaces/${subAccountId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load workspace");
      setSubAccount(body.subAccount);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleOpen} disabled={loading} className="disabled:opacity-50">
        {children}
      </button>
      <SubAccountManageDialog
        subAccount={subAccount}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onAfterClose?.();
        }}
      />
    </>
  );
}
