import "server-only";

import { getAdminAuth } from "@/lib/firebase/admin";
import { executeZenoConfirmation, isConfirmError, isConfirmReplay } from "@/lib/ai-suite/confirm-executor";
import {
  authorizedWorkspaces,
  chooseWorkspaceByName,
  claimTelegramUpdate,
  resolveWorkspace,
  runTelegramTurn,
  type TelegramActor,
} from "@/lib/telegram/gateway";
import { getTelegramLink, redeemTelegramLinkToken } from "@/lib/telegram/identity";
import {
  loadTelegramProposal,
  settleTelegramProposal,
  storeTelegramProposal,
} from "@/lib/telegram/proposals";
import { escapeTelegramHtml, type TelegramInbound, type TelegramReply } from "@/lib/telegram/transport";

/**
 * ONE TELEGRAM UPDATE, HANDLED.
 *
 * Deliberately returns the reply instead of sending it, so every path here
 * runs in a test with no network and no bot token. The route sends what
 * this produces.
 *
 * The order is the whole security model: deduplicate the update, identify
 * the Telegram account, find the DivineX identity it is linked to,
 * re-derive which workspaces that person may currently use, and only then
 * let Zeno see the message.
 */

const CONFIRM_PREFIX = "c:";
const CANCEL_PREFIX = "x:";

export type HandleResult = { reply: TelegramReply | null; note: string };

function say(chatId: string, text: string, buttons?: TelegramReply["buttons"]): HandleResult {
  return { reply: { chatId, text, ...(buttons ? { buttons } : {}) }, note: "replied" };
}

/** Everything a person needs to connect, and nothing about who they are. */
function connectPrompt(chatId: string): HandleResult {
  return say(
    chatId,
    "I'm not connected to a DivineX account yet.\n\nOpen DivineX, go to Settings, and choose <b>Connect Telegram</b>. That gives you a link that finishes the connection here.",
  );
}

export async function handleTelegramUpdate(update: TelegramInbound): Promise<HandleResult> {
  // A bot talking to a bot is how a loop starts, including this one
  // answering itself.
  if (update.fromBot) return { reply: null, note: "ignored: from a bot" };

  // Telegram retries anything it thinks failed. One update is one turn,
  // or a retry of "send it" becomes a second proposal.
  const fresh = await claimTelegramUpdate(update.updateId);
  if (!fresh) return { reply: null, note: "ignored: duplicate update" };

  // ── Linking. The only thing an unlinked account may do.
  const startMatch = update.text?.match(/^\/start(?:\s+(\S+))?$/);
  if (startMatch) {
    const token = startMatch[1];
    if (!token) return connectPrompt(update.chatId);
    const res = await redeemTelegramLinkToken({
      token,
      telegramUserId: update.telegramUserId,
      telegramUsername: update.username,
      chatId: update.chatId,
    });
    if (!res.ok) {
      // Every failure reads the same, so a guessed token learns nothing
      // about whether it existed.
      return say(
        update.chatId,
        res.reason === "already_linked_elsewhere"
          ? "This Telegram account is already connected to a different DivineX account. Disconnect it there first."
          : "That link didn't work. It may have expired or already been used. Generate a new one in DivineX under Settings.",
      );
    }
    const spaces = await authorizedWorkspaces(res.uid);
    if (spaces.length === 0) {
      return say(update.chatId, "Connected. You don't have access to any workspace with the assistant enabled yet.");
    }
    if (spaces.length === 1) {
      return say(update.chatId, `Connected. You're in <b>${escapeTelegramHtml(spaces[0].subAccountName)}</b>. Ask me anything.`);
    }
    return say(
      update.chatId,
      `Connected. You have ${spaces.length} workspaces:\n${spaces.map((w) => `• ${escapeTelegramHtml(w.subAccountName)}`).join("\n")}\n\nTell me which to use, for example "switch to ${escapeTelegramHtml(spaces[0].subAccountName)}".`,
    );
  }

  // ── Identity. A Telegram id alone is not authorization; it is a lookup.
  const link = await getTelegramLink(update.telegramUserId);
  if (!link) return connectPrompt(update.chatId);

  let email = "";
  let displayName = "";
  try {
    const user = await getAdminAuth().getUser(link.uid);
    // A disabled account loses Telegram at the same moment it loses the web.
    if (user.disabled) return say(update.chatId, "That DivineX account isn't active. Talk to your workspace admin.");
    email = user.email ?? "";
    displayName = user.displayName ?? "";
  } catch {
    return say(update.chatId, "I couldn't verify your DivineX account. Reconnect from Settings.");
  }
  const actor: TelegramActor = { link, uid: link.uid, email, displayName };

  // ── Which workspace, re-derived from live membership every time.
  const switchMatch = update.text?.match(/^(?:\/workspace\s+|switch to\s+)(.+)$/i);
  if (switchMatch) {
    const picked = await chooseWorkspaceByName(actor, switchMatch[1]);
    if (!picked.ok) {
      return say(
        update.chatId,
        picked.options.length === 0
          ? "You don't have access to any workspace with the assistant enabled."
          : `I couldn't tell which one you meant. You have:\n${picked.options.map((w) => `• ${escapeTelegramHtml(w.subAccountName)}`).join("\n")}`,
      );
    }
    return say(update.chatId, `Now working in <b>${escapeTelegramHtml(picked.workspace.subAccountName)}</b>.`);
  }
  if (update.text?.trim() === "/workspace") {
    const spaces = await authorizedWorkspaces(actor.uid);
    return say(
      update.chatId,
      spaces.length === 0
        ? "You don't have access to any workspace with the assistant enabled."
        : `Your workspaces:\n${spaces.map((w) => `• ${escapeTelegramHtml(w.subAccountName)}${w.subAccountId === link.activeSubAccountId ? " (current)" : ""}`).join("\n")}`,
    );
  }

  const resolved = await resolveWorkspace(actor);
  if (resolved.kind === "none") {
    return say(update.chatId, "You don't have access to any workspace with the assistant enabled.");
  }
  if (resolved.kind === "choose") {
    return say(
      update.chatId,
      `Which workspace?\n${resolved.options.map((w) => `• ${escapeTelegramHtml(w.subAccountName)}`).join("\n")}`,
    );
  }
  const workspace = resolved.workspace;

  // ── A pressed button.
  if (update.callback) {
    const data = update.callback.data;
    const isConfirm = data.startsWith(CONFIRM_PREFIX);
    const isCancel = data.startsWith(CANCEL_PREFIX);
    if (!isConfirm && !isCancel) return { reply: null, note: "ignored: unknown callback" };
    const id = data.slice(2);

    const loaded = await loadTelegramProposal({
      id,
      telegramUserId: update.telegramUserId,
      uid: actor.uid,
      subAccountId: workspace.subAccountId,
    });
    if (!loaded.ok) {
      // A proposal that is gone, settled, someone else's, or from another
      // workspace all answer the same way.
      return say(
        update.chatId,
        loaded.reason === "already_settled"
          ? "That one's already been dealt with."
          : "I can't act on that any more. Ask me again and I'll put it back in front of you.",
      );
    }
    if (isCancel) {
      await settleTelegramProposal(id, "cancelled");
      return say(update.chatId, "Cancelled. Nothing was changed.");
    }

    // The same execution boundary the browser uses, including the claim
    // that makes one approved action run at most once.
    const outcome = await executeZenoConfirmation({
      ctx: {
        uid: actor.uid,
        email: actor.email,
        displayName: actor.displayName,
        agencyId: workspace.agencyId,
        subAccountId: workspace.subAccountId,
        subAccountRole: workspace.role,
      },
      level: "sub-account",
      capability: loaded.proposal.capability,
      args: loaded.proposal.args,
      // The stored proposal id IS the claim key, so pressing the button
      // twice, or two devices pressing it at once, runs it once.
      proposalId: `tg_${id}`,
    });
    await settleTelegramProposal(id, "confirmed");

    if (isConfirmReplay(outcome)) {
      const text = String((outcome.body as { resultText?: string }).resultText ?? "Already done.");
      return say(update.chatId, `${escapeTelegramHtml(text)}\n\n<i>(this had already run, so nothing happened twice)</i>`);
    }
    if (isConfirmError(outcome)) {
      return say(update.chatId, escapeTelegramHtml(outcome.__error));
    }
    const text = String((outcome as { resultText?: string }).resultText ?? "Done.");
    return say(update.chatId, escapeTelegramHtml(text));
  }

  // ── An ordinary message: the same Zeno the browser talks to.
  if (!update.text) return { reply: null, note: "ignored: no text" };
  const { result } = await runTelegramTurn({ actor, workspace, text: update.text });

  if ("__error" in result) return say(update.chatId, escapeTelegramHtml(result.__error));

  if (result.type === "proposal") {
    // The button carries a reference. The arguments stay on the server.
    const id = await storeTelegramProposal({
      telegramUserId: update.telegramUserId,
      uid: actor.uid,
      subAccountId: workspace.subAccountId,
      capability: result.proposal.capability,
      args: result.proposal.args,
      summary: result.proposal.summary,
    });
    return say(update.chatId, escapeTelegramHtml(result.proposal.summary), [
      { text: "Confirm", callbackData: `${CONFIRM_PREFIX}${id}` },
      { text: "Cancel", callbackData: `${CANCEL_PREFIX}${id}` },
    ]);
  }
  if (result.type === "navigate") {
    return say(update.chatId, escapeTelegramHtml(result.text));
  }
  return say(update.chatId, escapeTelegramHtml(result.text));
}
