/**
 * Command registry and routing.
 *
 * Defines the unified `/devin` slash command with subcommands and
 * provides a lookup map for dispatching interactions to the correct
 * handler function.
 */

import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";
import { handleDevinReply } from "./devin-reply.js";
import { handleDevinSessions } from "./devin-sessions.js";
import { handleDevinStop } from "./devin-stop.js";
import { handleDevinTemplate } from "./devin-template.js";
import { handleDevin } from "./devin.js";

/**
 * Unified `/devin` slash command with subcommands.
 * All bot interactions are grouped under a single top-level command.
 */
export const commands = [
	new SlashCommandBuilder()
		.setName("devin")
		.setDescription("Manage Devin AI coding sessions")
		.addSubcommand((sub) =>
			sub
				.setName("start")
				.setDescription("Start a new coding session")
				.addStringOption((opt) =>
					opt.setName("task").setDescription("What should Devin work on?").setRequired(true),
				)
				.addAttachmentOption((opt) =>
					opt
						.setName("attachment")
						.setDescription("Optional file for Devin to work with")
						.setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("reply")
				.setDescription("Send a message to an active session")
				.addStringOption((opt) =>
					opt.setName("message").setDescription("Message to send").setRequired(true),
				)
				.addAttachmentOption((opt) =>
					opt.setName("attachment").setDescription("Optional file attachment").setRequired(false),
				)
				.addStringOption((opt) =>
					opt
						.setName("session_id")
						.setDescription("Session ID (auto-detected in session thread)")
						.setRequired(false),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("stop")
				.setDescription("Stop an active session")
				.addStringOption((opt) =>
					opt
						.setName("session_id")
						.setDescription("Session ID (auto-detected in session thread)")
						.setRequired(false),
				),
		)
		.addSubcommand((sub) => sub.setName("sessions").setDescription("List all active sessions"))
		.addSubcommand((sub) =>
			sub.setName("template").setDescription("Start a session from a pre-built template"),
		),
];

/**
 * Handler function signature for slash commands.
 * Each handler receives the interaction, config, and session manager.
 */
type CommandHandler = (
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
) => Promise<void>;

/**
 * Map of subcommand names to their handler functions.
 * Used by the interaction dispatcher to route subcommands.
 */
export const commandHandlers: Record<string, CommandHandler> = {
	start: handleDevin,
	reply: handleDevinReply,
	stop: handleDevinStop,
	sessions: handleDevinSessions,
	template: handleDevinTemplate,
};

export {
	handleTemplateSelect,
	handleTemplateSubmit,
} from "./devin-template.js";
