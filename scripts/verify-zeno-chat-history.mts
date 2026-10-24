/**
 * QA BUG-004 — "Zeno chat has no history." Audited first, per the task's own
 * instruction: Flow's AI Suite chat (ai-suite-chat.tsx) DID already persist
 * across refresh via /api/ai-suite/thread — but as a single doc per
 * (user, level, sub-account), overwritten on every autosave, with "New chat"
 * issuing a hard DELETE on it. There was never more than one conversation
 * reachable, and starting a new one permanently destroyed the old one. This
 * verifies the fix reuses that exact storage shape (same path, same auth
 * gating, same sanitizer) turned into a small `sessions` subcollection
 * instead of building a second, parallel persistence model.
 *
 * Structural, source-level — same class as every other verify-*.mts here.
 * Run: npx tsx scripts/verify-zeno-chat-history.mts
 */
import { readFileSync } from "node:fs";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) failures++;
}
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const store = read("src/lib/ai-suite/thread-store.ts");
const main = read("src/app/api/ai-suite/thread/route.ts");
const list = read("src/app/api/ai-suite/thread/sessions/route.ts");
const reopen = read("src/app/api/ai-suite/thread/sessions/[sessionId]/route.ts");
const client = read("src/components/ai-suite/ai-suite-chat.tsx");

// ── Reuse, not a parallel system ──────────────────────────────────────────
check(
  "1a. the base path is the EXACT original single-doc path, now used as a pointer, not a new top-level collection",
  /subAccounts\/\$\{subAccountId\}\/aiSuiteThreads\/\$\{access\.uid\}/.test(store) &&
    /agencies\/\$\{owner\.agencyId\}\/aiSuiteThreads\/\$\{owner\.uid\}/.test(store),
);
check("1b. the same auth gate (membership + agency-owner + the AI Suite gate) is shared by every route via one resolver", /resolveThreadBase/.test(main) && /resolveThreadBase/.test(list) && /resolveThreadBase/.test(reopen));
check("1c. message sanitization is the one shared function, not re-implemented per route", /sanitizeStoredMessage/.test(main) && !/function sanitizeStoredMessage/.test(main));

// ── "New chat" no longer destroys the conversation ────────────────────────
check(
  "2a. DELETE (New chat) clears the pointer only — it does not delete the session doc",
  /DELETE[\s\S]{0,400}activeSessionId: null[\s\S]{0,100}merge: true/.test(main) && !/DELETE[\s\S]{0,600}\.delete\(\)/.test(main.slice(main.indexOf("export async function DELETE"))),
);

// ── History is real: listed, titled, dated, reopenable ───────────────────
check("3a. a list endpoint exists, newest first, capped", /orderBy\("updatedAt", "desc"\)/.test(list) && /limit\(MAX_SESSIONS_LISTED\)/.test(list));
check("3b. each listed session carries a derived title and a last-updated date", /title: typeof data\.title/.test(list) && /updatedAt:/.test(list));
check("3c. a reopen endpoint exists and returns that session's own messages", /snap\.data\(\)\?\.messages/.test(reopen));
check("3d. reopening makes it the ACTIVE session (continuing it won't fork a new one)", /activeSessionId: sessionId/.test(reopen));
check("3e. a foreign/missing session id 404s rather than leaking another user's thread", /Conversation not found/.test(reopen));

// ── Title derivation is honest (first real user message, not invented) ───
check("4a. deriveSessionTitle reads the first USER text message, not an assistant line", /messages\.find\(\s*\(m\) => m\.role === "user"/.test(store));

// ── Client wiring: discoverable + reopenable + doesn't fork sessions every autosave tick ─
check("5a. a History entry point exists in the UI", /History/.test(client) && /openHistory/.test(client));
check("5b. it's reachable from BOTH the empty/landing state and the active thread state", (client.match(/historyButton/g) ?? []).length >= 3);
check("5c. the client tracks which session is open and sends it on every autosave", /\[sessionId, setSessionId\]/.test(client) && /sessionId,?\s*}\)/.test(client));
check("5d. the autosave PUT carries the resolved sessionId back into state so repeated saves update ONE doc", /data\?\.sessionId && data\.sessionId !== sessionId/.test(client));
check("5e. reopening a past conversation replaces the visible thread with ITS messages", /setMessages\(data\.messages\)/.test(client) && /reopenSession/.test(client));
check("5f. New chat clears the session pointer client-side too, so the next message starts fresh rather than appending to the old one", /setSessionId\(null\)/.test(client));

console.log(failures === 0 ? `\nverify-zeno-chat-history: all checks passed` : `\nverify-zeno-chat-history: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
