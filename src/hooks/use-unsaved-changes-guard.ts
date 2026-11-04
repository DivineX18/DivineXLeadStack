"use client";

import { useEffect } from "react";

/**
 * ASK BEFORE DISCARDING WORK — INCLUDING ON AN IN-APP CLICK.
 *
 * The funnel editor shipped with a `beforeunload` handler, which QA confirmed
 * covers tab close and reload, and then confirmed what it does NOT cover:
 * clicking the sidebar threw the edits away in silence. `beforeunload` only
 * fires when the DOCUMENT goes away, and App Router navigation never unloads
 * the document — it swaps a subtree. From the browser's point of view nothing
 * left, so nothing was asked.
 *
 * WHY A CAPTURE-PHASE CLICK LISTENER AND NOT A ROUTER HOOK. App Router exposes
 * no navigation event to cancel: there is no `router.events`, and
 * `useRouter().push` cannot be intercepted from outside the component that
 * calls it. What every in-app navigation DOES pass through is a click on an
 * anchor, because `next/link` renders one. Catching that click before React or
 * Next sees it is the only place a navigation can still be stopped.
 *
 * WHY `window.confirm` AND NOT A STYLED DIALOG. Stopping a navigation requires
 * deciding inside the click handler, synchronously. A React dialog resolves a
 * turn later, by which point the navigation has already been committed and the
 * editor is gone. The browser's own prompt is the one that can actually block.
 *
 * REACH, STATED HONESTLY. This guards anchor-driven navigation — the sidebar,
 * the nav, breadcrumbs, any `next/link` — plus the document-level cases the
 * `beforeunload` half covers. It does NOT guard browser back/forward: by the
 * time `popstate` fires the navigation has happened, and the usual workaround
 * (pushing a sentinel entry and jumping back) breaks the back button for
 * everyone in order to protect the rare dirty case. Nor does it guard a
 * programmatic `router.push` elsewhere in the tree. Those are named here
 * rather than left for the next person to discover the way QA discovered this
 * one.
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    // A clean editor never nags. Registering nothing while clean also means a
    // saved page cannot be made un-navigable by a stale listener.
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers show their own wording and ignore ours; assigning
      // returnValue is what actually triggers the prompt.
      e.returnValue = "";
    };

    const onClickCapture = (e: MouseEvent) => {
      // Let the browser's own affordances through untouched: a modified click
      // opens a new tab or window and leaves this page — and these edits —
      // exactly where they are.
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      // A download is not a navigation, and neither is opening elsewhere.
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      // `href` resolves relative values against the document, so this is the
      // real destination rather than the authored string.
      let dest: URL;
      try {
        dest = new URL(anchor.href);
      } catch {
        return;
      }
      // Another origin unloads the document, so beforeunload already asks.
      // Asking twice would be worse than asking once.
      if (dest.origin !== window.location.origin) return;
      // Staying on this page: a tab, an accordion, an in-page anchor. Nothing
      // is being discarded, so nothing should be asked.
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;

      if (!window.confirm(message)) {
        e.preventDefault();
        // Stop it reaching Link's own handler, which would navigate anyway.
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, on the document, so this runs before Link's handler.
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, message]);
}
