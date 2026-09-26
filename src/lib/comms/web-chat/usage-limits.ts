import "server-only";

import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Persistent rate limits + hard cost ceilings for the public web-chat.
 *
 * The previous limiter lived in process memory: it reset on every deploy, was
 * per-instance, and the "token budget" was a counter nobody read. These
 * counters live in Firestore (`subAccounts/{id}/webChatLimits/*`, Admin SDK
 * only) and are checked-and-incremented in one transaction, so they hold across
 * instances and restarts.
 *
 * Four independent ceilings, all enforced BEFORE any model call:
 *   - per client IP per hour
 *   - per chat session (lifetime)
 *   - per channel messages per UTC day
 *   - per channel model tokens per UTC day
 * The token ceiling is checked against usage recorded after each reply, so it
 * can be overshot by at most one reply's worth of tokens.
 *
 * Fails CLOSED: if the counters can't be read, the caller refuses the request.
 */

export interface UsageLimits {
  perIpHour: number;
  perSession: number;
  dailyMessages: number;
  dailyTokens: number;
}

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  perIpHour: 30,
  perSession: 30,
  dailyMessages: 600,
  dailyTokens: 300_000,
};

export function resolveLimits(cfg: {
  dailyMessageBudget?: number;
  dailyTokenBudget?: number;
}): UsageLimits {
  const clamp = (v: unknown, fallback: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0
      ? Math.min(Math.floor(v), max)
      : fallback;
  return {
    ...DEFAULT_USAGE_LIMITS,
    dailyMessages: clamp(cfg.dailyMessageBudget, DEFAULT_USAGE_LIMITS.dailyMessages, 100_000),
    dailyTokens: clamp(cfg.dailyTokenBudget, DEFAULT_USAGE_LIMITS.dailyTokens, 50_000_000),
  };
}

export interface Counter {
  count: number;
  tokens: number;
}

export type LimitReason = "ip-quota" | "session-quota" | "message-budget" | "token-budget";

export type LimitDecision =
  | { ok: true }
  | { ok: false; reason: LimitReason; retryAfterSec: number };

/** Pure decision function, separated from storage so it can be tested exactly. */
export function evaluateLimits(
  cur: { ip: Counter; session: Counter; day: Counter },
  limits: UsageLimits,
  secondsToNextHour: number,
  secondsToNextDay: number,
): LimitDecision {
  if (cur.session.count >= limits.perSession) {
    return { ok: false, reason: "session-quota", retryAfterSec: 0 };
  }
  if (cur.ip.count >= limits.perIpHour) {
    return { ok: false, reason: "ip-quota", retryAfterSec: Math.max(1, secondsToNextHour) };
  }
  if (cur.day.count >= limits.dailyMessages) {
    return { ok: false, reason: "message-budget", retryAfterSec: Math.max(1, secondsToNextDay) };
  }
  if (cur.day.tokens >= limits.dailyTokens) {
    return { ok: false, reason: "token-budget", retryAfterSec: Math.max(1, secondsToNextDay) };
  }
  return { ok: true };
}

export interface LimitStore {
  /** Atomically read `keys`, let `decide` choose, and apply its increments. */
  transact<T>(
    keys: string[],
    decide: (cur: Record<string, Counter>) => {
      result: T;
      increments?: Record<string, Partial<Counter>>;
    },
  ): Promise<T>;
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

export function buckets(nowMs: number) {
  const d = new Date(nowMs);
  const day = d.toISOString().slice(0, 10).replace(/-/g, "");
  const hour = `${day}${String(d.getUTCHours()).padStart(2, "0")}`;
  const nextHour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
  const nextDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return {
    day,
    hour,
    secondsToNextHour: Math.ceil((nextHour - nowMs) / 1000),
    secondsToNextDay: Math.ceil((nextDay - nowMs) / 1000),
  };
}

export function createFirestoreLimitStore(subAccountId: string): LimitStore {
  const col = () => getAdminDb().collection(`subAccounts/${subAccountId}/webChatLimits`);
  return {
    async transact(keys, decide) {
      const db = getAdminDb();
      return db.runTransaction(async (tx) => {
        const refs = keys.map((k) => col().doc(k));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        const cur: Record<string, Counter> = {};
        keys.forEach((k, i) => {
          const d = snaps[i].data() as Partial<Counter> | undefined;
          cur[k] = { count: d?.count ?? 0, tokens: d?.tokens ?? 0 };
        });
        const { result, increments } = decide(cur);
        if (increments) {
          for (const [k, inc] of Object.entries(increments)) {
            const ttlDays = k.startsWith("day_") ? 3 : k.startsWith("session_") ? 7 : 1;
            tx.set(
              col().doc(k),
              {
                ...(inc.count ? { count: FieldValue.increment(inc.count) } : {}),
                ...(inc.tokens ? { tokens: FieldValue.increment(inc.tokens) } : {}),
                // For an optional Firestore TTL policy on `expireAt`.
                expireAt: Timestamp.fromMillis(Date.now() + ttlDays * 86_400_000),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          }
        }
        return result;
      });
    },
  };
}

export async function checkAndCountRequest(input: {
  subAccountId: string;
  ip: string;
  sessionId: string;
  limits: UsageLimits;
  store?: LimitStore;
  nowMs?: number;
}): Promise<LimitDecision> {
  const now = input.nowMs ?? Date.now();
  const b = buckets(now);
  const store = input.store ?? createFirestoreLimitStore(input.subAccountId);
  const ipKey = `ip_${hash(input.ip)}_${b.hour}`;
  const sessionKey = `session_${hash(input.sessionId)}`;
  const dayKey = `day_${b.day}`;

  return store.transact<LimitDecision>([ipKey, sessionKey, dayKey], (cur) => {
    const decision = evaluateLimits(
      { ip: cur[ipKey], session: cur[sessionKey], day: cur[dayKey] },
      input.limits,
      b.secondsToNextHour,
      b.secondsToNextDay,
    );
    if (!decision.ok) return { result: decision };
    return {
      result: decision,
      increments: {
        [ipKey]: { count: 1 },
        [sessionKey]: { count: 1 },
        [dayKey]: { count: 1 },
      },
    };
  });
}

/** Record model tokens actually used, against today's channel ceiling. */
export async function recordTokenUsage(input: {
  subAccountId: string;
  tokens: number;
  store?: LimitStore;
  nowMs?: number;
}): Promise<void> {
  if (!(input.tokens > 0)) return;
  const b = buckets(input.nowMs ?? Date.now());
  const store = input.store ?? createFirestoreLimitStore(input.subAccountId);
  const dayKey = `day_${b.day}`;
  await store.transact([dayKey], () => ({
    result: undefined,
    increments: { [dayKey]: { tokens: Math.floor(input.tokens) } },
  }));
}
