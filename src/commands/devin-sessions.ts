/**
 * Slash command handler for `/devin-sessions`.
 *
 * Lists all currently tracked Devin sessions with their status,
 * thread link, and session age. Displays results as a rich embed.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { EMBED_COLORS, EMBED_FOOTER_TEXT } from "../config.js";
import type { SessionManager } from "../services/session-manager.js";

/** Slash command definition for `/devin-sessions` */
export const devinSessionsCommand = new SlashCommandBuilder()
	.setName("devin-sessions")
	.setDescription("List active Devin sessions");

/**
 * Processes a `/devin-sessions` interaction: retrieves all tracked
 * sessions and displays them in a formatted embed.
 *
 * @param interaction - Discord slash command interaction
 * @param sessionManager - Session tracking manager instance
 */
export async function handleDevinSessions(
	interaction: ChatInputCommandInteraction,
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
		.setTitle("Active Devin Sessions")
		.setDescription(lines.join("\n"))
		.setColor(EMBED_COLORS.info)
		.setTimestamp()
		.setFooter({ text: EMBED_FOOTER_TEXT });

	await interaction.reply({ embeds: [embed], ephemeral: true });
}
