// Permanent regression coverage for a live production incident (2026-08-01):
// the Zeno chat UI showed "The assistant couldn't reach the model. Please
// try again." on a real, valid request. Root cause investigation: the exact
// same request payload (same tools, same system prompt, same message)
// reproduced cleanly against the real OpenRouter API outside the app, so the
// most likely explanation is a transient upstream blip (429/5xx/stalled
// connection) — runAiSuiteTurn() had no retry and no timeout, so a single
// hiccup surfaced directly to the user instead of being absorbed.
//
// This script proves the fix (src/lib/ai-suite/model.ts) actually retries
// transient failures, does NOT retry non-retryable client errors, and aborts
// a stalled connection via timeout — using a real local HTTP server (no
// mocking framework), matching this repo's scripts/ convention.
//
// Run: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-ai-suite-model-retry.mts

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const { runAiSuiteTurn } = await import("../src/lib/ai-suite/model");

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key-not-real";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function okBody() {
  return JSON.stringify({
    choices: [{ message: { content: "hi", tool_calls: [] } }],
  });
}

async function withServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  fn: (url: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// 1. Transient 503 twice, then success — must retry and return the real result.
{
  let hits = 0;
  await withServer(
    (_req, res) => {
      hits++;
      if (hits <= 2) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("temporarily unavailable");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(okBody());
      }
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      const result = await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      check("1. Retries through 2x 503 then succeeds", result.text === "hi" && hits === 3, `hits=${hits}`);
    },
  );
}

// 2. Rate limited (429) with a Retry-After header — must respect it and still succeed.
{
  let hits = 0;
  await withServer(
    (_req, res) => {
      hits++;
      if (hits === 1) {
        res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "0" });
        res.end("rate limited");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(okBody());
      }
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      const result = await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      check("2. Retries through a 429 with Retry-After", result.text === "hi" && hits === 2, `hits=${hits}`);
    },
  );
}

// 3. Non-retryable 400 — must fail immediately, NOT burn through retries.
{
  let hits = 0;
  await withServer(
    (_req, res) => {
      hits++;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad request: invalid model" } }));
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      let threw = false;
      try {
        await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      } catch (err) {
        threw = err instanceof Error && err.message.includes("400");
      }
      check("3. Non-retryable 400 fails on the FIRST attempt (no wasted retries)", threw && hits === 1, `hits=${hits}`);
    },
  );
}

// 4. Persistent 500 across every retry — must exhaust retries and throw a
// clear error (not hang forever, not silently return empty).
{
  let hits = 0;
  await withServer(
    (_req, res) => {
      hits++;
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("server error");
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      let threw = false;
      try {
        await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      } catch (err) {
        threw = err instanceof Error && err.message.includes("500");
      }
      // MAX_MODEL_RETRIES = 3 → 4 total attempts (1 initial + 3 retries).
      check("4. Persistent 500 exhausts retries then throws", threw && hits === 4, `hits=${hits}`);
    },
  );
}

// 5. A connection that never responds — the timeout must abort it rather
// than hanging indefinitely. Uses a short timeout override so this test
// runs in ~1s instead of a real 45s wait.
{
  let hits = 0;
  process.env.AI_SUITE_MODEL_TIMEOUT_MS = "300";
  await withServer(
    (_req, _res) => {
      hits++;
      // Never call res.end() — simulates a stalled upstream connection.
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      let threw = false;
      const started = Date.now();
      try {
        await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      } catch {
        threw = true;
      }
      const elapsed = Date.now() - started;
      // 4 attempts x ~300ms timeout + capped backoff between them lands
      // under 10s — nowhere near the real 45s default, proving the abort
      // actually fired instead of the request hanging out the full timeout.
      check("5. Stalled connection aborts via timeout (not a real hang)", threw && elapsed < 10_000, `elapsed=${elapsed}ms hits=${hits}`);
    },
  );
  delete process.env.AI_SUITE_MODEL_TIMEOUT_MS;
}

// 6. Regression guard for a second, separately-discovered live incident
// (2026-08-02): create_funnel grew rich multi-paragraph fields
// (story_paragraphs, trust_badges, faq_items, confirmation_email_body) and
// the default max_tokens was still 1024 — a real proposal's tool-call JSON
// routinely exceeded that, silently truncated mid-object, failed to parse,
// and fell back to {}, which then misleadingly looked like "the model
// won't write a headline" (every one of 4 real vertical tests failed this
// way before the fix). This doesn't call the real model — it just asserts
// the DEFAULT request body actually asks for enough headroom, so a future
// edit can't silently shrink it back down without this catching it.
{
  let capturedMaxTokens: number | undefined;
  await withServer(
    (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        capturedMaxTokens = JSON.parse(body).max_tokens;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(okBody());
      });
    },
    async (url) => {
      process.env.AI_SUITE_MODEL_URL_OVERRIDE = url;
      // No maxTokens override — exercises the real default.
      await runAiSuiteTurn({ messages: [{ role: "user", content: "hi" }], tools: [] });
      check(
        "6. Default max_tokens has enough headroom for a rich create_funnel response",
        (capturedMaxTokens ?? 0) >= 4096,
        `max_tokens=${capturedMaxTokens}`,
      );
    },
  );
}

delete process.env.AI_SUITE_MODEL_URL_OVERRIDE;

console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
if (failures > 0) process.exit(1);
