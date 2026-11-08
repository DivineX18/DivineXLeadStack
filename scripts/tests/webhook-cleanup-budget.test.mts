import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { cleanupDb } from "./cleanup-db-fixture.mts";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminDb: () => state.db }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => new Date() },
}));
vi.mock("@/lib/ai-suite/outcome-feedback", () => ({
  drainFeedback: async () => false,
}));
vi.mock("@/lib/automations/qstash", () => ({
  verifyQStashSignature: async () => true,
  publishCallback: vi.fn(async () => ({ messageId: "synthetic" })),
}));
import { sweepBoundedWebhookEvents } from "@/lib/api/webhooks/cleanup";
import {
  createDelivery,
  updateDelivery,
  getEvent,
} from "@/lib/firestore/webhook-events";
import { POST } from "@/app/api/cron/api-cleanup/route";
const now = new Date("2026-11-08T12:00:00Z"),
  parent = "subAccounts/A/webhookEvents/event";
let f: ReturnType<typeof cleanupDb>;
function seed(n = 0) {
  f.rows.set(parent, { expiresAt: new Date(now.getTime() - 1000) });
  for (let i = 0; i < n; i++)
    f.rows.set(parent + "/deliveries/d" + i, { status: "succeeded" });
}
const input = {
  subAccountId: "A",
  agencyId: "agency",
  eventId: "event",
  subscriptionId: "subscription",
  attempt: 1,
  url: "https://synthetic.invalid",
  scheduledAt: now,
};
beforeEach(() => {
  f = cleanupDb();
  state.db = f.db;
  vi.stubEnv("DIVINEX_AGENT_OUTCOME_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("enforces 500 INCLUDING children and resumes safely", async () => {
  seed(501);
  const a = await sweepBoundedWebhookEvents(f.db, now);
  expect(a).toMatchObject({
    deleted: 500,
    deliveriesDeleted: 500,
    parentsDeleted: 0,
    hitCap: true,
  });
  expect(f.rows.get(parent)?.cleanupState).toBe("deleting");
  const b = await sweepBoundedWebhookEvents(f.db, now);
  expect(b).toMatchObject({
    deleted: 2,
    deliveriesDeleted: 1,
    parentsDeleted: 1,
  });
  expect(f.rows.size).toBe(0);
  expect(new Set(f.deleted).size).toBe(502);
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(0);
});
it("removes exactly 499 leaves and their parent within one budget", async () => {
  seed(499);
  const r = await sweepBoundedWebhookEvents(f.db, now);
  expect(r.deleted).toBe(500);
  expect(r.parentsDeleted).toBe(1);
  expect(f.rows.size).toBe(0);
});
it("holds deep/unknown descendants without deleting their ancestors", async () => {
  seed(1);
  f.rows.set(parent + "/deliveries/d0/debug/nested", { synthetic: true });
  const r = await sweepBoundedWebhookEvents(f.db, now);
  expect(r.deleted).toBe(0);
  expect(r.held).toBe(1);
  expect(f.rows.has(parent)).toBe(true);
  expect(f.rows.size).toBe(3);
});
it("detects missing intermediate delivery documents with descendants", async () => {
  seed();
  f.rows.set(parent + "/deliveries/missing/deep/record", { synthetic: true });
  const r = await sweepBoundedWebhookEvents(f.db, now);
  expect(r.deleted).toBe(0);
  expect(r.held).toBe(1);
  expect(f.rows.has(parent)).toBe(true);
});
it("holds unknown event subcollections before claiming a parent", async () => {
  seed();
  f.rows.set(parent + "/unknown/doc", {});
  expect((await sweepBoundedWebhookEvents(f.db, now)).held).toBe(1);
  expect(f.rows.get(parent)?.cleanupState).toBeUndefined();
});
it("preserves parents with pending or scheduled retry work", async () => {
  seed(1);
  f.rows.get(parent + "/deliveries/d0")!.status = "pending";
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(0);
  expect(f.rows.get(parent)?.cleanupState).toBeUndefined();
  f.rows.set(parent + "/deliveries/d0", {
    status: "failed",
    nextRetryAt: new Date(now.getTime() + 60000),
  });
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(0);
});
it("preserves unexpired retention and catches concurrent retention extension", async () => {
  seed();
  f.rows.get(parent)!.expiresAt = new Date(now.getTime() + 1);
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(0);
  f.rows.get(parent)!.expiresAt = new Date(now.getTime() - 1);
  f.onNextTransaction(() => {
    f.rows.get(parent)!.expiresAt = new Date(now.getTime() + 1);
  });
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(0);
  expect(f.rows.get(parent)?.cleanupState).toBeUndefined();
});
it("recovers after committed chunk with lost acknowledgment", async () => {
  seed(600);
  let fail = true;
  await expect(
    sweepBoundedWebhookEvents(f.db, now, async (op, work) => {
      const r = await work();
      if (op === "delete_delivery_batch" && fail) {
        fail = false;
        throw Error("simulated process interruption");
      }
      return r;
    })
  ).rejects.toThrow("interruption");
  expect(f.deleted).toHaveLength(499);
  expect(f.rows.has(parent)).toBe(true);
  const r = await sweepBoundedWebhookEvents(f.db, now);
  expect(r.deleted).toBe(102);
  expect(new Set(f.deleted).size).toBe(601);
});
it("concurrent workers cannot exceed individual budgets or orphan children", async () => {
  seed(800);
  const results = await Promise.all([
    sweepBoundedWebhookEvents(f.db, now),
    sweepBoundedWebhookEvents(f.db, now),
  ]);
  expect(results.every((r) => r.deleted <= 500)).toBe(true);
  await sweepBoundedWebhookEvents(f.db, now);
  expect(f.rows.size).toBe(0);
  expect(new Set(f.deleted).size).toBe(801);
});
it("create and update writers preserve ordinary delivery behavior", async () => {
  seed();
  const created = await createDelivery(input);
  expect(f.rows.get(parent + "/deliveries/" + created.id)?.status).toBe(
    "pending"
  );
  await updateDelivery("A", "event", created.id, { status: "succeeded" });
  expect(f.rows.get(parent + "/deliveries/" + created.id)?.status).toBe(
    "succeeded"
  );
  expect(f.rows.get(parent)?.deliveryUpdatedAt).toBeInstanceOf(Date);
});
it("fences new deliveries and hides cleanup-owned events", async () => {
  seed(501);
  await sweepBoundedWebhookEvents(f.db, now);
  await expect(createDelivery(input)).rejects.toThrow("unavailable");
  expect(await getEvent("A", "event")).toBeNull();
});
it("late updates never recreate a removed parent or delivery", async () => {
  seed(1);
  await sweepBoundedWebhookEvents(f.db, now);
  await updateDelivery("A", "event", "d0", { status: "succeeded" });
  expect(f.rows.size).toBe(0);
  await expect(createDelivery(input)).rejects.toThrow("unavailable");
});
it("concurrent append either remains pending or loses to the cleanup fence", async () => {
  seed();
  const [delivery] = await Promise.allSettled([
    createDelivery(input),
    sweepBoundedWebhookEvents(f.db, now),
  ]);
  if (delivery.status === "fulfilled") {
    expect(f.rows.has(parent)).toBe(true);
    expect(
      f.rows.get(parent + "/deliveries/" + delivery.value.id)?.status
    ).toBe("pending");
  } else expect(f.rows.size).toBe(0);
});
it("cleanup route ceiling is 1500 actual documents across all three groups", async () => {
  for (const group of ["apiRequestLogs", "apiIdempotency"])
    for (let i = 0; i < 500; i++)
      f.rows.set("subAccounts/A/" + group + "/" + i, {
        expiresAt: new Date(Date.now() - 10000),
      });
  seed(600);
  const response = await POST(
    new Request("http://fixture/api/cron/api-cleanup", {
      method: "POST",
      headers: { "upstash-signature": "synthetic" },
      body: "{}",
    })
  );
  const r = await response.json();
  expect(response.status).toBe(200);
  expect(
    r.results.reduce((n: number, x: { deleted: number }) => n + x.deleted, 0)
  ).toBe(1500);
  expect(f.deleted).toHaveLength(1500);
  expect(f.rows.has(parent)).toBe(true);
  expect(r.continuationScheduled).toBe(true);
});
it("failed chunk commits leave all children intact and retry safely", async () => {
  seed(2);
  await expect(
    sweepBoundedWebhookEvents(f.db, now, async (op, work) => {
      if (op === "delete_delivery_batch") throw Error("unavailable");
      return work();
    })
  ).rejects.toThrow("unavailable");
  expect(f.deleted).toHaveLength(0);
  expect(f.rows.size).toBe(3);
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(3);
});
it("interruption before parent deletion retains resumable empty parent", async () => {
  seed(2);
  await expect(
    sweepBoundedWebhookEvents(f.db, now, async (op, work) => {
      if (op === "delete_empty_parent") throw Error("interruption");
      return work();
    })
  ).rejects.toThrow("interruption");
  expect(f.deleted).toHaveLength(2);
  expect(f.rows.has(parent)).toBe(true);
  expect((await sweepBoundedWebhookEvents(f.db, now)).deleted).toBe(1);
});
it("hold-only deep or active work never creates a continuation loop", async () => {
  seed(1);
  f.rows.set(parent + "/deliveries/d0/deep/record", {});
  const response = await POST(
    new Request("http://fixture/api/cron/api-cleanup", {
      method: "POST",
      headers: { "upstash-signature": "synthetic" },
      body: "{}",
    })
  );
  const r = await response.json();
  expect(r.results[2]).toMatchObject({ deleted: 0, held: 1, hitCap: false });
  expect(r.continuationScheduled).toBe(false);
  expect(r.continuationRequired).toBe(false);
});
