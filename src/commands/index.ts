/**
 * Command registry and routing.
 *
 * Aggregates all slash command definitions for bulk registration
 * and provides a lookup map for dispatching interactions to the
 * correct handler function.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";
import { devinReplyCommand, handleDevinReply } from "./devin-reply.js";
import { devinSessionsCommand, handleDevinSessions } from "./devin-sessions.js";
import { devinStopCommand, handleDevinStop } from "./devin-stop.js";
import { devinTemplateCommand, handleDevinTemplate } from "./devin-template.js";
import { devinCommand, handleDevin } from "./devin.js";

/** All slash command builders for registration with the Discord API */
export const commands = [
	devinCommand,
	devinTemplateCommand,
	devinReplyCommand,
	devinStopCommand,
	devinSessionsCommand,
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
 * Map of command names to their handler functions.
 * Used by the interaction dispatcher to route commands.
 */
export const commandHandlers: Record<string, CommandHandler> = {
	devin: handleDevin,
	"devin-template": handleDevinTemplate as unknown as CommandHandler,
	"devin-reply": handleDevinReply,
	"devin-stop": handleDevinStop,
	"devin-sessions": (interaction, _config, sessionManager) =>
		handleDevinSessions(interaction, sessionManager),
};

export {
	handleTemplateSelect,
	handleTemplateSubmit,
} from "./devin-template.js";
