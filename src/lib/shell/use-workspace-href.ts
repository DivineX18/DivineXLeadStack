"use client";

import { usePathname } from "next/navigation";
import { resolveAscendShellHref } from "@/lib/shell/ascend-shell-paths";

/**
 * AN IN-WORKSPACE LINK MUST FOLLOW THE SHELL IT WAS CLICKED IN.
 *
 * `SubAccountProvider` already does this through `saPath()`, but a large
 * number of components build `/sa/${saId}/...` by hand instead, and the
 * Ascend-native `/app/*` pages mount several of them OUTSIDE that provider —
 * they take `saId` as a prop and render directly. Those hand-built links are
 * absolute legacy URLs, so clicking one inside Ascend navigates straight out
 * of the shell into Flow's own layout, sidebar and wordmark.
 *
 * That is what happened to Workflows: the route table maps the whole
 * `/workflows` subtree to `/app/launch/workflows`, and the Ascend pages all
 * exist, but the list's own row link and its post-create `router.push` named
 * `/sa/{id}/workflows/{id}` directly, so the rewriter never saw them. A
 * correct table cannot save a link that refuses to consult it.
 *
 * This resolves the same decision `saPath()` makes, without needing the
 * provider: the shell is read from the URL the component is currently
 * rendered under. Outside `/app`, it returns the identical string the
 * hand-built template produced, so Flow's own surface is untouched.
 */
export function useWorkspaceHref(subAccountId: string): (path: string) => string {
  const pathname = usePathname();
  const inAscendShell = pathname === "/app" || pathname?.startsWith("/app/") === true;

  return (path: string) => {
    if (!path.startsWith("/")) return path;
    if (inAscendShell) return resolveAscendShellHref(subAccountId, path);
    return `/sa/${subAccountId}${path}`;
  };
}
