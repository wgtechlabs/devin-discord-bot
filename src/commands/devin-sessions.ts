/**
 * Slash command handler for `/devin sessions`.
 *
 * Lists all currently tracked Devin sessions with their status,
 * thread link, and session age. Displays results as a rich embed.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { EMBED_COLORS, getEmbedFooterText } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";

/**
 * Processes a `/devin sessions` interaction: retrieves all tracked
 * sessions and displays them in a formatted embed.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleDevinSessions(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const sessions = sessionManager.getAllSessions();

	if (sessions.length === 0) {
		await interaction.reply({
			content: "No active sessions.",
			ephemeral: true,
		});
		return;
	}

	const lines = sessions.map((s) => {
		const elapsed = Math.round((Date.now() - s.createdAt) / 60_000);
		return `**${s.sessionId}** — ${s.lastStatus} — <#${s.thread.id}> — ${elapsed}m ago`;
	});

	const embed = new EmbedBuilder()
		.setTitle("Active Sessions")
		.setDescription(lines.join("\n"))
		.setColor(EMBED_COLORS.info)
		.setTimestamp()
		.setFooter({ text: getEmbedFooterText(config.botName) });

	await interaction.reply({ embeds: [embed], ephemeral: true });
}
