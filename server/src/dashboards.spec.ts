import { RequestOptionsFromClient } from "@dagda/server/src/api";
import { RoleStore } from "@dagda/server/src/auth/roles";
import { UserStore } from "@dagda/server/src/auth/users";
import { createTestDatabase, TEST_DB_URL, TestDatabase } from "@dagda/server/src/test/pg.fixture";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { OperationType, SQLOperation, SQLTransactionData } from "@dagda/shared/src/sql/transaction";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { ServerApp } from "./app";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";

const available = inject("databaseAvailable");

/**
 * The exit gate of Dagda ROADMAP tranche 4: "deux utilisateurs, des tableaux
 * de bord distincts, un tableau partagé, et rien qui fuite entre les deux" —
 * checked here at both the fetch level (`_fetch`/`_submit`) and the
 * notification level (`_notificationRecipients`). A real `ServerApp` is
 * constructed against the isolated test schema, migrated, but never
 * `listen()`s — no HTTP port, no broker connection — so `_fetch`/`_submit`/
 * `_notificationRecipients` can be called directly, the same way the actual
 * `/fetch` and `/submit` routes would.
 *
 * Sharing model (review feedback, superseding the original "owner picks a
 * recipient"): a dashboard is owner-flagged public or not; any OTHER account
 * may then insert its own `dashboard_shares` row ("import") for a public
 * dashboard — never for someone else, never for a private one. `isPublic` is
 * a live gate: flipping it back to false hides the dashboard from an
 * existing importer's next fetch, even though their import row is untouched.
 */
describe.runIf(available)("Dashboards — ownership and sharing", () => {

    let db: TestDatabase;
    let app: ServerApp;
    let alice: UserInfo;
    let bob: UserInfo;

    beforeEach(async () => {
        db = await createTestDatabase("dashboards");

        const url = new URL(TEST_DB_URL);
        url.searchParams.set("options", `-c search_path=${db.schema}`);
        process.env["PORT"] = "0";
        process.env["BASE_URL"] = "http://localhost";
        process.env["DB_URL"] = url.toString();
        // A settings encryption key is mandatory the moment a secret setting
        // is declared (Dagda FEATURES §11.5) — mqtt.password is one. Must
        // decode to exactly 32 bytes, unlike the session secret.
        process.env["SECRET_KEY"] = "glUGBe5xyLTagSXb4SFa3oQBxeVoqVymDlqy9lDSEO0=";

        // Dynamic imports, after the env vars above are set: the app's model
        // and settings modules have no side effects reading them, but this
        // keeps the dependency explicit rather than relying on import order.
        const { APP_MODEL } = await import("@mqtt-toolbox/shared/src/entities/model");
        const { APP_CONTEXT_ADAPTER } = await import("@mqtt-toolbox/shared/src/entities/contexts");
        const { APP_SETTINGS } = await import("@mqtt-toolbox/shared/src/settings");
        const { APP_PERMISSIONS } = await import("@mqtt-toolbox/shared/src/permissions");

        app = new ServerApp({ staticFolder: "." }, APP_MODEL, APP_CONTEXT_ADAPTER, APP_SETTINGS, undefined, APP_PERMISSIONS);
        await (app as unknown as { migrate: () => Promise<void> }).migrate();

        const roles: RoleStore = (app as unknown as { _roles: RoleStore })._roles;
        const users: UserStore = (app as unknown as { _users: UserStore })._users;
        const editorRole = await roles.create({ name: "Editor", permissions: ["dashboards.edit"] });

        // Both hold dashboards.edit: the exit gate is "two users, distinct
        // dashboards, one shared" — both create their own.
        const createdAlice = await users.create({ login: "alice", password: "hunter2" });
        await users.setRole(createdAlice.id, editorRole.id);
        alice = (await users.getById(createdAlice.id))!;

        const createdBob = await users.create({ login: "bob", password: "hunter2" });
        await users.setRole(createdBob.id, editorRole.id);
        bob = (await users.getById(createdBob.id))!;
    });

    afterEach(async () => {
        await db?.dispose();
    });

    /** Calls the real `_submit()` as if the client route had (request/response are unused beyond `.sessionID`, absent here on purpose) */
    function submitAs(user: UserInfo, operations: SQLOperation<AppEntityTypes, keyof AppEntityTypes>[]) {
        const options: RequestOptionsFromClient = {
            type: "client",
            request: {} as RequestOptionsFromClient["request"],
            response: {} as RequestOptionsFromClient["response"],
            user
        };
        const transactionData: SQLTransactionData<AppEntityTypes, AppContexts> = { operations, contexts: [] };
        return (app as unknown as {
            _submit: (t: SQLTransactionData<AppEntityTypes, AppContexts>, r: RequestOptionsFromClient) => Promise<{ updatedIds: Record<number, number> }>
        })._submit(transactionData, options);
    }

    function fetchAs(user: UserInfo, context: AppContexts) {
        const options: RequestOptionsFromClient = {
            type: "client",
            request: {} as RequestOptionsFromClient["request"],
            response: {} as RequestOptionsFromClient["response"],
            user
        };
        return (app as unknown as {
            _fetch: (c: AppContexts, r: RequestOptionsFromClient) => Promise<{
                dashboards?: { id: number, name: string }[],
                dashboard_shares?: { id: number, dashboardId: number, userId: number }[]
            }>
        })._fetch(context, options);
    }

    async function createDashboard(owner: UserInfo, name: string, isPublic = false): Promise<number> {
        const result = await submitAs(owner, [{
            type: OperationType.INSERT,
            options: { table: "dashboards", item: { id: -1, ownerId: owner.id, name, html: "<p>hi</p>", sortOrder: 0, isPublic } as never }
        }]);
        return result.updatedIds[-1]!;
    }

    async function setPublic(owner: UserInfo, dashboardId: number, isPublic: boolean): Promise<void> {
        await submitAs(owner, [{
            type: OperationType.UPDATE,
            options: { table: "dashboards", id: asNamed(dashboardId), values: { isPublic } }
        }]);
    }

    /** The recipient imports a dashboard for themselves — the only shape `_checkDashboardWriteAccess` now accepts */
    async function importAs(recipient: UserInfo, dashboardId: number): Promise<void> {
        await submitAs(recipient, [{
            type: OperationType.INSERT,
            options: { table: "dashboard_shares", item: { id: -1, dashboardId, userId: recipient.id } as never }
        }]);
    }

    it("never includes another user's private dashboard in a fetch", async () => {
        await createDashboard(alice, "Alice's private board");
        await createDashboard(bob, "Bob's private board");

        const bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards?.map((d) => d.name)).toEqual(["Bob's private board"]);
    });

    it("includes a public dashboard once imported, for the importer only", async () => {
        const dashboardId = await createDashboard(alice, "Alice's board", true);

        let bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards).toEqual([]);

        await importAs(bob, dashboardId);

        bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards?.map((d) => d.name)).toEqual(["Alice's board"]);
    });

    it("never lists a private dashboard as importable, and never appears merely by existing", async () => {
        await createDashboard(alice, "Alice's private board", false);

        const publicList = await fetchAs(bob, { type: "publicDashboards", options: undefined });
        expect(publicList.dashboards).toEqual([]);
    });

    it("lists a public dashboard as importable until it is imported", async () => {
        const dashboardId = await createDashboard(alice, "Public board", true);

        let publicList = await fetchAs(bob, { type: "publicDashboards", options: undefined });
        expect(publicList.dashboards?.map((d) => d.id)).toEqual([dashboardId]);

        await importAs(bob, dashboardId);

        publicList = await fetchAs(bob, { type: "publicDashboards", options: undefined });
        expect(publicList.dashboards).toEqual([]);
    });

    it("rejects importing a private dashboard", async () => {
        const dashboardId = await createDashboard(alice, "Private", false);

        await expect(importAs(bob, dashboardId)).rejects.toThrow(/not public/);
    });

    it("rejects importing a dashboard for someone else", async () => {
        const dashboardId = await createDashboard(alice, "Public board", true);

        await expect(submitAs(bob, [{
            type: OperationType.INSERT,
            options: { table: "dashboard_shares", item: { id: -1, dashboardId, userId: alice.id } as never }
        }])).rejects.toThrow(/only import a dashboard for yourself/);
    });

    it("revoking public access hides the dashboard from an existing importer's next fetch", async () => {
        const dashboardId = await createDashboard(alice, "Now you see it", true);
        await importAs(bob, dashboardId);

        let bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards?.map((d) => d.id)).toEqual([dashboardId]);

        await setPublic(alice, dashboardId, false);

        bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards).toEqual([]);
    });

    it("includes the importer's own dashboard_shares row on a dashboard they don't own, so the client can find its id to leave (bug fix)", async () => {
        const dashboardId = await createDashboard(alice, "Public board", true);
        await importAs(bob, dashboardId);

        const bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboard_shares).toEqual([
            expect.objectContaining({ dashboardId, userId: bob.id })
        ]);
    });

    it("never includes another user's own import row of a dashboard the caller doesn't own", async () => {
        const dashboardId = await createDashboard(alice, "Public board", true);
        await importAs(bob, dashboardId);

        // A third party who neither owns nor imported it must see no rows at all.
        const users: UserStore = (app as unknown as { _users: UserStore })._users;
        const roles: RoleStore = (app as unknown as { _roles: RoleStore })._roles;
        const editorRole = await roles.create({ name: "Editor2", permissions: ["dashboards.edit"] });
        const createdCarol = await users.create({ login: "carol", password: "hunter2" });
        await users.setRole(createdCarol.id, editorRole.id);
        const carol = (await users.getById(createdCarol.id))!;

        const carolsView = await fetchAs(carol, { type: "dashboards", options: undefined });
        expect(carolsView.dashboard_shares).toEqual([]);
    });

    it("rejects a write to a dashboard the caller does not own", async () => {
        const dashboardId = await createDashboard(alice, "Alice's board");

        await expect(submitAs(bob, [{
            type: OperationType.UPDATE,
            options: { table: "dashboards", id: asNamed(dashboardId), values: { name: "Hijacked" } }
        }])).rejects.toThrow(/do not own/);
    });

    it("rejects creating a dashboard without dashboards.edit", async () => {
        const users: UserStore = (app as unknown as { _users: UserStore })._users;
        const carol = await users.create({ login: "carol", password: "hunter2" });
        await expect(createDashboard(carol, "Carol tries anyway")).rejects.toThrow(/Missing permission/);
    });

    it("never trusts a client-sent owner id", async () => {
        const dashboardId = await submitAs(alice, [{
            type: OperationType.INSERT,
            // Alice claims the dashboard belongs to Bob — must be overwritten.
            options: { table: "dashboards", item: { id: -1, ownerId: bob.id, name: "x", html: "", sortOrder: 0, isPublic: false } as never }
        }]).then((r) => r.updatedIds[-1]!);

        const bobsView = await fetchAs(bob, { type: "dashboards", options: undefined });
        expect(bobsView.dashboards?.some((d) => d.id === dashboardId)).toBe(false);
        const alicesView = await fetchAs(alice, { type: "dashboards", options: undefined });
        expect(alicesView.dashboards?.some((d) => d.id === dashboardId)).toBe(true);
    });

    describe("notification recipients", () => {

        function notificationRecipients(transactionData: SQLTransactionData<AppEntityTypes, AppContexts>, user: UserInfo) {
            const options: RequestOptionsFromClient = {
                type: "client",
                request: {} as RequestOptionsFromClient["request"],
                response: {} as RequestOptionsFromClient["response"],
                user
            };
            return (app as unknown as {
                _notificationRecipients: (t: SQLTransactionData<AppEntityTypes, AppContexts>, r: RequestOptionsFromClient) => Promise<((u: UserInfo) => boolean) | undefined>
            })._notificationRecipients(transactionData, options);
        }

        it("excludes an uninvolved user from a private dashboard's edit", async () => {
            const dashboardId = await createDashboard(alice, "Private");

            const filter = await notificationRecipients({
                operations: [{ type: OperationType.UPDATE, options: { table: "dashboards", id: asNamed(dashboardId), values: { name: "renamed" } } }],
                contexts: []
            }, alice);

            expect(filter).toBeDefined();
            expect(filter!(bob)).toBe(false);
            expect(filter!(alice)).toBe(true);
        });

        it("includes the importer once a public dashboard is imported", async () => {
            const dashboardId = await createDashboard(alice, "Shared", true);
            await importAs(bob, dashboardId);

            const filter = await notificationRecipients({
                operations: [{ type: OperationType.UPDATE, options: { table: "dashboards", id: asNamed(dashboardId), values: { name: "renamed" } } }],
                contexts: []
            }, alice);

            expect(filter!(bob)).toBe(true);
        });

        it("excludes the importer again once they leave", async () => {
            const dashboardId = await createDashboard(alice, "Shared then not", true);
            await importAs(bob, dashboardId);

            const shareRow = await (app as unknown as { _db: { get: (q: string, ...p: unknown[]) => Promise<{ id: number } | null> } })
                ._db.get(`SELECT "id" FROM "data_dashboard_shares" WHERE "dashboardId" = $1 AND "userId" = $2`, dashboardId, bob.id);

            await submitAs(bob, [{ type: OperationType.DELETE, options: { table: "dashboard_shares", id: asNamed(shareRow!.id) } }]);

            const filter = await notificationRecipients({
                operations: [{ type: OperationType.UPDATE, options: { table: "dashboards", id: asNamed(dashboardId), values: { name: "renamed" } } }],
                contexts: []
            }, alice);

            expect(filter!(bob)).toBe(false);
        });

        it("excludes an importer the moment the dashboard is flipped private, even with their import row still in place", async () => {
            const dashboardId = await createDashboard(alice, "Public then private", true);
            await importAs(bob, dashboardId);
            await setPublic(alice, dashboardId, false);

            const filter = await notificationRecipients({
                operations: [{ type: OperationType.UPDATE, options: { table: "dashboards", id: asNamed(dashboardId), values: { name: "renamed" } } }],
                contexts: []
            }, alice);

            expect(filter!(bob)).toBe(false);
        });

        it("does not filter a write to an unrelated table", async () => {
            const filter = await notificationRecipients({
                operations: [{ type: OperationType.INSERT, options: { table: "topics", item: { id: -1, name: "x" } as never } }],
                contexts: []
            }, alice);
            expect(filter).toBeUndefined();
        });

    });

});
