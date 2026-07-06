import { describe, expect, mock, test } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleDevinSettingsMode } from "../src/commands/devin-settings.js";
import type { SessionManager } from "../src/services/session-manager.js";
import type { BotConfig, DevinMode } from "../src/types/index.js";

const config: BotConfig = {
	discordBotToken: "token",
	discordClientId: "client",
	databaseUrl: "postgresql://localhost:5432/devin_test",
	devinApiKey: "apk_test-key",
	logLevel: "error",
	devinMode: "normal",
	botName: "Devin",
};

function createInteraction(opts: { hasPermission: boolean; value?: DevinMode | null }) {
	return {
		options: {
			getString: (name: string) => (name === "value" ? (opts.value ?? null) : null),
		},
		memberPermissions: { has: () => opts.hasPermission },
		reply: mock(async () => undefined),
		deferReply: mock(async () => undefined),
		editReply: mock(async () => undefined),
	} as unknown as ChatInputCommandInteraction;
}

describe("handleDevinSettingsMode", () => {
	test("rejects users without manage server permission", async () => {
		const interaction = createInteraction({ hasPermission: false });
		const sessionManager = {} as SessionManager;

		await handleDevinSettingsMode(interaction, config, sessionManager);

		expect(interaction.reply).toHaveBeenCalledWith({
			content: "You need **Manage Server** permission to manage bot settings.",
			ephemeral: true,
		});
		expect(interaction.deferReply).not.toHaveBeenCalled();
	});

	test("shows current mode when no value is provided", async () => {
		const interaction = createInteraction({ hasPermission: true, value: null });
		const sessionManager = {
			getDevinMode: () => "fast",
		} as unknown as SessionManager;

		await handleDevinSettingsMode(interaction, config, sessionManager);

		expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
		expect(interaction.editReply).toHaveBeenCalledWith(
			"Current Devin mode: **fast** (database override).",
		);
	});

	test("updates mode when provided", async () => {
		const interaction = createInteraction({ hasPermission: true, value: "lite" });
		const setDevinMode = mock(async (_mode: DevinMode) => undefined);
		const sessionManager = {
			setDevinMode,
			getDevinMode: () => "normal",
		} as unknown as SessionManager;

		await handleDevinSettingsMode(interaction, config, sessionManager);

		expect(setDevinMode).toHaveBeenCalledWith("lite");
		expect(interaction.editReply).toHaveBeenCalledWith(
			"Set Devin mode to **lite**. New sessions will use this setting.",
		);
	});
});
