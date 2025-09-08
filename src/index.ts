#!/usr/bin/env node

/**
 * shikamaru executable entrypoint.
 * Delegates to the CLI runtime in `cli/index.ts` and ensures a production
 * NODE_ENV by default for predictable behavior when installed globally.
 */

import { main } from "./cli/index";
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

// Launch the CLI and fail fast on fatal errors
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
