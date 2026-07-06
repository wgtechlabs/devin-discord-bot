import { describe, expect, mock, test } from "bun:test";
import { type ButtonInteraction, ChannelType } from "discord.js";
import { handleReviewButton } from "../src/commands/devin-review.js";
import type { SessionManager } from "../src/services/session-manager.js";
import type { BotConfig } from "../src/types/index.js";

const config: BotConfig = {
	discordBotToken: "token",
	discordClientId: "client",
	databaseUrl: "postgres://postgres:postgres@localhost:5432/devin_test",
	devinApiKey: "apk_test-key",
	logLevel: "error",
	devinMode: "normal",
	botName: "Devin",
};

function createInteraction(messageId: string): ButtonInteraction {
	const channel = {
		type: ChannelType.DM,
		send: mock(async () => undefined),
	};

	return {
		customId: "review-pr:https://github.com/wgtechlabs/devin-discord-bot/pull/1",
		user: { id: "user-1" },
		channel,
		message: {
			id: messageId,
			edit: mock(async () => undefined),
		},
		deferReply: mock(async () => undefined),
		editReply: mock(async () => undefined),
		reply: mock(async () => undefined),
	} as unknown as ButtonInteraction;
}

describe("handleReviewButton", () => {
	test("removes the review button from the source message", async () => {
		const interaction = createInteraction("message-remove");
		const sessionManager = {
			getQueue: () => ({
				enqueue: mock(async () => ({
					sessionId: "session-1",
					url: "https://app.devin.ai/sessions/session-1",
				})),
				releaseSession: mock(() => undefined),
			}),
			getDevinMode: () => "normal",
			track: mock(async () => undefined),
		} as unknown as SessionManager;

		await handleReviewButton(interaction, config, sessionManager);

		expect(interaction.message.edit).toHaveBeenCalledWith({ components: [] });
	});

	test("blocks concurrent duplicate clicks while the first is still in flight", async () => {
		// Simulate two clicks arriving before deferReply resolves (the race window).
		let resolveDeferReply!: () => void;
		const deferReplyPromise = new Promise<void>((resolve) => {
			resolveDeferReply = resolve;
		});

		const enqueue = mock(async () => ({
			sessionId: "session-2",
			url: "https://app.devin.ai/sessions/session-2",
		}));
		const sessionManager = {
			getQueue: () => ({
				enqueue,
				releaseSession: mock(() => undefined),
			}),
			getDevinMode: () => "normal",
			track: mock(async () => undefined),
		} as unknown as SessionManager;

		// First click — hangs at deferReply.
		const first = createInteraction("message-concurrent");
		(first as Record<string, unknown>).deferReply = mock(() => deferReplyPromise);
		const firstCall = handleReviewButton(first, config, sessionManager);

		// Second click arrives while first is still awaiting deferReply.
		const duplicate = createInteraction("message-concurrent");
		await handleReviewButton(duplicate, config, sessionManager);

		// Let the first call finish.
		resolveDeferReply();
		await firstCall;

		expect(enqueue).toHaveBeenCalledTimes(1);
		expect(duplicate.reply).toHaveBeenCalledWith({
			content: "Review session is already starting.",
			ephemeral: true,
		});
	});
});
