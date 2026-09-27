import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getTelegramLink, setTelegramActiveWorkspace, type TelegramLink } from "@/lib/telegram/identity";
import { isZenoError, runZenoTurn } from "@/lib/ai-suite/orchestrator";
import { roleSatisfies } from "@/lib/ai-suite/capabilities";
import type { AiSuiteChatMessage } from "@/types/ai-suite";

/**
 * TELEGRAM AS A TRANSPORT, NOT A SECOND ASSISTANT.
 *
 * Everything that decides what Zeno does lives elsewhere: the capability
 * registry, the system prompt, the proposal boundary, the confirmation
 * claim. This file establishes who is asking and which workspace they are
 * in, hands that to the same orchestrator the browser uses, and renders
 * the answer for a chat window.
 *
 * AUTHORIZATION IS RE-DERIVED, NEVER REMEMBERED. The link says which
 * DivineX user a Telegram account belongs to. It does not say what they
 * may do, and the workspace stored on it is a preference. Membership and
 * role are read from the workspace itself on every single turn, so losing
 * access on the web loses it here in the same instant, with nothing to
 * revoke.
 */

export interface TelegramActor {
  link: TelegramLink;
  uid: string;
  email: string;
  displayName: string;
}

export interface ResolvedWorkspace {
  subAccountId: string;
  subAccountName: string;
  agencyId: string;
  role: string;
}

/**
 * The workspaces this person can use RIGHT NOW, read from membership
 * rather than from anything Telegram said.
 */
export async function authorizedWorkspaces(uid: string): Promise<ResolvedWorkspace[]> {
  const db = getAdminDb();
  const idx = await db.collection(`userMemberships/${uid}/subAccounts`).get();
  const out: ResolvedWorkspace[] = [];
  for (const m of idx.docs) {
    if (m.data().status === "removed") continue;
    const sa = await db.doc(`subAccounts/${m.id}`).get();
    if (!sa.exists) continue;
    // The assistant is opt-in per workspace, and Telegram is not an
    // exception to that.
    if (sa.data()?.aiSuiteEnabledByAgency !== true) continue;
    // Membership is confirmed against the workspace's own roster, not the
    // denormalized index, which can lag a removal.
    const member = await db.doc(`subAccounts/${m.id}/subAccountMembers/${uid}`).get();
    if (!member.exists || member.data()!.status === "removed") continue;
    out.push({
      subAccountId: m.id,
      subAccountName: String(sa.data()?.name ?? "Untitled"),
      agencyId: String(sa.data()?.agencyId ?? ""),
      role: String(member.data()!.role ?? "collaborator"),
    });
  }
  return out;
}

export type WorkspaceResolution =
  | { kind: "ready"; workspace: ResolvedWorkspace }
  | { kind: "choose"; options: ResolvedWorkspace[] }
  | { kind: "none" };

/**
 * Which workspace this turn acts in.
 *
 * The remembered one is used only if the person still has access to it.
 * When they do not, it is dropped rather than refused: their access
 * changed, which is not an error they caused.
 */
export async function resolveWorkspace(actor: TelegramActor): Promise<WorkspaceResolution> {
  const available = await authorizedWorkspaces(actor.uid);
  if (available.length === 0) return { kind: "none" };
  const remembered = actor.link.activeSubAccountId
    ? available.find((w) => w.subAccountId === actor.link.activeSubAccountId)
    : undefined;
  if (remembered) return { kind: "ready", workspace: remembered };
  if (actor.link.activeSubAccountId && !remembered) {
    // They lost access to it. Forget it rather than keep pointing at it.
    await setTelegramActiveWorkspace(actor.link.telegramUserId, null);
  }
  if (available.length === 1) {
    await setTelegramActiveWorkspace(actor.link.telegramUserId, available[0].subAccountId);
    return { kind: "ready", workspace: available[0] };
  }
  return { kind: "choose", options: available };
}

/** Pick a workspace by name, only from the ones they may actually use. */
export async function chooseWorkspaceByName(
  actor: TelegramActor,
  needle: string,
): Promise<{ ok: true; workspace: ResolvedWorkspace } | { ok: false; options: ResolvedWorkspace[] }> {
  const available = await authorizedWorkspaces(actor.uid);
  const lower = needle.trim().toLowerCase();
  const exact = available.filter((w) => w.subAccountName.toLowerCase() === lower);
  const loose = available.filter((w) => w.subAccountName.toLowerCase().includes(lower));
  const hit = exact.length === 1 ? exact[0] : loose.length === 1 ? loose[0] : null;
  // A name that matches two workspaces is never guessed between: acting in
  // the wrong workspace is the one mistake this layer must not make.
  if (!hit) return { ok: false, options: available };
  await setTelegramActiveWorkspace(actor.link.telegramUserId, hit.subAccountId);
  return { ok: true, workspace: hit };
}

/**
 * ONE TELEGRAM UPDATE, ONE ZENO TURN.
 *
 * Telegram retries a webhook it believes failed, and a retry of "send it"
 * that produced a second turn would produce a second proposal. This is
 * separate from the confirmation claim: that one protects the execution,
 * this one protects the conversation that leads to it.
 */
export async function claimTelegramUpdate(updateId: number | string): Promise<boolean> {
  const ref = getAdminDb().collection("telegramUpdates").doc(String(updateId));
  try {
    // create() fails if the document exists, which is the whole mechanism.
    await ref.create({ seenAt: FieldValue.serverTimestamp() });
    return true;
  } catch {
    return false;
  }
}

/** Conversation history for one chat, stored where the channel says. */
export async function loadTelegramHistory(telegramUserId: string, subAccountId: string): Promise<AiSuiteChatMessage[]> {
  const snap = await getAdminDb().doc(`telegramLinks/${telegramUserId}/threads/${subAccountId}`).get();
  const raw = snap.exists ? snap.data()!.messages : null;
  return Array.isArray(raw) ? (raw as AiSuiteChatMessage[]).slice(-20) : [];
}

/**
 * History is kept PER WORKSPACE, which is what stops a conversation
 * started in one workspace from carrying its subject into another after a
 * switch. Switching is not a topic change; it is a different business.
 */
export async function saveTelegramHistory(
  telegramUserId: string,
  subAccountId: string,
  messages: AiSuiteChatMessage[],
): Promise<void> {
  await getAdminDb().doc(`telegramLinks/${telegramUserId}/threads/${subAccountId}`).set(
    { messages: messages.slice(-20), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Run one turn for a Telegram message, through the same orchestrator the
 * browser calls. Nothing about the assistant differs; only who proved the
 * identity, and what the answer is rendered into.
 */
export async function runTelegramTurn(opts: {
  actor: TelegramActor;
  workspace: ResolvedWorkspace;
  text: string;
}) {
  const history = await loadTelegramHistory(opts.actor.link.telegramUserId, opts.workspace.subAccountId);
  const messages: AiSuiteChatMessage[] = [...history, { role: "user", content: opts.text }];

  const roleCtx = {
    agencyRoleIsOwner: opts.workspace.role === "agencyOwner",
    subAccountRole: opts.workspace.role,
  };

  const result = await runZenoTurn({
    actor: {
      uid: opts.actor.uid,
      email: opts.actor.email,
      displayName: opts.actor.displayName,
      agencyId: opts.workspace.agencyId,
      subAccountId: opts.workspace.subAccountId,
      subAccountRole: opts.workspace.role,
    },
    level: "sub-account",
    roleCtx,
    workspaceName: opts.workspace.subAccountName,
    usageAgencyId: opts.workspace.agencyId,
    messages,
    // The only thing that differs, and it changes presentation only.
    channel: "telegram",
  });

  if (isZenoError(result)) return { result, messages };
  const spoken =
    result.type === "proposal"
      ? result.proposal.summary
      : result.type === "navigate"
        ? result.text
        : result.text;
  await saveTelegramHistory(opts.actor.link.telegramUserId, opts.workspace.subAccountId, [
    ...messages,
    { role: "assistant", content: spoken ?? "" },
  ]);
  return { result, messages };
}

export { roleSatisfies };
