import { redirect } from "next/navigation";

/**
 * Ascend OS launch pass, Pass 2C — the workspace-switching round trip.
 *
 * Purely a redirect target, never rendered as real UI. Exists so that
 * picking a sub-account from the /agency picker (after arriving there via
 * the Ascend shell's "Switch workspace"/"Agency home" links) can land back
 * in /app/home in one click, instead of stranding the visitor on the plain
 * CRM dashboard with no way back except manually re-typing both URLs.
 *
 * Why this needs to be a real /sa/[subAccountId]/... route rather than a
 * client-side redirect from /agency directly: middleware.ts mirrors any
 * /sa/[id]/... visit into the "active_workspace_id" cookie that /app/*'s
 * layout reads to resolve which workspace to activate. Redirecting
 * client-side straight to /app/home would skip that middleware pass
 * entirely, leaving the cookie pointed at whatever workspace was active
 * before — this route's own request is what sets it correctly first.
 *
 * /app/layout.tsx's own resolveShellContextForLayout() independently
 * re-verifies the caller's real entitlement for the selected workspace
 * (see decide-shell-mode.ts) and falls back to crm_only automatically if
 * it isn't full_ascend-eligible — this route does not duplicate that
 * check, it only decides WHERE to send the browser next.
 */
export default async function SwitchWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { subAccountId } = await params;
  const { next } = await searchParams;
  const nextValue = Array.isArray(next) ? next[0] : next;

  // Only ever forward to a known-safe internal destination — never an
  // open redirect off an arbitrary query value.
  const target = nextValue === "/app/home" ? nextValue : `/sa/${subAccountId}/dashboard`;
  redirect(target);
}
