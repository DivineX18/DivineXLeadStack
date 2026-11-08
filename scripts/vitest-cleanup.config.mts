import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const config = {
  root,
  resolve: {
    alias: {
      "@": root + "src",
      "next/server": root + "node_modules/next/server.js",
    },
  },
  test: {
    environment: "node",
    include: [
      "scripts/tests/api-cleanup.test.mts",
      "scripts/tests/qstash-cleanup.test.mts",
      "scripts/tests/webhook-cleanup-budget.test.mts",
    ],
  },
};

export default config;
