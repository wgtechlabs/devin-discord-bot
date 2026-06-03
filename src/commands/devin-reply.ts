/**
 * Slash command handler for `/devin reply`.
 *
 * Sends a follow-up message to an active Devin session.
 * The target session is auto-detected from the current thread
 * or can be specified explicitly via the session_id option.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { sendMessage, uploadAttachment } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";

const log = createLogger("Command:DevinReply");

/**
 * Processes a `/devin reply` interaction: resolves the target session,
 * uploads any attachment, and forwards the message to the Devin API.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleDevinReply(
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
	if (explicitId && tracked && tracked.userId !== interaction.user.id) {
		await interaction.reply({
			content: "You can only send messages to sessions that you started.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	let message = interaction.options.getString("message", true);

	const attachment = interaction.options.getAttachment("attachment");
	if (attachment) {
		try {
			const fileRes = await fetch(attachment.url);
			if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
			const buffer = Buffer.from(await fileRes.arrayBuffer());
			const fileUrl = await uploadAttachment(config.devinApiKey, attachment.name, buffer);
			message += `\nATTACHMENT:"${fileUrl}"`;
		} catch (err) {
			log.error("Attachment upload failed:", err);
		}
	}

	await sendMessage(config.devinApiKey, sessionId, message);
	await interaction.editReply(`Message sent to ${config.botName}.`);
}
