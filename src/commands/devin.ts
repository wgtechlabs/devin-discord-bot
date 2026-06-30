/**
 * Slash command handler for `/devin start`.
 *
 * Creates a new Devin session from a freeform task description,
 * opens a Discord thread for the conversation, and begins polling.
 * Supports optional file attachments forwarded to the Devin API.
 */

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
} from "discord.js";
import { EMBED_COLORS, THREAD_AUTO_ARCHIVE_DURATION, THREAD_NAME_MAX_LENGTH } from "../config.js";
import { createSession, uploadAttachment } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import { SessionQueueError } from "../services/session-queue.js";
import type { BotConfig, ThreadableChannel } from "../types/index.js";

const log = createLogger("Command:Devin");

/**
 * Processes a `/devin start` interaction: validates the channel, creates
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
			const fileUrl = await uploadAttachment(
				config.devinApiKey,
				attachment.name,
				buffer,
				config.devinOrgId,
			);
			prompt += `\nATTACHMENT:"${fileUrl}"`;
		} catch (err) {
			log.error("Attachment upload failed:", err);
		}
	}

	const queue = sessionManager.getQueue();

	let session_id: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(interaction.user.id, prompt, (p) =>
				createSession(config.devinApiKey, p, config.devinOrgId),
			);
			session_id = result.sessionId;
			url = result.url;

			if (result.queuedDuration > 1000) {
				log.info(`Session ${session_id} waited ${result.queuedDuration}ms in queue`);
			}
		} catch (err) {
			if (err instanceof SessionQueueError) {
				await interaction.editReply(err.message);
				return;
			}
			throw err;
		}
	} else {
		const result = await createSession(config.devinApiKey, prompt, config.devinOrgId);
		session_id = result.session_id;
		url = result.url;
	}

	log.info(`Session created: ${session_id}`);

	let tracked = false;
	try {
		const prefix = `${config.botName}: `;
		const maxTaskLen = Math.max(0, THREAD_NAME_MAX_LENGTH - prefix.length);
		const threadName = `${prefix}${task.slice(0, maxTaskLen)}`;
		const thread = await channel.threads.create({
			name: threadName,
			autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
			reason: `Devin session ${session_id}`,
		});

		const embed = new EmbedBuilder()
			.setDescription(
				`Talk to ${config.botName} in this thread\n\n\u{1F4A1} **Tip:** Type \`mute\` to stop ${config.botName} from reading your messages`,
			)
			.setColor(EMBED_COLORS.working);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel("Open web app").setStyle(ButtonStyle.Link).setURL(url),
		);

		await sessionManager.track(session_id, thread, url, interaction.user.id);
		tracked = true;
		await thread.send({ embeds: [embed], components: [row] });
		await interaction.editReply(`Session started in ${thread}`);
	} catch (err) {
		if (!tracked) {
			queue?.releaseSession(session_id, interaction.user.id);
		}
		throw err;
	}
}
