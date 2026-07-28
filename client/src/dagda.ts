import { ClientDagda, ClientOwnServicesParams } from "@dagda/client/src/app/dagda";
import { BaseServicesParams } from "@dagda/shared/src/dagda";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { MqttApi } from "./dashboard/mqtt-api";
import { AppPages } from "./pages";

/** The application's contract, `pages` included (FEATURES §0) */
export interface AppClientTypes extends AppTypes {
    pages: AppPages;
}

/** The application's own dagda: the framework's `ClientDagda` plus the dashboard's `mqtt` API */
export class AppDagda extends ClientDagda<AppClientTypes> {

    public readonly mqtt: MqttApi;

    constructor(params: BaseServicesParams<AppClientTypes> & ClientOwnServicesParams<AppClientTypes> & { mqtt: MqttApi }) {
        super(params);
        this.mqtt = params.mqtt;
    }

}

/**
 * The running application's services (FEATURES §0) — the same instance as
 * the framework's own `dagda` (`@dagda/client/src/app/dagda`), just viewed
 * through this application's own type, `mqtt` included.
 */
export let dagda: AppDagda;

/**
 * @internal called from `DagdaClient.start()`'s `buildDagda`, synchronously
 * with the framework's own `_setDagda` — both bindings end up pointing at
 * the exact same instance.
 */
export function _setDagda(instance: AppDagda): void {
    dagda = instance;
}
