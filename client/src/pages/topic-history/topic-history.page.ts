import { actionCall } from "@dagda/client/src/actions";
import { Attribute, NumberMarshaller, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { FieldEditor } from "@dagda/client/src/forms/editors";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { AppActions } from "@mqtt-toolbox/shared/src/actions";
import { MESSAGE_SOURCE } from "@mqtt-toolbox/shared/src/entities/model";
import { dagda } from "../../dagda";
import template from "./topic-history.page.html";

/**
 * Every message received or published on one topic, newest first (FEATURES §2).
 *
 * Opened from the Status page, never listed in the menu of its own — a page
 * with no `menu` in its `PageInfo` is reachable without being an entry
 * (Dagda `specs/navigation.md`). The topic is handed over as an attribute,
 * set by `PageHandler.setPage()` before this page's first refresh, exactly
 * like any other typed, observable value on a custom element.
 */
export class TopicHistoryPage extends AbstractPageElement {

    @Attribute({ name: "topic-id", marshaller: NumberMarshaller })
    protected _topicId!: number | null;

    @Ref()
    protected _back!: HTMLButtonElement;
    @Ref()
    protected _title!: HTMLHeadingElement;
    @Ref("quick-publish")
    protected _quickPublish!: HTMLFormElement;
    @Ref("quick-payload")
    protected _quickPayload!: FieldEditor<string>;
    @Ref()
    protected _summary!: HTMLParagraphElement;
    @Ref()
    protected _rows!: HTMLTableSectionElement;

    /** Set by _refresh(), read by the quick-publish form: the name, not just the id, is what publishMessage needs */
    protected _topicName: string | null = null;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._back.addEventListener("click", () => {
            dagda.pages.setPage("status").catch(console.error);
        });

        this._quickPublish.addEventListener("submit", (event) => {
            event.preventDefault();
            this._publishNow().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });
    }

    protected async _publishNow(): Promise<void> {
        const topic = this._topicName;
        if (topic == null) {
            showToast("Topic inconnu.");
            return;
        }
        const payload = this._quickPayload.value ?? "";
        await actionCall<AppActions, "publishMessage">("publishMessage", { topic, payload });
        this._quickPayload.value = "";
    }

    protected override async _refresh(): Promise<void> {
        const topicId = this._topicId;
        if (topicId == null) {
            // Reached without a topic — the console (FEATURES §11.2) can call
            // setPage() with no attribute at all — so there is nothing to fetch.
            this._topicName = null;
            this._title.textContent = "Topic inconnu";
            this._summary.textContent = "";
            this._rows.replaceChildren();
            return;
        }

        const entities = dagda.entities;
        await entities.getHandler().fetch(
            { type: "topics", options: undefined },
            { type: "topic", options: { topicId: asNamed<"TOPIC_ID", number>(topicId) } }
        );

        const topic = entities.getHandler().getById("topics", topicId);
        this._topicName = topic?.name ?? null;
        this._title.textContent = topic?.name ?? `Topic #${topicId}`;

        // Reading the cache is synchronous, which is what lets the whole
        // render happen in one pass (Dagda FEATURES §3). The cache may also
        // hold messages fetched for a topic visited earlier in the session,
        // so this page filters rather than trusting the cache to hold only
        // what it just asked for.
        const messages = entities.getHandler().getItems("messages")
            .filter(message => message.topicId === topicId)
            .sort((a, b) => b.receivedAt - a.receivedAt);

        this._summary.textContent = `${messages.length} message(s)`;

        this._rows.replaceChildren();
        for (const message of messages) {
            const row = document.createElement("tr");

            const received = document.createElement("td");
            received.textContent = new Date(message.receivedAt).toLocaleString();

            const content = document.createElement("td");
            content.textContent = message.payloadIsBase64
                ? `(binaire, ${message.payload.length} caractères encodés)`
                : message.payload;

            const source = document.createElement("td");
            source.textContent = MESSAGE_SOURCE.getLabel(message.source) ?? String(message.source);

            row.append(received, content, source);
            this._rows.appendChild(row);
        }
    }

}
customElements.define("topic-history-page", TopicHistoryPage);
