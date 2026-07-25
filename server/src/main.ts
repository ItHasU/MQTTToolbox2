import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { APP_SETTINGS } from "@mqtt-toolbox/shared/src/settings";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    // Fails fast if the model itself is inconsistent, before anything touches
    // the database (Dagda FEATURES §2).
    APP_MODEL.validate();

    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, APP_CONTEXT_ADAPTER, APP_SETTINGS);
    // Nothing to register: local accounts are the only authentication mode
    // (Dagda FEATURES §7). On an empty database the framework creates
    // admin/admin and says so at startup.

    // A message that arrived but is still queued would otherwise be lost on a
    // container restart, which happens on every deployment.
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            console.log(`Received ${signal}, closing the broker connection...`);
            app.stop().finally(() => process.exit(0));
        });
    }

    await app.listen();
}

main().catch(e => console.error(e));
