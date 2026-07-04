import { afterEach, describe, expect, mock, test } from "bun:test";
import { commandHandlers } from "../src/commands/index.js";
import { createInteractionHandler } from "../src/handlers/interaction.js";
import type { BotConfig } from "../src/types/index.js";

const config: BotConfig = {
	discordBotToken: "token",
	discordClientId: "client",
	databaseUrl: "******localhost:5432/devin_test",
	devinApiKey: "apk_test-key",
	logLevel: "error",
	devinMode: "normal",
	botName: "Devin",
};

const originalStartHandler = commandHandlers.start;

afterEach(() => {
	commandHandlers.start = originalStartHandler;
});

describe("createInteractionHandler", () => {
	test("returns usage-limit message for Devin API 429 errors", async () => {
		commandHandlers.start = (async () => {
			throw new Error("Devin API error 429: Too many requests");
		}) as typeof commandHandlers.start;

		const reply = mock(async () => undefined);

		const interaction = {
			commandName: "devin",
			options: {
				getSubcommandGroup: () => null,
				getSubcommand: () => "start",
			},
			isChatInputCommand: () => true,
			isStringSelectMenu: () => false,
			isModalSubmit: () => false,
			isButton: () => false,
			isRepliable: () => true,
			reply,
			deferred: false,
			replied: false,
		};

		const handler = createInteractionHandler(
			config,
			{} as Parameters<typeof createInteractionHandler>[1],
			{} as Parameters<typeof createInteractionHandler>[2],
		);

		await handler(interaction as Parameters<typeof handler>[0]);

		expect(reply).toHaveBeenCalledWith({
			content:
				"Devin usage limit reached. I couldn't start a session. Please retry later or check your Devin plan limits.",
			ephemeral: true,
		});
	});
});
