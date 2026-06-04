/**
 * Message event handler for @mentions and thread conversations.
 *
 * Handles two scenarios:
 * 1. Bot is @mentioned in a channel: creates a new Devin session
 * 2. Message in a session thread: forwards to Devin or handles keywords
 *
 * Thread keywords (mute, unmute, !aside, EXIT) provide in-thread
 * control over session behavior without slash commands.
 */

import { type Client, EmbedBuilder, type Message, type TextChannel } from "discord.js";
import { EMBED_COLORS, THREAD_AUTO_ARCHIVE_DURATION, THREAD_NAME_MAX_LENGTH } from "../config.js";
import {
	createSession,
	sendMessage,
	terminateSession,
	uploadAttachment,
} from "../services/devin-api.js";
import { createLogger } from "../services/logger.js";
import type { SessionManager } from "../services/session-manager.js";
import { SessionQueueError } from "../services/session-queue.js";
import type { BotConfig } from "../types/index.js";
import { TERMINAL_STATUSES } from "../types/index.js";

const log = createLogger("MessageHandler");

/**
 * Strips bot mention tags from a message's text content.
 *
 * @param content - Raw message content
 * @param clientId - Bot's Discord user ID
 * @returns Cleaned message text without mention tags
 */
function stripMention(content: string, clientId: string): string {
	return content.replace(new RegExp(`<@!?${clientId}>`, "g"), "").trim();
}

/**
 * Downloads and uploads all attachments from a Discord message
 * to the Devin API, returning formatted attachment reference lines.
 *
 * @param apiKey - Devin API key
 * @param message - Discord message with attachments
 * @returns Concatenated ATTACHMENT:"url" lines
 */
async function processMessageAttachments(apiKey: string, message: Message): Promise<string> {
	let lines = "";
	for (const attachment of message.attachments.values()) {
		try {
			const fileRes = await fetch(attachment.url);
			if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
			const buffer = Buffer.from(await fileRes.arrayBuffer());
			const fileUrl = await uploadAttachment(apiKey, attachment.name, buffer);
			lines += `\nATTACHMENT:"${fileUrl}"`;
		} catch (err) {
			log.error(`Attachment download failed: ${attachment.name}`, err);
			lines += `\n(Failed to download attachment: ${attachment.name})`;
		}
	}
	return lines;
}

/**
 * Creates a message handler bound to the given config and session manager.
 *
 * @param client - Discord client instance
 * @param config - Validated bot configuration
 * @param sessionManager - Session tracking manager instance
 * @returns Event handler function for the `messageCreate` event
 */
export function createMessageHandler(
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
) {
	return async (message: Message): Promise<void> => {
		if (message.author.bot) return;

		try {
			const sessionId = sessionManager.getSessionByThread(message.channelId);

			if (sessionId) {
				await handleThreadMessage(message, sessionId, client, config, sessionManager);
			} else if (client.user && message.mentions.has(client.user)) {
				await handleMention(message, client, config, sessionManager);
			}
		} catch (err) {
			log.error("Message handling error:", err);
			await message.react("\u26A0\uFE0F").catch(() => {});
		}
	};
}

/**
 * Handles a message in a session thread. Checks for control keywords
 * (EXIT, mute, unmute, !aside) and forwards regular messages to Devin.
 */
async function handleThreadMessage(
	message: Message,
	sessionId: string,
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const content = stripMention(message.content, client.user?.id ?? "");
	const lower = content.toLowerCase();
	const tracked = sessionManager.getTracked(sessionId);

	if (lower === "exit") {
		if (tracked && message.author.id !== tracked.userId) {
			await message.react("\uD83D\uDEAB");
			return;
		}
		try {
			await terminateSession(config.devinApiKey, sessionId);
		} catch (err) {
			log.error("Failed to terminate session:", err);
		}
		await sessionManager.userStop(sessionId);
		await message.react("\u23F9\uFE0F");
		return;
	}

	if (lower === "mute") {
		if (tracked && message.author.id !== tracked.userId) {
			await message.react("\uD83D\uDEAB");
			return;
		}
		sessionManager.setMuted(sessionId, true);
		await message.react("\uD83D\uDD07");
		return;
	}

	if (lower === "unmute") {
		if (tracked && message.author.id !== tracked.userId) {
			await message.react("\uD83D\uDEAB");
			return;
		}
		sessionManager.setMuted(sessionId, false);
		await message.react("\uD83D\uDD0A");
		return;
	}

	if (lower.startsWith("!aside") || lower.startsWith("(aside)")) return;

	if (sessionManager.isMuted(sessionId)) {
		await message.react("\uD83D\uDD07");
		return;
	}

	if (tracked && TERMINAL_STATUSES.has(tracked.lastStatus)) {
		await message.react("\u26A0\uFE0F");
		return;
	}

	if (!content && message.attachments.size === 0) return;

	const attachmentLines = await processMessageAttachments(config.devinApiKey, message);
	const fullMessage = (content || "") + attachmentLines;

	await sendMessage(config.devinApiKey, sessionId, fullMessage);
	await message.react("\u2709\uFE0F");
}

/**
 * Handles an @mention of the bot in a text channel.
 * Creates a new Devin session and opens a thread for it.
 */
async function handleMention(
	message: Message,
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const channel = message.channel as TextChannel;
	if (!channel?.threads) {
		await message.reply("Tag me in a text channel to start a session!");
		return;
	}

	const task = stripMention(message.content, client.user?.id ?? "");
	if (!task && message.attachments.size === 0) {
		await message.reply("What would you like me to work on? Tag me with a task description.");
		return;
	}

	await message.react("\uD83D\uDC40");

	const attachmentLines = await processMessageAttachments(config.devinApiKey, message);
	const prompt = (task || "See attached files.") + attachmentLines;

	const queue = sessionManager.getQueue();

	let session_id: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(message.author.id, prompt, (p) =>
				createSession(config.devinApiKey, p),
			);
			session_id = result.sessionId;
			url = result.url;
		} catch (err) {
			if (err instanceof SessionQueueError) {
				await message.reply(err.message);
				return;
			}
			throw err;
		}
	} else {
		const result = await createSession(config.devinApiKey, prompt);
		session_id = result.session_id;
		url = result.url;
	}

	log.info(`Session created via @mention: ${session_id}`);

	try {
		const prefix = `${config.botName}: `;
		const maxTaskLen = Math.max(0, THREAD_NAME_MAX_LENGTH - prefix.length);
		const threadName = `${prefix}${(task || "New session").slice(0, maxTaskLen)}`;
		const thread = await channel.threads.create({
			name: threadName,
			autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
			reason: `Devin session ${session_id}`,
		});

		const embed = new EmbedBuilder()
			.setTitle("Devin Session Started")
			.setDescription(task || "*File attachment session*")
			.setColor(EMBED_COLORS.working)
			.addFields(
				{ name: "Status", value: "Working", inline: true },
				{ name: "Session ID", value: `\`${session_id}\``, inline: true },
				{ name: "View Session", value: `[Open in Devin](${url})` },
			)
			.setTimestamp()
			.setFooter({ text: `Requested by ${message.author.tag}` });

		if (message.attachments.size > 0) {
			embed.addFields({
				name: "Attachments",
				value: [...message.attachments.values()].map((a) => a.name).join(", "),
				inline: true,
			});
		}

		await sessionManager.track(session_id, thread, url, message.author.id, {
			originalMessageId: message.id,
			originalChannelId: message.channelId,
		});

		await thread.send({ embeds: [embed] });
		await message.reply(`Session started! Follow progress in ${thread}`);
	} catch (err) {
		queue?.releaseSession(session_id, message.author.id);
		throw err;
	}
}
