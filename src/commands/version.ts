/**
 * Slash command handler for `/version`.
 *
 * Replies with the current bot version sourced from package.json.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { version } from "../../package.json";

/**
 * Processes a `/version` interaction: replies with the current bot version.
 *
 * @param interaction - Discord slash command interaction
 */
export async function handleVersion(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.reply({
		content: `v${version}`,
		ephemeral: true,
	});
}
