import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleDevinReply } from "../src/commands/devin-reply.js";
import type { SessionManager } from "../src/services/session-manager.js";
import type { BotConfig } from "../src/types/index.js";

const config: BotConfig = {
	discordBotToken: "token",
	discordClientId: "client",
	databaseUrl: "postgresql://localhost:5432/devin_test",
	devinApiKey: "apk_test-key",
	logLevel: "error",
	devinMode: "normal",
	botName: "Devin",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	(globalThis as { fetch: typeof fetch }).fetch = originalFetch;
});

function createInteraction(opts: {
	message: string;
	sessionId?: string | null;
	attachment?: { url: string; name: string } | null;
}): ChatInputCommandInteraction {
	return {
		options: {
			getString: (name: string, required?: boolean) => {
				if (name === "message") return opts.message;
				if (name === "session_id") return opts.sessionId ?? null;
				if (required) throw new Error(`Missing required option: ${name}`);
				return null;
			},
			getAttachment: (name: string) => (name === "attachment" ? (opts.attachment ?? null) : null),
		},
		channelId: "thread-1",
		user: { id: "user-1" },
		reply: mock(async () => undefined),
		deferReply: mock(async () => undefined),
		editReply: mock(async () => undefined),
	} as unknown as ChatInputCommandInteraction;
}

describe("handleDevinReply", () => {
	test("rejects replies to terminal sessions", async () => {
		const interaction = createInteraction({ message: "hello" });
		const sessionManager = {
			getSessionByThread: () => "session-terminal",
			getTracked: () => ({ lastStatus: "finished", userId: "user-1" }),
		} as unknown as SessionManager;

		await handleDevinReply(interaction, config, sessionManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: "This session is closed. Start a new session to continue.",
			ephemeral: true,
		});
		expect(interaction.deferReply).not.toHaveBeenCalled();
	});

	test("rejects explicit session_id for non-owners", async () => {
		const interaction = createInteraction({
			message: "hello",
			sessionId: "session-owned-by-someone-else",
		});
		const sessionManager = {
			getSessionByThread: () => undefined,
			getTracked: () => ({ lastStatus: "finished", userId: "user-2" }),
		} as unknown as SessionManager;

		await handleDevinReply(interaction, config, sessionManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: "You can only send messages to sessions that you started.",
			ephemeral: true,
		});
		expect(interaction.deferReply).not.toHaveBeenCalled();
	});

	test("fails fast when attachment upload fails", async () => {
		const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === "POST") {
				return {
					ok: false,
					status: 500,
					text: async () => "upload failed",
				};
			}

			return {
				ok: true,
				status: 200,
				arrayBuffer: async () => new ArrayBuffer(8),
			};
		});
		(globalThis as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

		const interaction = createInteraction({
			message: "hello",
			attachment: { url: "https://cdn.discordapp.com/file.txt", name: "file.txt" },
		});
		const sessionManager = {
			getSessionByThread: () => "session-running",
			getTracked: () => ({ lastStatus: "running", userId: "user-1" }),
		} as unknown as SessionManager;

		await handleDevinReply(interaction, config, sessionManager);

		expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
		expect(interaction.editReply).toHaveBeenCalledWith(
			"Failed to upload attachment. Message was not sent.",
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
