import { beforeEach, afterEach, it, expect, vi } from "vitest";
type Published = {
  url: string;
  body: Record<string, unknown>;
  delay: number;
  deduplicationId: string;
  retries?: number;
};
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ calls: [] as Published[], fail: false }));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    async publishJSON(input: Published) {
      state.calls.push(input);
      if (state.fail)
        throw Object.assign(Error("secret-token raw-customer-record"), {
          code: 14,
        });
      return { messageId: "fixture" };
    }
  },
  Receiver: class {},
}));
import { publishCallback } from "@/lib/automations/qstash";
beforeEach(() => {
  vi.stubEnv("QSTASH_TOKEN", "synthetic");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fixture.invalid");
  state.calls = [];
  state.fail = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("forwards explicit bounded retries only for opted-in callers", async () => {
  const input = {
    pathname: "/api/cron/api-cleanup",
    body: {},
    delaySeconds: 60,
    deduplicationId: "fixture",
  };
  await publishCallback({ ...input, retries: 3 });
  expect(state.calls[0].retries).toBe(3);
  await publishCallback({ ...input, pathname: "/api/cron/google-sync" });
  expect(state.calls[1]).not.toHaveProperty("retries");
  await publishCallback({ ...input, pathname: "/api/cron/gitpage-heartbeat" });
  expect(state.calls[2]).not.toHaveProperty("retries");
});
it("cleanup error callback prevents raw SDK exception logging", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const onError = vi.fn();
  state.fail = true;
  expect(
    await publishCallback({
      pathname: "/api/cron/api-cleanup",
      body: {},
      delaySeconds: 60,
      deduplicationId: "fixture",
      retries: 3,
      onError,
    })
  ).toBeNull();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(log).not.toHaveBeenCalled();
});
