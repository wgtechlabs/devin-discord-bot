import { describe, expect, test } from "bun:test";
import type { PersistedSessionState } from "../src/services/state-store.js";
import { SessionStateStore } from "../src/services/state-store.js";

class MockDb {
	private rows: PersistedSessionState[] = [];

	async query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
		if (text.includes("CREATE TABLE")) return { rows: [] };
		if (text.includes("CREATE UNIQUE INDEX")) return { rows: [] };
		if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
		if (text.includes("DELETE FROM tracked_sessions WHERE session_id <> ALL")) {
			const keep = new Set((params?.[0] as string[]) ?? []);
			this.rows = this.rows.filter((row) => keep.has(row.sessionId));
			return { rows: [] };
		}
		if (text.trim() === "DELETE FROM tracked_sessions") {
			this.rows = [];
			return { rows: [] };
		}
		if (text.includes("INSERT INTO tracked_sessions")) {
			const values = params as [
				string,
				string,
				string,
				string,
				PersistedSessionState["lastStatus"],
				number,
				boolean,
				number,
				string | null,
				string | null,
				string | null,
			];
			this.rows = this.rows.filter((row) => row.sessionId !== values[0]);
			this.rows.push({
				sessionId: values[0],
				threadId: values[1],
				url: values[2],
				userId: values[3],
				lastStatus: values[4],
				lastMessageCount: values[5],
				muted: values[6],
				createdAt: values[7],
				statusReason: values[8] ?? undefined,
				originalMessageId: values[9] ?? undefined,
				originalChannelId: values[10] ?? undefined,
			});
			return { rows: [] };
		}
		if (text.includes("FROM tracked_sessions")) {
			return {
				rows: this.rows.map((row) => ({
					session_id: row.sessionId,
					thread_id: row.threadId,
					url: row.url,
					user_id: row.userId,
					last_status: row.lastStatus,
					last_message_count: row.lastMessageCount,
					muted: row.muted,
					created_at: row.createdAt,
					status_reason: row.statusReason ?? null,
					original_message_id: row.originalMessageId ?? null,
					original_channel_id: row.originalChannelId ?? null,
				})),
			};
		}
		throw new Error(`Unhandled query in test: ${text}`);
	}
}

describe("SessionStateStore", () => {
	test("save and load roundtrip", async () => {
		const store = new SessionStateStore("postgres://test", new MockDb());

		const sessions: PersistedSessionState[] = [
			{
				sessionId: "s-1",
				threadId: "t-1",
				url: "https://app.devin.ai/sessions/s-1",
				userId: "u-1",
				lastStatus: "running",
				lastMessageCount: 3,
				muted: false,
				createdAt: 1_700_000_000_000,
				originalMessageId: "m-1",
				originalChannelId: "c-1",
			},
		];

		await store.save(sessions);
		const loaded = await store.load();

		expect(loaded).toEqual(sessions);
	});
});
