import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { Migration } from "@dagda/server/src/sql/migrations";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { AppSettings } from "@mqtt-toolbox/shared/src/settings";
import { APP_MIGRATIONS } from "./migrations";
import { BrokerConnection, BrokerState } from "./mqtt/broker";
import { MessageIngestor } from "./mqtt/ingest";

// Physical names, prefixed by the framework (Dagda FEATURES §2).
// Read from the model rather than written by hand, so a rename is caught
// by the compiler instead of at the first query.
const TOPICS = APP_MODEL.getTableSqlName("topics");
const MESSAGES = APP_MODEL.getTableSqlName("messages");

export class ServerApp extends AbstractServerApp<AppTypes, AppSettings> {

    /** Set by listen(), once the settings it reads have been loaded */
    protected _broker: BrokerConnection | null = null;
    protected _ingestor: MessageIngestor | null = null;

    /** @inheritdoc */
    protected override _migrations(): Migration[] {
        return APP_MIGRATIONS;
    }

    //#region MQTT ------------------------------------------------------------

    /**
     * Start listening, then connect to the broker (FEATURES §1).
     *
     * In this order because the framework loads the settings as part of
     * listen(), and the connection reads its whole configuration from them.
     */
    public override async listen(): Promise<void> {
        await super.listen();
        this._startBroker();
    }

    protected _startBroker(): void {
        this._ingestor = new MessageIngestor({
            db: this._db,
            settings: this._settings.settings,
            broadcast: (contexts) => this.broadcast("contextChanged", contexts)
        });

        const ingestor = this._ingestor;
        this._broker = new BrokerConnection({
            settings: this._settings.settings,
            onMessage: (message) => ingestor.ingest(message),
            onStateChanged: (state: BrokerState) => {
                // The status page shows this, and it is the only way a user
                // learns the broker went away (FEATURES §1, §7).
                this.broadcast("brokerStateChanged", state);
            }
        });
        this._broker.start();
    }

    /** State of the broker connection, for a client that just arrived */
    public get brokerState(): BrokerState {
        return this._broker?.state ?? { connected: false };
    }

    /** Close the broker connection and write down what is still pending */
    public async stop(): Promise<void> {
        await this._broker?.stop();
        await this._ingestor?.stop();
    }

    //#endregion

    /** @inheritdoc */
    protected override async _fetch(context: AppContexts, _request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
        switch (context.type) {
            case "topics": {
                // The status page shows every topic with the date of its last
                // message; the messages themselves are fetched per topic.
                result.topics = await this._db.all(`SELECT * FROM ${TOPICS} ORDER BY "name"`);
                break;
            }
            case "topic": {
                const topicId = context.options.topicId;
                result.topics = await this._db.all(`SELECT * FROM ${TOPICS} WHERE "id" = $1`, topicId);
                result.messages = await this._db.all(
                    `SELECT * FROM ${MESSAGES} WHERE "topicId" = $1 ORDER BY "receivedAt" DESC`,
                    topicId
                );
                break;
            }
            default: {
                assertUnreachable(context);
            }
        }
        return result;
    }

}
