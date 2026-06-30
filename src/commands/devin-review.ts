/**
 * Button handler for "Review with Devin" on PR notification embeds.
 *
 * When a user clicks the review button attached to a PR embed,
 * this handler creates a new Devin session with a code review prompt
 * and tracks it in a new thread (guild) or the DM channel.
 */

import {
	type ButtonInteraction,
	ChannelType,
	type DMChannel,
	EmbedBuilder,
	type TextChannel,
} from "discord.js";
import { EMBED_COLORS, THREAD_AUTO_ARCHIVE_DURATION, THREAD_NAME_MAX_LENGTH } from "../config.js";
import { createSession } from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import { SessionQueueError } from "../services/session-queue.js";
import type { BotConfig } from "../types/index.js";

const log = createLogger("Command:DevinReview");

/**
 * Handles the "Review with Devin" button click on a PR embed.
 * Creates a new Devin session to review the PR and opens a thread
 * (or reuses the DM channel) for the review conversation.
 *
 * @param interaction - Discord button interaction
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 */
export async function handleReviewButton(
	interaction: ButtonInteraction,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const prUrl = interaction.customId.replace("review-pr:", "");

	await interaction.deferReply({ ephemeral: true });

	const prompt = `Review this pull request: ${prUrl}`;
	const queue = sessionManager.getQueue();

	let sessionId: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(interaction.user.id, prompt, (p) =>
				createSession(config.devinApiKey, p, config.devinOrgId),
			);
			sessionId = result.sessionId;
			url = result.url;
		} catch (err) {
			if (err instanceof SessionQueueError) {
				await interaction.editReply(err.message);
				return;
			}
			throw err;
		}
	} else {
		const result = await createSession(config.devinApiKey, prompt, config.devinOrgId);
		sessionId = result.session_id;
		url = result.url;
	}

	log.info(`Review session created: ${sessionId} for PR ${prUrl}`);

	const isDM =
		interaction.channel?.type === ChannelType.DM ||
		interaction.channel?.type === ChannelType.GroupDM;

	if (isDM) {
		const dmChannel = interaction.channel as DMChannel;
		let tracked = false;
		try {
			await sessionManager.track(sessionId, dmChannel, url, interaction.user.id);
			tracked = true;

			const embed = new EmbedBuilder()
				.setDescription(`Reviewing PR — [Open web app](${url})\n\n🔗 ${prUrl}`)
				.setColor(EMBED_COLORS.working);

			await dmChannel.send({ embeds: [embed] });
			await interaction.editReply("Review session started.");
		} catch (err) {
			if (!tracked) {
				queue?.releaseSession(sessionId, interaction.user.id);
			}
			throw err;
		}
	} else {
		const channel = interaction.channel;
		const parentChannel =
			channel && "parent" in channel && channel.parent ? channel.parent : channel;
		const threadTarget = parentChannel as TextChannel | null;

		if (!threadTarget?.threads) {
			await interaction.editReply("Cannot create a thread in this channel.");
			queue?.releaseSession(sessionId, interaction.user.id);
			return;
		}

		let tracked = false;
		try {
			const threadName = `${config.botName}: Code Review`.slice(0, THREAD_NAME_MAX_LENGTH);
			const thread = await threadTarget.threads.create({
				name: threadName,
				autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
				reason: `Devin review session ${sessionId}`,
			});

			const embed = new EmbedBuilder()
				.setDescription(
					`Reviewing PR — [Open web app](${url})\n\n🔗 ${prUrl}\n\n💡 **Tip:** Type \`mute\` to stop Devin from reading your messages`,
				)
				.setColor(EMBED_COLORS.working);

			await sessionManager.track(sessionId, thread, url, interaction.user.id);
			tracked = true;
			await thread.send({ embeds: [embed] });
			await interaction.editReply(`Review session started in ${thread}`);
		} catch (err) {
			if (!tracked) {
				queue?.releaseSession(sessionId, interaction.user.id);
			}
			throw err;
		}
	}
}
