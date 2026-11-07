/** Disconnected closeout gate. Explicit isolated ASCEND checkout only; never env files. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const flow = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ascend = process.env.ASCEND_SOURCE_ROOT;
const pglite = process.env.PGLITE_TEST_MODULE;
if (
  !ascend ||
  !pglite ||
  !existsSync(
    resolve(ascend, "artifacts/api-server/src/tests/flowOutcomeLoop.test.ts")
  ) ||
  !existsSync(pglite)
)
  throw new Error(
    "Set ASCEND_SOURCE_ROOT to the isolated candidate and PGLITE_TEST_MODULE to an installed PGlite module. No dependency installation or production env loading is performed."
  );
const config = {
  root: resolve(ascend, "artifacts/api-server"),
  resolve: {
    alias: [
      {
        find: "@workspace/db",
        replacement: resolve(ascend, "lib/db/src/index.ts"),
      },
      { find: "@feedback-test/pglite", replacement: pglite },
      {
        find: "@flow-fixtures/provider-db",
        replacement: resolve(flow, "scripts/fixtures/provider-db.mjs"),
      },
      {
        find: "next/server",
        replacement: resolve(flow, "node_modules/next/server.js"),
      },
      {
        find: /^server-only$/,
        replacement: resolve(
          ascend,
          "artifacts/api-server/src/tests/stubs/server-only.ts"
        ),
      },
      { find: /^@\//, replacement: resolve(flow, "src") + "/" },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "flowOutcomeLoop",
      "releaseBlockers",
      "actionOutcomeLifecycle",
      "outcomeAdapters",
      "tenantIsolation",
      "zenoPromptInjectionAndReliability",
      "intelligenceBridge",
      "shopifyEvidenceBridge",
    ].map((n) => "src/tests/" + n + ".test.ts"),
    testTimeout: 10000,
    env: {
      FLOW_SOURCE_ROOT: flow,
      DATABASE_URL:
        "postgresql://fixture:fixture@127.0.0.1:5432/unused_fixture_only",
    },
  },
};

export default config;
