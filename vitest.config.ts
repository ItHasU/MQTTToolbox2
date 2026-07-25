import { defineConfig } from "vitest/config";

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
                test: {
                    name: "server",
                    root: "./server",
                    environment: "node",
                    include: ["src/**/*.spec.ts"]
                }
            }
        ]
    }
});
