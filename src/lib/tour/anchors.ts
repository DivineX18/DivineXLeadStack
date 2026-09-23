/**
 * RESOLVING A TOUR ANCHOR WHEN THE NAV EXISTS TWICE.
 *
 * The sidebar renders twice: a desktop `<aside class="hidden ... md:block">`
 * and a Radix Sheet drawer. The Sheet unmounts when closed, but the desktop
 * copy does NOT — below the `md` breakpoint it is `display: none` and still
 * in the document.
 *
 * So `document.querySelector('[data-tour="nav-contacts"]')` is a trap: on a
 * phone it returns the hidden desktop item. Every lookup here goes through
 * `isActuallyVisible`, which checks rendered geometry rather than trusting
 * the selector.
 */

/** Visible means: laid out, on-screen, and not hidden by CSS. `offsetParent`
 *  alone is not enough — a `position: fixed` drawer has none even when shown. */
export function isActuallyVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
  // The off-screen drawer: translated fully outside the viewport.
  if (rect.right <= 0 || rect.bottom <= 0) return false;
  if (rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;
  return true;
}

/** The first VISIBLE element carrying this data-tour id, or null. Null is a
 *  normal answer: a nav item can be legitimately absent for this customer. */
export function findAnchor(tourId: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(tourId)}"]`));
  return all.find(isActuallyVisible) ?? null;
}

/** Below Tailwind's `md`, which is where the sidebar switches to the drawer. */
export function isMobileViewport(): boolean {
  return window.innerWidth < 768;
}

/** Open the mobile drawer by pressing the real button, so React state stays
 *  the source of truth rather than us mutating classes underneath it. */
export function openMobileNav(): void {
  const fab = document.querySelector<HTMLElement>('[data-tour="mobile-nav-toggle"]');
  if (fab && isActuallyVisible(fab)) fab.click();
}

/**
 * Wait for an anchor to become visible, up to `timeoutMs`.
 *
 * Needed because the drawer animates in, and because a step that follows a
 * navigation renders on the next paint. Resolves null rather than throwing:
 * a missing anchor must skip a step, never block the UI.
 */
export function waitForAnchor(tourId: string, timeoutMs = 1200): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = findAnchor(tourId);
    if (found) { resolve(found); return; }
    const started = Date.now();
    const tick = () => {
      const el = findAnchor(tourId);
      if (el) { resolve(el); return; }
      if (Date.now() - started >= timeoutMs) { resolve(null); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Make an anchor reachable, opening the mobile drawer first when the viewport
 * needs it. Returns the element or null if it never appeared.
 */
export async function prepareAnchor(tourId: string): Promise<HTMLElement | null> {
  const immediate = findAnchor(tourId);
  if (immediate) return immediate;
  if (isMobileViewport()) {
    openMobileNav();
    return waitForAnchor(tourId);
  }
  return waitForAnchor(tourId, 600);
}
