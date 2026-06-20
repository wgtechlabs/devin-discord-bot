/**
 * Slash command handler for `/devin allowlist`.
 *
 * Manages the DM allowlist that controls which users are authorized
 * to interact with the bot via direct messages. Only users with
 * Manage Server permission can modify the allowlist.
 */

import { type ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { EMBED_COLORS, getEmbedFooterText } from "../config.js";
import type { AllowlistStore } from "../services/allowlist-store.js";
import { createLogger } from "../services/logger.js";
import type { BotConfig } from "../types/index.js";

const log = createLogger("Command:Allowlist");

/**
 * Handles `/devin allowlist add` — adds a user to the DM allowlist.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param allowlistStore - Allowlist persistence store
 */
export async function handleAllowlistAdd(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	allowlistStore: AllowlistStore,
): Promise<void> {
	if (!hasPermission(interaction)) {
		await interaction.reply({
			content: "You need **Manage Server** permission to manage the DM allowlist.",
			ephemeral: true,
		});
		return;
	}

	const user = interaction.options.getUser("user", true);

	if (user.bot) {
		await interaction.reply({
			content: "Bot accounts cannot be added to the DM allowlist.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	try {
		const added = await allowlistStore.add(user.id, interaction.user.id);

		if (added) {
			log.info(`User ${user.tag} (${user.id}) added to DM allowlist by ${interaction.user.tag}`);
			await interaction.editReply(
				`${user.tag} has been added to the DM allowlist and can now interact with ${config.botName} via DM.`,
			);
		} else {
			await interaction.editReply(`${user.tag} is already on the DM allowlist.`);
		}
	} catch (err) {
		log.error("Failed to add user to allowlist:", err);
		await interaction.editReply("Failed to update the allowlist. Please try again later.");
	}
}

/**
 * Handles `/devin allowlist remove` — removes a user from the DM allowlist.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param allowlistStore - Allowlist persistence store
 */
export async function handleAllowlistRemove(
	interaction: ChatInputCommandInteraction,
	_config: BotConfig,
	allowlistStore: AllowlistStore,
): Promise<void> {
	if (!hasPermission(interaction)) {
		await interaction.reply({
			content: "You need **Manage Server** permission to manage the DM allowlist.",
			ephemeral: true,
		});
		return;
	}

	const user = interaction.options.getUser("user", true);

	await interaction.deferReply({ ephemeral: true });

	try {
		const removed = await allowlistStore.remove(user.id);

		if (removed) {
			log.info(
				`User ${user.tag} (${user.id}) removed from DM allowlist by ${interaction.user.tag}`,
			);
			await interaction.editReply(`${user.tag} has been removed from the DM allowlist.`);
		} else {
			await interaction.editReply(`${user.tag} is not on the DM allowlist.`);
		}
	} catch (err) {
		log.error("Failed to remove user from allowlist:", err);
		await interaction.editReply("Failed to update the allowlist. Please try again later.");
	}
}

/**
 * Handles `/devin allowlist list` — shows all allowlisted users.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param allowlistStore - Allowlist persistence store
 */
export async function handleAllowlistList(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	allowlistStore: AllowlistStore,
): Promise<void> {
	if (!hasPermission(interaction)) {
		await interaction.reply({
			content: "You need **Manage Server** permission to view the DM allowlist.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	try {
		const entries = await allowlistStore.list();

		if (entries.length === 0) {
			await interaction.editReply(
				"The DM allowlist is empty. Use `/devin allowlist add` to add users.",
			);
			return;
		}

		const lines = entries.map((entry) => `<@${entry.userId}> — added by <@${entry.addedBy}>`);

		const embed = new EmbedBuilder()
			.setTitle("DM Allowlist")
			.setDescription(lines.join("\n"))
			.setColor(EMBED_COLORS.info)
			.addFields({
				name: "Total",
				value: `${entries.length} user${entries.length === 1 ? "" : "s"}`,
				inline: true,
			})
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(config.botName) });

		await interaction.editReply({ embeds: [embed] });
	} catch (err) {
		log.error("Failed to list allowlist:", err);
		await interaction.editReply("Failed to retrieve the allowlist. Please try again later.");
	}
}

/**
 * Checks whether the interaction user has Manage Server permission.
 */
function hasPermission(interaction: ChatInputCommandInteraction): boolean {
	if (!interaction.memberPermissions) return false;
	return interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
}
