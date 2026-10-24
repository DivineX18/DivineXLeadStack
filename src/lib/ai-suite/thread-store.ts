import "server-only";

import { NextResponse } from "next/server";
import {
  requireAgencyOwnerAny,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteLevel } from "@/types/ai-suite";

/**
 * QA BUG-004 — Zeno chat had no history at all. There WAS persistence
 * (`/api/ai-suite/thread`), but it was a single slot per (user, level,
 * sub-account): one doc, overwritten on every autosave, and "New chat"
 * issued a hard DELETE on it. There was never more than one conversation to
 * go back to, and starting a new one destroyed the old one — not "hidden",
 * gone. This module is the shared base for turning that one slot into a
 * real (small) history: a `sessions` subcollection holding every
 * conversation, plus a tiny pointer doc recording which one is "current".
 *
 * Deliberately reuses the EXACT path shape + auth gating the original single
 * doc used (`subAccounts/{id}/aiSuiteThreads/{uid}` /
 * `agencies/{id}/aiSuiteThreads/{uid}`) — this is the pointer doc now, and
 * `sessions/{sessionId}` hangs off it. Not a new storage model, the same one
 * made to hold more than one thing.
 */

export const MAX_MESSAGES = 60;
export const MAX_CONTENT_CHARS = 6000;
export const MAX_SESSIONS_LISTED = 30;

const PROPOSAL_STATUSES = new Set([
  "pending",
  "confirmed",
  "cancelled",
  "failed",
]);

export type StoredMessage = Record<string, unknown>;

/** Validate + normalize one client-supplied thread message; null = drop it. */
export function sanitizeStoredMessage(raw: unknown): StoredMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.kind === "text") {
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (typeof m.content !== "string" || !m.content.trim()) return null;
    return {
      role: m.role,
      kind: "text",
      content: m.content.slice(0, MAX_CONTENT_CHARS),
    };
  }
  if (m.kind === "navigate") {
    if (
      typeof m.content !== "string" ||
      typeof m.href !== "string" ||
      typeof m.label !== "string" ||
      // Same-origin path only — a single leading slash (no protocol-relative
      // "//host" or absolute URLs), so a stored thread can never smuggle an
      // external link into the chat.
      !/^\/(?!\/)/.test(m.href)
    ) {
      return null;
    }
    return {
      role: "assistant",
      kind: "navigate",
      content: m.content.slice(0, MAX_CONTENT_CHARS),
      href: m.href.slice(0, 300),
      label: m.label.slice(0, 120),
    };
  }
  if (m.kind === "proposal") {
    if (
      typeof m.id !== "string" ||
      typeof m.capability !== "string" ||
      typeof m.summary !== "string" ||
      !m.args ||
      typeof m.args !== "object" ||
      Array.isArray(m.args) ||
      typeof m.status !== "string" ||
      !PROPOSAL_STATUSES.has(m.status)
    ) {
      return null;
    }
    return {
      role: "assistant",
      kind: "proposal",
      id: m.id.slice(0, 128),
      capability: m.capability.slice(0, 64),
      args: m.args,
      summary: m.summary.slice(0, MAX_CONTENT_CHARS),
      status: m.status,
      resultText:
        typeof m.resultText === "string"
          ? m.resultText.slice(0, MAX_CONTENT_CHARS)
          : null,
    };
  }
  return null;
}

/** The first user message, trimmed to a short label — the "useful title"
 *  BUG-004 asked for. A thread with no user text yet (shouldn't happen —
 *  empty threads are never saved) falls back to a generic label. */
export function deriveSessionTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find(
    (m) => m.role === "user" && m.kind === "text"
  );
  const text =
    typeof firstUser?.content === "string" ? firstUser.content.trim() : "";
  if (!text) return "New conversation";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** Auth + resolve the caller's base thread path. Mirrors the chat route's
 *  gating exactly (membership, agency-owner, and the sub-account AI Suite
 *  gate) so history is never readable/writable where chat isn't. */
export async function resolveThreadBase(
  request: Request,
  level: string | null,
  subAccountId: string | null
): Promise<{ basePath: string } | NextResponse> {
  if (level !== "agency" && level !== "sub-account") {
    return NextResponse.json(
      { error: "`level` must be 'agency' or 'sub-account'." },
      { status: 400 }
    );
  }
  if (level === "sub-account") {
    if (!subAccountId) {
      return NextResponse.json(
        { error: "`subAccountId` is required for sub-account level." },
        { status: 400 }
      );
    }
    const access = await requireSubAccountMember(request, subAccountId);
    if (access instanceof NextResponse) return access;
    const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    // Opt-in gate — unset/legacy reads as disabled, matching the chat route.
    if (subSnap.data()?.aiSuiteEnabledByAgency !== true) {
      return NextResponse.json(
        { error: "The AI Suite is disabled for this sub-account." },
        { status: 403 }
      );
    }
    return {
      basePath: `subAccounts/${subAccountId}/aiSuiteThreads/${access.uid}`,
    };
  }
  const owner = await requireAgencyOwnerAny(request);
  if (owner instanceof NextResponse) return owner;
  return { basePath: `agencies/${owner.agencyId}/aiSuiteThreads/${owner.uid}` };
}

export type AiSuiteThreadLevel = AiSuiteLevel;
