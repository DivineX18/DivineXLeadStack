import { redirect } from "next/navigation";
import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { FlowDashboard } from "./flow-dashboard";

export const dynamic = "force-dynamic";

/**
 * The workspace-scoped dashboard, with the shell resolved BEFORE anything
 * paints.
 *
 * This route used to be the client component alone, with no shell resolution
 * of any kind. So every way of arriving here directly, a bookmark, a login
 * return, an emailed workspace link, the /agency picker, rendered the Flow
 * CRM dashboard and stayed there, even for a customer whose workspace is
 * entitled to Ascend and who reached it on the Ascend hostname. There was no
 * later redirect to rescue them the way /dashboard has: this was a terminal
 * page. That is how an entitled customer could sit in Flow permanently.
 *
 * The workspace comes from the route params, not the active_workspace_id
 * cookie, because the URL is the more specific statement of intent and the
 * cookie may still be pointing at whatever workspace was open before.
 *
 * ENTITLEMENT, NOT HOSTNAME, DECIDES. decideShellMode() only returns
 * "full_ascend" when the request is on the Ascend host AND the workspace's
 * own evaluated tier is full_ascend AND the rollout flag is on for this
 * caller, and resolveShellContextForLayout() runs the full membership check
 * for the requested workspace first. So a non-member, a non-entitled
 * workspace, or a request on crm.divinex.io all fall through to Flow here,
 * unchanged.
 *
 * Any failure falls through to Flow rather than erroring: the CRM dashboard
 * is a working page, and a resolution hiccup should cost the customer the
 * better shell, never the whole screen.
 */
export default async function SubAccountDashboardPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;

  let toAscend = false;
  try {
    const shell = await resolveShellContextForLayout({ explicitWorkspaceId: subAccountId });
    toAscend = shell?.mode === "full_ascend";
  } catch {
    // fall through and render Flow
  }
  // Outside the try: redirect() signals by throwing, and catching it here
  // would silently turn the redirect back into a Flow render.
  if (toAscend) redirect("/app/home");

  return <FlowDashboard />;
}
