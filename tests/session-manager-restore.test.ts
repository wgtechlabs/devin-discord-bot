import { describe, expect, test } from "bun:test";
import type { Client } from "discord.js";
import { SessionManager } from "../src/services/session-manager.js";
import type { SessionQueue } from "../src/services/session-queue.js";
import type { PersistedSessionState, SessionStateStore } from "../src/services/state-store.js";

class MockStateStore {
	constructor(private readonly rows: PersistedSessionState[]) {}

	async load(): Promise<PersistedSessionState[]> {
		return this.rows;
	}

	async save(_sessions: PersistedSessionState[]): Promise<void> {}
}

describe("SessionManager restore", () => {
	test("resumes running, skips terminal, marks missing thread non-routable", async () => {
		const store = new MockStateStore([
			{
				sessionId: "s-running",
				threadId: "t-running",
				url: "https://app.devin.ai/sessions/s-running",
				userId: "u-1",
				lastStatus: "running",
				lastMessageCount: 0,
				muted: false,
				createdAt: Date.now(),
			},
			{
				sessionId: "s-finished",
				threadId: "t-finished",
				url: "https://app.devin.ai/sessions/s-finished",
				userId: "u-2",
				lastStatus: "finished",
				lastMessageCount: 1,
				muted: false,
				createdAt: Date.now(),
			},
			{
				sessionId: "s-missing",
				threadId: "t-missing",
				url: "https://app.devin.ai/sessions/s-missing",
				userId: "u-3",
				lastStatus: "running",
				lastMessageCount: 0,
				muted: false,
				createdAt: Date.now(),
			},
		]);

		const client = {
			channels: {
				fetch: async (threadId: string) => {
					if (threadId === "t-missing") return null;
					return {
						id: threadId,
						isThread: () => true,
						isDMBased: () => false,
						sendTyping: async () => {},
					};
				},
			},
		} as unknown as Client;

		const manager = new SessionManager(client, store as unknown as SessionStateStore);

		const registered: string[] = [];
		manager.setQueue({
			registerActiveSession: (sessionId: string) => {
				registered.push(sessionId);
			},
		} as unknown as SessionQueue);

		await manager.restoreFromState();

		expect(registered).toEqual(["s-running"]);
	});
});
