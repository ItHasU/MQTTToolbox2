import { defineConfig } from "vitest/config";

/**
 * Point the framework's PostgreSQL fixture at this application's database.
 *
 * Set here, in the config module, rather than through `test.env`: the global
 * setup that probes the database runs in the Vitest main process, before any
 * worker exists, so `test.env` would come too late and the probe would look for
 * the framework's own database instead.
 *
 * An explicit DAGDA_TEST_DB_URL still wins, for a run against another server.
 */
process.env["DAGDA_TEST_DB_URL"] ??= "postgresql://mqtt:mqtt@localhost:5433/mqtt";

export default defineConfig({
    test: {
        projects: [
            {
                // The typed contract: model, contexts. No DOM, no database.
                test: {
                    name: "shared",
                    root: "./shared",
                    environment: "node",
                    include: ["src/**/*.spec.ts"]
                }
            },
            {
                // Server side, including the tests that need a real PostgreSQL.
                test: {
                    name: "server",
                    root: "./server",
                    environment: "node",
                    include: ["src/**/*.spec.ts"],
                    // The framework's fixture, reused rather than copied: one
                    // implementation of "a scratch schema per suite".
                    globalSetup: ["../node_modules/@dagda/server/src/test/pg.globalsetup.ts"]
                }
            }
        ]
    }
});
