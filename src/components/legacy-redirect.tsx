"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

/** Mirrors resolve-shell-context.ts's server-side hostname derivation,
 *  client-side — NEXT_PUBLIC_* vars are inlined at build time so this is
 *  safe to read in the browser. Fails closed to an unmatchable string
 *  (never "") if the var is missing/unparseable, matching that file's own
 *  "never guess" discipline. */
function safeAscendHostname(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_ASCEND_APP_URL ?? "").hostname.toLowerCase();
  } catch {
    return "\0unresolvable";
  }
}

/**
 * Stub page that redirects users hitting a legacy single-tenant path
 * (e.g. /contacts, /dashboard/settings) to the same path under the user's
 * first sub-account membership (e.g. /sa/{first}/contacts).
 *
 * Used for two cases:
 *   1. External / hard-coded links that still point at the legacy path
 *      (the landing-page navbar's "Go to Dashboard" button).
 *   2. Components inside the moved dashboard pages that haven't yet been
 *      updated to template their hrefs with the active sub-account.
 *
 * If the user has no memberships yet they're sent to /agency where they can
 * see the empty-state and create or join a sub-account.
 */
export function LegacyRedirect({
  /** Path suffix to append after /sa/{subAccountId}, e.g. "/contacts/abc". */
  toSubPath,
}: {
  toSubPath: string;
}) {
  const router = useRouter();
  const { loading, memberships, agencyRole } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!memberships[0]) {
      // No sub-accounts: agency owner lands on /agency to create one;
      // anyone else lands on /agency to see the no-access state.
      router.replace("/agency");
      return;
    }
    // Best-effort, not a guarantee: memberships arrives in whatever order
    // the userMemberships onSnapshot listener happened to return docs in
    // (Firestore default order, NOT sorted) — for an agency owner with
    // several sub-accounts, memberships[0] could be any of them. Sorting
    // by accountNumber picks the lowest-numbered one (Main is
    // conventionally #1000, the account most likely to be the real,
    // Ascend-entitled workspace), which is a meaningfully better guess
    // than raw snapshot order without adding a client-side entitlement
    // round trip to a redirect stub. Never a correctness issue either
    // way — every downstream route this picks re-verifies real access.
    const target = [...memberships].sort((a, b) => (a.accountNumber ?? 0) - (b.accountNumber ?? 0))[0];

    // Ascend OS — the bare /dashboard landing (what login lands on by
    // default, and every hardcoded "Go to Dashboard" link) previously
    // always sent the visitor into plain Flow regardless of hostname, so
    // a Full Ascend customer signing in fresh at app.divinex.io never
    // actually landed in the unified shell without manually typing
    // /app/home. On the Ascend hostname, route through the same
    // /sa/{id}/switch?next=/app/home redirector "Switch workspace" already
    // uses — that route re-verifies real entitlement server-side and
    // falls back to crm_only automatically for a non-entitled workspace,
    // so this never needs its own entitlement check here. MUST be checked
    // before the agency-owner-to-/agency shortcut below, which would
    // otherwise always win for the agency owner and make this branch
    // unreachable for the account that most needs the unified shell.
    if (
      toSubPath === "/dashboard" &&
      typeof window !== "undefined" &&
      window.location.hostname === safeAscendHostname()
    ) {
      router.replace(`/sa/${target.subAccountId}/switch?next=${encodeURIComponent("/app/home")}`);
      return;
    }
    // Agency owners with no current sub-account context land on /agency
    // when they hit the bare /dashboard URL on the CRM host — gives them
    // the picker.
    if (agencyRole === "owner" && toSubPath === "/dashboard") {
      router.replace("/agency");
      return;
    }
    router.replace(`/sa/${target.subAccountId}${toSubPath}`);
  }, [loading, memberships, agencyRole, toSubPath, router]);

  return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="space-y-2 text-center">
        <div className="mx-auto h-6 w-24 animate-pulse rounded bg-muted" />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
