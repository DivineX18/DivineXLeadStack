/**
 * SAY WHAT WENT WRONG.
 *
 * This codebase swallowed errors at ~60 call sites — `catch { toast.error("Couldn't
 * do the thing.") }` — so a permission denial, an offline browser, a failed
 * validation and a genuine server fault all looked identical to the operator
 * and identical to whoever they reported it to. A VA lost a day to one of
 * these, and every occurrence costs a round trip to a browser console before
 * anyone can even begin diagnosing it.
 *
 * The messages here are written for the person holding the mouse, not for a
 * log: they say what to do, or at minimum name the failure precisely enough
 * that the next person can act. The raw code is appended in brackets so a
 * screenshot alone is enough to diagnose from.
 */

/** Firestore/Firebase client error codes worth translating into something an
 *  operator can act on. Anything unlisted falls through to its own message. */
const FIREBASE_MESSAGES: Record<string, string> = {
  "permission-denied":
    "You don't have permission to do that in this workspace. An admin of this sub-account (or the agency owner) can, so ask them to run it or to raise your role.",
  unauthenticated: "Your session expired. Sign in again and retry.",
  unavailable: "Couldn't reach the database. You may be offline. Check your connection and retry.",
  "deadline-exceeded": "That took too long and timed out. Retry; if it keeps happening the service is degraded.",
  "failed-precondition":
    "The database rejected that because something it depends on is missing, often an index that hasn't finished building yet.",
  "resource-exhausted": "Quota exceeded for this project. It will recover, or the owner needs to raise the limit.",
  "not-found": "That record no longer exists. Refresh the page.",
  "already-exists": "That already exists.",
  aborted: "Two changes collided. Refresh and retry.",
};

function codeOf(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && c) return c.replace(/^firestore\//, "").replace(/^auth\//, "");
  }
  return null;
}

/**
 * Turn any thrown value into something worth showing a human.
 *
 * `fallback` is used only when nothing better can be extracted, so a caller
 * keeps its existing wording for the genuinely unknown case rather than
 * degrading to a bare code.
 */
export function describeError(err: unknown, fallback: string): string {
  const code = codeOf(err);
  if (code) {
    const known = FIREBASE_MESSAGES[code];
    // The code travels with the message: a screenshot is then enough to
    // diagnose from, without asking anyone to open devtools.
    return known ? `${known} [${code}]` : `${fallback} [${code}]`;
  }

  if (err instanceof Error && err.message.trim()) {
    const m = err.message.trim();
    // Framework noise that tells an operator nothing.
    if (/^(Error|Request failed|Network ?Error|Failed to fetch)$/i.test(m)) {
      return /fetch|network/i.test(m) ? "Couldn't reach the server. Check your connection and retry." : fallback;
    }
    return m;
  }

  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

/**
 * The same thing for a failed `fetch` Response: prefer the server's own
 * `{ error }` body, which throughout this codebase is written to be read by
 * the operator, and fall back to the status.
 */
export async function describeResponse(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const raw = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
  if (raw.trim()) return raw.trim();
  if (res.status === 403) return "You don't have permission to do that in this workspace. [403]";
  if (res.status === 401) return "Your session expired. Sign in again and retry. [401]";
  if (res.status === 404) return "That no longer exists. Refresh the page. [404]";
  return `${fallback} [${res.status}]`;
}
