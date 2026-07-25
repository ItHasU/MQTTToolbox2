import { DEFAULT_SERVER_PARAMS } from "@dagda/server/src/app";
import { AppContextAdapter } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { ServerApp } from "./app";

async function main(): Promise<void> {
    // Fails fast if the model itself is inconsistent, before anything touches
    // the database (Dagda FEATURES §2).
    APP_MODEL.validate();

    const app = new ServerApp({ ...DEFAULT_SERVER_PARAMS }, APP_MODEL, new AppContextAdapter());
    if (app.isGoogleStrategyConfigured) {
        app.registerGoogleStrategy();
    } else {
        console.warn("No Google credentials configured, starting without any authentication strategy.");
    }
    await app.listen();
}

main().catch(e => console.error(e));
