import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { PageService } from "@dagda/client/src/pages/service";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import template from "./status.page.html";

/** Lists every known topic with the date of its last message (FEATURES §7) */
export class StatusPage extends AbstractPageElement {

    @Ref()
    protected _summary!: HTMLParagraphElement;

    @Ref()
    protected _rows!: HTMLTableSectionElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> {
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        await entities.getHandler().fetch({ type: "topics", options: undefined });

        // Reading the cache is synchronous, which is what lets the whole render
        // happen in one pass (Dagda FEATURES §3).
        const topics = entities.getHandler().getItems("topics");
        this._summary.textContent = `${topics.length} topic(s)`;

        this._rows.replaceChildren();
        for (const topic of topics) {
            const row = document.createElement("tr");

            const name = document.createElement("td");
            const link = document.createElement("button");
            link.type = "button";
            link.className = "btn btn-ghost";
            link.textContent = topic.name;
            link.addEventListener("click", () => {
                Dagda.get<PageService>("pages")
                    .setPage("topicHistory", { "topic-id": String(topic.id) })
                    .catch(console.error);
            });
            name.appendChild(link);

            const last = document.createElement("td");
            last.textContent = topic.lastMessageAt == null
                ? "—"
                : new Date(topic.lastMessageAt).toLocaleString();
            row.append(name, last);
            this._rows.appendChild(row);
        }
    }

}
customElements.define("status-page", StatusPage);
