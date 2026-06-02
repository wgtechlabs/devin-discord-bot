/**
 * Devin Discord Bot — Entry Point
 *
 * Initializes the Discord client, loads configuration, registers
 * slash commands, and wires up event handlers. This is the main
 * process entry point for both development and production.
 *
 * @see {@link https://github.com/wgtechlabs/devin-discord-bot}
 */

import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { loadConfig } from "./config.js";
import { createInteractionHandler } from "./handlers/interaction.js";
import { createMessageHandler } from "./handlers/message.js";
import { createLogger, setLogLevel } from "./services/logger.js";
import { SessionManager } from "./services/session-manager.js";

const log = createLogger("Bot");

/** Load and validate environment configuration */
const config = loadConfig();
setLogLevel(config.logLevel);

/** Initialize Discord client with required gateway intents */
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

/** Initialize session manager and inject config */
const sessionManager = new SessionManager(client);
sessionManager.setConfig(config);

/** Register slash commands when the bot connects */
client.once("ready", async () => {
	log.info(`Logged in as ${client.user?.tag}`);

	const rest = new REST().setToken(config.discordBotToken);

	for (const guild of client.guilds.cache.values()) {
		await rest.put(Routes.applicationGuildCommands(config.discordClientId, guild.id), {
			body: commands.map((c) => c.toJSON()),
		});
		log.info(`Commands registered in "${guild.name}"`);
	}
});

/** Wire up event handlers */
client.on("interactionCreate", createInteractionHandler(config, sessionManager));
client.on("messageCreate", createMessageHandler(client, config, sessionManager));

/** Connect to Discord */
client.login(config.discordBotToken);
