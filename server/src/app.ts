import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp, PassportProfile } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";

export class ServerApp extends AbstractServerApp<AppTypes> {

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
                result.topics = await this._db.all(`SELECT * FROM topics ORDER BY name`);
                break;
            }
            case "topic": {
                const topicId = context.options.topicId;
                result.topics = await this._db.all(`SELECT * FROM topics WHERE id = $1`, topicId);
                result.messages = await this._db.all(
                    `SELECT * FROM messages WHERE "topicId" = $1 ORDER BY "receivedAt" DESC`,
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
