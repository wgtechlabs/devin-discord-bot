/**
 * Slash command handler for `/devin stop`.
 *
 * Terminates an active Devin session via the API and updates
 * the session tracking state. The target session is auto-detected
 * from the current thread or specified by session_id.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { terminateSession } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";

const log = createLogger("Command:DevinStop");

/**
 * Processes a `/devin stop` interaction: resolves the target session,
 * terminates it via the API, and updates tracking state.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleDevinStop(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const explicitId = interaction.options.getString("session_id");
	const sessionId = explicitId ?? sessionManager.getSessionByThread(interaction.channelId);

	if (!sessionId) {
		await interaction.reply({
			content: "No session found. Use this in a session thread or provide a session ID.",
			ephemeral: true,
		});
		return;
	}

	const tracked = sessionManager.getTracked(sessionId);
	if (tracked && tracked.userId !== interaction.user.id) {
		await interaction.reply({
			content: "You can only stop sessions that you started.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	try {
		await terminateSession(config.devinApiKey, sessionId, config.devinOrgId);
		await sessionManager.userStop(sessionId);
		await interaction.editReply("Session terminated.");
	} catch (err) {
		log.error("Failed to stop session:", err);
		await interaction.editReply("Failed to terminate session.");
	}
}
