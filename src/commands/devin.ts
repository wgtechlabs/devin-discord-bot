/**
 * Slash command handler for `/devin`.
 *
 * Creates a new Devin session from a freeform task description,
 * opens a Discord thread for the conversation, and begins polling.
 * Supports optional file attachments forwarded to the Devin API.
 */

import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import {
	EMBED_COLORS,
	EMBED_FOOTER_TEXT,
	THREAD_AUTO_ARCHIVE_DURATION,
	THREAD_NAME_MAX_LENGTH,
} from "../config.js";
import { createSession, uploadAttachment } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import type { BotConfig, ThreadableChannel } from "../types/index.js";

const log = createLogger("Command:Devin");

/** Slash command definition for `/devin` */
export const devinCommand = new SlashCommandBuilder()
	.setName("devin")
	.setDescription("Start a new Devin coding session")
	.addStringOption((opt) =>
		opt.setName("task").setDescription("What should Devin work on?").setRequired(true),
	)
	.addAttachmentOption((opt) =>
		opt.setName("attachment").setDescription("File for Devin to work with").setRequired(false),
	);

/**
 * Processes a `/devin` interaction: validates the channel, creates
 * a Devin session, opens a thread, and starts tracking.
 *
 * @param interaction - Discord slash command interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleDevin(
	interaction: ChatInputCommandInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const channel = interaction.channel as ThreadableChannel | null;
	if (!channel?.threads) {
		await interaction.reply({
			content: "This command can only be used in a text channel.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	const task = interaction.options.getString("task", true);
	let prompt = task;

	const attachment = interaction.options.getAttachment("attachment");
	if (attachment) {
		try {
			const fileRes = await fetch(attachment.url);
			if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
			const buffer = Buffer.from(await fileRes.arrayBuffer());
			const fileUrl = await uploadAttachment(config.devinApiKey, attachment.name, buffer);
			prompt += `\nATTACHMENT:"${fileUrl}"`;
		} catch (err) {
			log.error("Attachment upload failed:", err);
		}
	}

	const { session_id, url } = await createSession(config.devinApiKey, prompt);
	log.info(`Session created: ${session_id}`);

	const threadName = `Devin: ${task.slice(0, THREAD_NAME_MAX_LENGTH - 7)}`;
	const thread = await channel.threads.create({
		name: threadName,
		autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
		reason: `Devin session ${session_id}`,
	});

	const embed = new EmbedBuilder()
		.setTitle("Devin Session Started")
		.setDescription(task)
		.setColor(EMBED_COLORS.working)
		.addFields(
			{ name: "Status", value: "Working", inline: true },
			{ name: "Session ID", value: `\`${session_id}\``, inline: true },
			{ name: "View Session", value: `[Open in Devin](${url})` },
		)
		.setTimestamp()
		.setFooter({ text: EMBED_FOOTER_TEXT });

	await sessionManager.track(session_id, thread, url, interaction.user.id);
	await thread.send({ embeds: [embed] });
	await interaction.editReply(`Session started! Follow progress in ${thread}`);
}
