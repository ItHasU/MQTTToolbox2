import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { Migration } from "@dagda/server/src/sql/migrations";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { APP_MIGRATIONS } from "./migrations";

// Physical names, prefixed by the framework (Dagda FEATURES §2).
// Read from the model rather than written by hand, so a rename is caught
// by the compiler instead of at the first query.
const TOPICS = APP_MODEL.getTableSqlName("topics");
const MESSAGES = APP_MODEL.getTableSqlName("messages");

export class ServerApp extends AbstractServerApp<AppTypes> {

    /** @inheritdoc */
    protected override _migrations(): Migration[] {
        return APP_MIGRATIONS;
    }

    /** @inheritdoc */
    protected override async _isUserValid(_profile: PassportProfile): Promise<boolean> {
        // No account can be validated yet: local accounts, roles and the
        // invitation flow are a later slice (Dagda FEATURES §7, ROADMAP 3).
        // Until then the application starts with no authentication strategy
        // registered, so this is never reached from a browser. Refusing is the
        // only safe answer if a strategy were configured by hand.
        return false;
    }

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
