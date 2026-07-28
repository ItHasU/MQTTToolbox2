import { actionCall } from "@dagda/client/src/actions";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { EnumFieldEditor, FieldEditor } from "@dagda/client/src/forms/editors";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { Event } from "@dagda/shared/src/tools/events";
import { AppActions, QOS, ScheduledPublish } from "@mqtt-toolbox/shared/src/actions";
import { dagda } from "../../dagda";
import { DateTimeFieldEditor } from "../../forms/editors/datetime.editor";
import template from "./publish.page.html";

/**
 * Compose and send a message, immediately or later (FEATURES §3), and manage
 * the queue of what is still pending.
 *
 * The fields are the default editors of the form generator (Dagda FEATURES
 * §8.1) used directly, not assembled from a declared field list: this page
 * has a fixed, small shape, so hand-wiring five editors costs less than the
 * generic assembly the settings screen and the permission matrix will need
 * (Dagda ROADMAP tranche 3) — that piece is still to come.
 */
export class PublishPage extends AbstractPageElement {

    @Ref()
    protected _form!: HTMLFormElement;
    @Ref()
    protected _topic!: FieldEditor<string>;
    @Ref()
    protected _payload!: FieldEditor<string>;
    @Ref()
    protected _retain!: FieldEditor<boolean>;
    @Ref()
    protected _qos!: EnumFieldEditor;
    @Ref("mode-now")
    protected _modeNow!: HTMLInputElement;
    @Ref("mode-later")
    protected _modeLater!: HTMLInputElement;
    @Ref("send-at-field")
    protected _sendAtField!: HTMLElement;
    @Ref("send-at")
    protected _sendAt!: DateTimeFieldEditor;
    @Ref("pending-summary")
    protected _pendingSummary!: HTMLParagraphElement;
    @Ref("pending-rows")
    protected _pendingRows!: HTMLTableSectionElement;

    protected _pending: ScheduledPublish[] = [];

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        // hasDefault: true — a blank leading option here was selectable but
        // meaningless (submitting with it silently fell back to QoS 0
        // anyway), since the very next line already gives this field a
        // real default.
        this._qos.setEnumeration(QOS, true);
        this._qos.value = QOS.values.AT_MOST_ONCE;

        this._modeNow.addEventListener("change", () => this._syncMode());
        this._modeLater.addEventListener("change", () => this._syncMode());
        this._syncMode();

        this._form.addEventListener("submit", (event) => {
            event.preventDefault();
            this._submitForm().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });

        // Kept live rather than re-fetched on every refresh (FEATURES §9):
        // a message firing on its own schedule, with nobody on this page at
        // the time, must still leave the list correct once someone is.
        dagda.notification
            .on("scheduledPublishesChanged", (event: Event<ScheduledPublish[]>) => {
                this._pending = event.data;
                this._renderPending();
            });

        try {
            this._pending = await actionCall<AppActions, "listScheduledPublishes">("listScheduledPublishes");
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
        }
    }

    protected override async _refresh(): Promise<void> {
        this._renderPending();
    }

    protected _syncMode(): void {
        this._sendAtField.hidden = !this._modeLater.checked;
    }

    protected async _submitForm(): Promise<void> {
        const topic = this._topic.value?.trim() ?? "";
        if (topic === "") {
            showToast("Le topic ne peut pas être vide.");
            return;
        }
        const payload = this._payload.value ?? "";
        const retain = this._retain.value === true;
        const qos = (this._qos.value ?? QOS.values.AT_MOST_ONCE) as 0 | 1 | 2;

        if (this._modeLater.checked) {
            const sendAt = this._sendAt.value;
            if (sendAt == null) {
                showToast("Choisissez une date d'envoi.");
                return;
            }
            if (sendAt <= Date.now()) {
                showToast("La date d'envoi doit être dans le futur.");
                return;
            }
            await actionCall<AppActions, "schedulePublish">("schedulePublish", { topic, payload, retain, qos, sendAt });
        } else {
            await actionCall<AppActions, "publishMessage">("publishMessage", { topic, payload, retain, qos });
        }

        this._resetForm();
    }

    protected _resetForm(): void {
        this._topic.value = "";
        this._payload.value = "";
        this._retain.value = false;
        this._qos.value = QOS.values.AT_MOST_ONCE;
        this._sendAt.value = null;
        this._modeNow.checked = true;
        this._syncMode();
    }

    protected _renderPending(): void {
        this._pendingSummary.textContent = this._pending.length === 0
            ? "Aucune publication programmée."
            : `${this._pending.length} publication(s) programmée(s)`;

        this._pendingRows.replaceChildren();
        for (const entry of this._pending) {
            const row = document.createElement("tr");

            const topic = document.createElement("td");
            topic.textContent = entry.topic;

            const payload = document.createElement("td");
            payload.textContent = entry.payload;

            const sendAt = document.createElement("td");
            sendAt.textContent = new Date(entry.sendAt).toLocaleString();

            const actionsCell = document.createElement("td");
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "btn btn-ghost";
            cancel.textContent = "Annuler";
            cancel.addEventListener("click", () => {
                actionCall<AppActions, "cancelScheduledPublish">("cancelScheduledPublish", { id: entry.id })
                    .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            actionsCell.appendChild(cancel);

            row.append(topic, payload, sendAt, actionsCell);
            this._pendingRows.appendChild(row);
        }
    }

}
customElements.define("publish-page", PublishPage);
