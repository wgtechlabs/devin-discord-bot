/**
 * Slash command handler for `/devin settings mode`.
 *
 * Reads or updates the runtime Devin mode and persists it in PostgreSQL.
 */

import { type ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig, DevinMode } from "../types/index.js";

function hasPermission(interaction: ChatInputCommandInteraction): boolean {
	if (!interaction.memberPermissions) return false;
	return interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
}

export async function handleDevinSettingsMode(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	if (!hasPermission(interaction)) {
		await interaction.reply({
			content: "You need **Manage Server** permission to manage bot settings.",
			ephemeral: true,
		});
		return;
	}

	const mode = interaction.options.getString("value", false) as DevinMode | null;
	await interaction.deferReply({ ephemeral: true });

	if (!mode) {
		const currentMode = sessionManager.getDevinMode();
		const source = currentMode === config.devinMode ? "environment default" : "database override";
		await interaction.editReply(`Current Devin mode: **${currentMode}** (${source}).`);
		return;
	}

	await sessionManager.setDevinMode(mode);
	await interaction.editReply(`Set Devin mode to **${mode}**. New sessions will use this setting.`);
}
