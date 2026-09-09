import { redirect } from "next/navigation";
import { LegacyRedirect } from "@/components/legacy-redirect";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";

export const dynamic = "force-dynamic";

/**
 * Legacy /dashboard entry point.
 *
 * The client redirect below cannot run until React has hydrated and
 * `useAuth()` has finished loading, so a Unified customer watched the Flow
 * dashboard paint and then get replaced by their own shell a second or two
 * later. Resolving the destination on the server removes the intermediate
 * paint entirely — the browser is redirected before anything renders.
 *
 * Only this route is server-resolved. The other eleven legacy stubs still use
 * the client redirect, which is correct for them: they are deep links to
 * specific sub-pages, not the post-login landing, so nobody sits watching one.
 *
 * Falls back to the client redirect on ANY failure rather than erroring: a
 * slower redirect is a far better outcome than a broken landing page.
 */
export default async function LegacyDashboard() {
  let target: string | null = null;
  try {
    const shell = await resolveShellContextForPage();
    if (shell?.mode === "full_ascend") target = "/app/home";
  } catch {
    // fall through to the client redirect
  }
  if (target) redirect(target);

  return <LegacyRedirect toSubPath="/dashboard" />;
}
