/**
 * Top-level interaction event handler.
 *
 * Routes incoming Discord interactions (slash commands, select menus,
 * modal submissions) to the appropriate command or component handler.
 * Provides centralized error handling for all interaction types.
 */

import type { Interaction } from "discord.js";
import {
	allowlistHandlers,
	commandHandlers,
	handleTemplateSelect,
	handleTemplateSubmit,
} from "../commands/index.js";
import type { AllowlistStore } from "../services/allowlist-store.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig } from "../types/index.js";

const log = createLogger("InteractionHandler");

/**
 * Creates an interaction handler bound to the given config and session manager.
 *
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 * @param allowlistStore - DM allowlist persistence store
 * @returns Event handler function for the `interactionCreate` event
 */
export function createInteractionHandler(
	config: BotConfig,
	sessionManager: SessionManager,
	allowlistStore: AllowlistStore,
) {
	return async (interaction: Interaction): Promise<void> => {
		try {
			if (interaction.isChatInputCommand() && interaction.commandName === "devin") {
				const group = interaction.options.getSubcommandGroup(false);
				const subcommand = interaction.options.getSubcommand(false);

				if (group === "allowlist" && subcommand) {
					const handler = allowlistHandlers[subcommand];
					if (handler) {
						await handler(interaction, config, allowlistStore);
					}
				} else {
					const handler = subcommand ? commandHandlers[subcommand] : undefined;
					if (handler) {
						await handler(interaction, config, sessionManager);
					}
				}
			} else if (interaction.isStringSelectMenu() && interaction.customId === "template-select") {
				await handleTemplateSelect(interaction);
			} else if (
				interaction.isModalSubmit() &&
				interaction.customId.startsWith("template-modal:")
			) {
				await handleTemplateSubmit(interaction, config, sessionManager);
			}
		} catch (err) {
			log.error("Interaction error:", err);

			const reply = {
				content: "Something went wrong. Please try again later.",
				ephemeral: true,
			};

			if (interaction.isRepliable()) {
				if ("deferred" in interaction && interaction.deferred) {
					await interaction.editReply(reply).catch(() => {});
				} else if ("replied" in interaction && interaction.replied) {
					await interaction.editReply(reply).catch(() => {});
				} else {
					await interaction.reply(reply).catch(() => {});
				}
			}
		}
	};
}
