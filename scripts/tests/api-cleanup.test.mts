import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
type Ref = { id: string };
type Callback = {
  pathname: string;
  body: {
    cleanupContinuation?: { root: string; hop: number; startedAt: number };
  };
  delaySeconds: number;
  deduplicationId: string;
  retries: number;
  onError?: (error: unknown) => void;
};
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  queries: [] as unknown[][],
  errors: {} as Record<string, unknown>,
  sizes: {} as Record<string, number>,
  batchFailure: false,
  recursiveFailure: false,
  drainFailure: false,
  pending: false,
  signed: true,
  publishOk: true,
  published: [] as Callback[],
  deleted: [] as string[],
  recursive: [] as string[],
}));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    collectionGroup: (name: string) => ({
      where: (field: string, op: string, cutoff: Date) => {
        state.queries.push([name, field, op, cutoff]);
        return {
          limit: (limit: number) => ({
            get: async () => {
              expect(limit).toBe(500);
              if (state.errors[name]) throw state.errors[name];
              const size = state.sizes[name] ?? 0;
              return {
                empty: size === 0,
                size,
                docs: Array.from({ length: size }, (_, i) => ({
                  ref: { id: name + "-" + i },
                })),
              };
            },
          }),
        };
      },
    }),
    batch: () => {
      const ids: string[] = [];
      return {
        delete: (ref: Ref) => ids.push(ref.id),
        commit: async () => {
          if (state.batchFailure)
            throw Object.assign(Error("private customer token"), { code: 14 });
          state.deleted.push(...ids);
        },
      };
    },
    recursiveDelete: async (ref: Ref) => {
      if (state.recursiveFailure)
        throw Object.assign(Error("private record"), { code: 7 });
      state.recursive.push(ref.id);
    },
  }),
}));
vi.mock("@/lib/ai-suite/outcome-feedback", () => ({
  drainFeedback: async () => {
    if (state.drainFailure) throw Object.assign(Error("secret"), { code: 14 });
    return (
      process.env.DIVINEX_AGENT_OUTCOME_ENABLED === "true" && state.pending
    );
  },
}));
vi.mock("@/lib/automations/qstash", () => ({
  verifyQStashSignature: async () => state.signed,
  publishCallback: vi.fn(async (input: Callback) => {
    state.published.push(input);
    return state.publishOk ? { messageId: "fixture" } : null;
  }),
}));
import { POST } from "@/app/api/cron/api-cleanup/route";
const request = (body: unknown = {}, id = "synthetic-message") =>
  new Request("http://fixture/api/cron/api-cleanup", {
    method: "POST",
    headers: {
      "upstash-signature": "synthetic-signature",
      "upstash-message-id": id,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  state.queries = [];
  state.errors = {};
  state.sizes = {};
  state.batchFailure = false;
  state.recursiveFailure = false;
  state.drainFailure = false;
  state.pending = false;
  state.signed = true;
  state.publishOk = true;
  state.published = [];
  state.deleted = [];
  state.recursive = [];
  vi.stubEnv("DIVINEX_AGENT_OUTCOME_ENABLED", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("cleanup retention and failure diagnostics", () => {
  it("sweeps every collection with expiresAt < now and preserves empty success", async () => {
    const res = await POST(request());
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(b.continuationRequired).toBe(false);
    expect(state.published).toHaveLength(0);
    expect(state.queries.map((q) => q.slice(0, 3))).toEqual(
      ["apiRequestLogs", "apiIdempotency", "webhookEvents"].map((n) => [
        n,
        "expiresAt",
        "<",
      ])
    );
    expect(state.queries.every((q) => q[3] instanceof Date)).toBe(true);
  });
  it.each(["apiIdempotency", "webhookEvents"])(
    "identifies %s query failure and never self-publishes",
    async (name) => {
      state.errors[name] = Object.assign(
        Error("secret-token customer@example.invalid index URL"),
        { code: 9 }
      );
      const res = await POST(request());
      const b = await res.json();
      expect(res.status).toBe(503);
      expect(b.sweepFailed).toBe(true);
      expect(b.continuationRequired).toBe(false);
      expect(state.published).toHaveLength(0);
      expect(b.failures).toContainEqual({
        collection: name,
        operation: "query_expired",
        code: "failed-precondition",
        errorClass: "Error",
        retryable: false,
      });
      const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logs).not.toMatch(/secret-token|customer@|index URL/);
      expect(logs).toContain("continuationScheduled");
    }
  );
  it("reproduces supplied response: both later sweeps failed, only first result retained", async () => {
    state.errors.apiIdempotency = Object.assign(Error(), { code: 9 });
    state.errors.webhookEvents = Object.assign(Error(), { code: 7 });
    const res = await POST(request());
    const b = await res.json();
    expect(b.results).toEqual([
      { collection: "apiRequestLogs", deleted: 0, hitCap: false },
    ]);
    expect(b.failures).toHaveLength(2);
    expect(b.continuationScheduled).toBe(false);
  });
  it("a successful cap does not spawn continuations when another sweep failed", async () => {
    state.sizes.apiRequestLogs = 500;
    state.errors.apiIdempotency = Error("failure");
    expect((await POST(request())).status).toBe(503);
    expect(state.published).toHaveLength(0);
    expect(state.deleted).toHaveLength(500);
  });
  it("diagnoses retryable batch commit failure without claiming deletions", async () => {
    state.sizes.apiIdempotency = 1;
    state.batchFailure = true;
    const b = await (await POST(request())).json();
    expect(b.failures[0]).toMatchObject({
      collection: "apiIdempotency",
      operation: "batch_delete",
      code: "unavailable",
      retryable: true,
    });
    expect(state.deleted).toHaveLength(0);
    expect(state.published).toHaveLength(0);
  });
  it("recursively deletes webhook children rather than orphaning deliveries", async () => {
    state.sizes.webhookEvents = 2;
    const b = await (await POST(request())).json();
    expect(state.recursive).toEqual(["webhookEvents-0", "webhookEvents-1"]);
    expect(state.deleted).toHaveLength(0);
    expect(b.results[2].deleted).toBe(2);
  });
  it("identifies recursive deletion failures separately from query failures", async () => {
    state.sizes.webhookEvents = 1;
    state.recursiveFailure = true;
    const b = await (await POST(request())).json();
    expect(b.failures[0]).toMatchObject({
      collection: "webhookEvents",
      operation: "recursive_delete",
      code: "permission-denied",
      retryable: false,
    });
    expect(state.published).toHaveLength(0);
  });
  it("drain failures rely on provider retry without an independent chain", async () => {
    state.drainFailure = true;
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect((await res.json()).feedbackFailed).toBe(true);
    expect(state.published).toHaveLength(0);
  });
  it("provider redeliveries of failing operations never publish", async () => {
    state.errors.apiIdempotency = Object.assign(Error(), { code: 14 });
    for (let i = 0; i < 4; i++)
      expect((await POST(request())).status).toBe(503);
    expect(state.published).toHaveLength(0);
  });
});
describe("bounded cleanup pagination", () => {
  it("schedules capped successes with explicit retries and signed hop metadata", async () => {
    state.sizes.apiRequestLogs = 500;
    const b = await (await POST(request())).json();
    expect(b.continuationScheduled).toBe(true);
    expect(state.published[0]).toMatchObject({
      pathname: "/api/cron/api-cleanup",
      delaySeconds: 60,
      retries: 3,
      body: { cleanupContinuation: { hop: 1 } },
    });
  });
  it("has a finite eight-continuation chain even with perpetual cap results", async () => {
    state.sizes.apiRequestLogs = 500;
    let body: unknown = {};
    for (let i = 0; i < 9; i++) {
      const res = await POST(request(body));
      expect(res.status).toBe(200);
      const b = await res.json();
      if (i < 8) {
        expect(b.continuationScheduled).toBe(true);
        const next = state.published.at(-1);
        if (!next) throw new Error("Expected a published continuation");
        body = next.body;
      } else
        expect(b).toMatchObject({
          continuationScheduled: false,
          continuationStopped: "chain_budget_exhausted",
        });
    }
    expect(state.published).toHaveLength(8);
  });
  it("reuses a stable child dedup key on provider redelivery", async () => {
    state.sizes.apiRequestLogs = 500;
    await POST(request());
    await POST(request());
    expect(state.published[0].deduplicationId).toBe(
      state.published[1].deduplicationId
    );
  });
  it("expires stale chains before reads, deletes or publishes", async () => {
    const b = await (
      await POST(
        request({
          cleanupContinuation: {
            root: "a".repeat(64),
            hop: 1,
            startedAt: Date.now() - 600001,
          },
        })
      )
    ).json();
    expect(b.continuationStopped).toBe("chain_expired");
    expect(state.queries).toHaveLength(0);
    expect(state.published).toHaveLength(0);
  });
  it.each([-1, 0, 9, 1.5])(
    "rejects malformed continuation hop %s",
    async (hop) => {
      expect(
        (
          await POST(
            request({
              cleanupContinuation: {
                root: "a".repeat(64),
                hop,
                startedAt: Date.now(),
              },
            })
          )
        ).status
      ).toBe(400);
      expect(state.queries).toHaveLength(0);
    }
  );
  it("failed publishing returns 503 but does not manufacture another chain", async () => {
    state.sizes.apiRequestLogs = 500;
    state.publishOk = false;
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect((await res.json()).continuationScheduled).toBe(false);
    expect(state.published).toHaveLength(1);
  });
  it("agent OFF does not schedule receipt-only continuations", async () => {
    state.pending = true;
    expect((await POST(request())).status).toBe(200);
    expect(state.published).toHaveLength(0);
  });
  it("keeps bounded successful receipt delivery while ON", async () => {
    vi.stubEnv("DIVINEX_AGENT_OUTCOME_ENABLED", "true");
    state.pending = true;
    expect((await POST(request())).status).toBe(200);
    expect(state.published).toHaveLength(1);
  });
  it("refuses invalid signatures before touching data", async () => {
    state.signed = false;
    expect((await POST(request())).status).toBe(401);
    expect(state.queries).toHaveLength(0);
    expect(state.published).toHaveLength(0);
  });
});
