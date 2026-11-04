import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { WithMeta } from "@/types/intelligence";

/**
 * Server-side operational data for the Agents section.
 *
 * WHY THIS IS NEW CODE. /agents was fourteen lines wrapping Flow's AI
 * Agents page, so the section opened straight into a channel grid with no
 * answer to "is my agent working, and what did it do." The data to answer
 * that already exists, but only in CLIENT paths: Flow's overview fetches
 * each channel config over HTTP from a client component, and the web-chat
 * and voice consoles read their collections through onSnapshot helpers in
 * lib/firestore. A Server Component composer cannot reuse either. This is
 * the same situation, and the same remedy, as
 * compose-business-health.ts -- which says so in its own header.
 *
 * It reads the collections those client paths already rely on, by the same
 * field names (verified against types/web-chat.ts, types/voice.ts and the
 * aiAgent doc layout in CLAUDE.md), and aggregates rather than
 * re-implementing any of their behaviour.
 *
 * Deliberately never throws. A read failure here must not take down the
 * section: the execution band underneath it is Flow's own page and works
 * independently. Fails closed to "unavailable", and each sub-read degrades
 * on its own so one missing composite index cannot empty the whole
 * summary.
 */

/** The channels that can carry a live agent today, in nav order. */
const AGENT_CHANNELS = ["web-chat", "sms", "whatsapp", "voice"] as const;
export type AgentChannelId = (typeof AGENT_CHANNELS)[number];

export interface AgentChannelState {
  id: AgentChannelId;
  enabled: boolean;
  /** Cumulative LLM tokens this channel has spent, as the channel doc records it. */
  tokensUsed: number;
}

export interface AgentRecentItem {
  kind: "web-chat" | "voice";
  id: string;
  /** Who it was with, when we know. Null stays null; never invented. */
  who: string | null;
  detail: string | null;
  at: number | null;
  /** True when this one still has an open follow-up task against it. */
  needsFollowUp: boolean;
}

export interface AgentsSummary {
  /** Empty persona means every channel stays silent, whatever its toggle says. */
  personaConfigured: boolean;
  escalationEmailConfigured: boolean;
  channels: AgentChannelState[];
  /** Counts over the last 7 days. */
  conversationsLast7: number;
  capturedLeadsLast7: number;
  voiceCallsLast7: number;
  escalatedLast7: number;
  /** Open follow-up tasks the agent created and nobody has closed. */
  pendingFollowUps: number;
  recent: AgentRecentItem[];
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  const t = value as { toMillis?: () => number };
  return typeof t.toMillis === "function" ? t.toMillis() : null;
}

export async function composeAgentsSummary(workspaceId: string): Promise<WithMeta<AgentsSummary>> {
  try {
    const db = getAdminDb();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const agentDoc = (id: string) => db.doc(`subAccounts/${workspaceId}/aiAgent/${id}`);

    const [profileSnap, channelSnaps, sessionsSnap, callsSnap] = await Promise.all([
      agentDoc("profile").get().catch(() => null),
      Promise.all(AGENT_CHANNELS.map((id) => agentDoc(id).get().catch(() => null))),
      // Ordered reads on a subcollection with a single orderBy need no
      // composite index, but degrade anyway rather than empty the summary.
      db
        .collection(`subAccounts/${workspaceId}/webChatSessions`)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
        .catch(() => null),
      db
        .collection(`subAccounts/${workspaceId}/voiceCalls`)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
        .catch(() => null),
    ]);

    const profile = profileSnap?.exists ? (profileSnap.data() as Record<string, unknown>) : null;
    const personaConfigured = typeof profile?.systemPrompt === "string" && profile.systemPrompt.trim().length > 0;
    const escalationEmailConfigured =
      typeof profile?.escalationNotifyEmail === "string" && profile.escalationNotifyEmail.trim().length > 0;

    const channels: AgentChannelState[] = AGENT_CHANNELS.map((id, i) => {
      const snap = channelSnaps[i];
      const data = snap?.exists ? (snap.data() as Record<string, unknown>) : null;
      return {
        id,
        // Read === true so a legacy doc missing the field is off, the same
        // treatment every agency gate gets.
        enabled: data?.enabled === true,
        tokensUsed: typeof data?.totalTokensUsed === "number" ? data.totalTokensUsed : 0,
      };
    });

    const cutoff = sevenDaysAgo.getTime();
    const recent: AgentRecentItem[] = [];
    let conversationsLast7 = 0;
    let capturedLeadsLast7 = 0;
    let escalatedLast7 = 0;
    let pendingFollowUps = 0;

    for (const doc of sessionsSnap?.docs ?? []) {
      const d = doc.data() as Record<string, unknown>;
      const at = toMillis(d.createdAt);
      const captured = [d.capturedName, d.capturedEmail, d.capturedPhone].some(
        (v) => typeof v === "string" && v.trim().length > 0,
      );
      const open = typeof d.pendingFollowUpTaskId === "string" && d.pendingFollowUpTaskId.length > 0;
      if (open) pendingFollowUps += 1;
      if (at !== null && at >= cutoff) {
        conversationsLast7 += 1;
        if (captured) capturedLeadsLast7 += 1;
        if (d.status === "escalated") escalatedLast7 += 1;
      }
      if (recent.length < 20) {
        recent.push({
          kind: "web-chat",
          id: doc.id,
          who: (typeof d.capturedName === "string" && d.capturedName) || (typeof d.capturedEmail === "string" && d.capturedEmail) || null,
          detail:
            typeof d.messageCount === "number"
              ? `${d.messageCount} message${d.messageCount === 1 ? "" : "s"}${d.status === "escalated" ? ", escalated" : ""}`
              : null,
          at,
          needsFollowUp: open,
        });
      }
    }

    let voiceCallsLast7 = 0;
    for (const doc of callsSnap?.docs ?? []) {
      const d = doc.data() as Record<string, unknown>;
      const at = toMillis(d.createdAt);
      if (at !== null && at >= cutoff) {
        voiceCallsLast7 += 1;
        if (d.callbackRequested === true) escalatedLast7 += 1;
      }
      if (recent.length < 40) {
        const secs = typeof d.durationSec === "number" ? d.durationSec : null;
        recent.push({
          kind: "voice",
          id: doc.id,
          who: typeof d.callerPhone === "string" ? d.callerPhone : null,
          detail:
            (typeof d.summary === "string" && d.summary.trim().length > 0 && d.summary.trim()) ||
            (secs !== null ? `${Math.round(secs)}s call` : null),
          at,
          needsFollowUp: d.callbackRequested === true,
        });
      }
    }

    recent.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

    const summary: AgentsSummary = {
      personaConfigured,
      escalationEmailConfigured,
      channels,
      conversationsLast7,
      capturedLeadsLast7,
      voiceCallsLast7,
      escalatedLast7,
      pendingFollowUps,
      recent: recent.slice(0, 6),
    };

    return { meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null }, data: summary };
  } catch {
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "firestore_read_failed" }, data: null };
  }
}
