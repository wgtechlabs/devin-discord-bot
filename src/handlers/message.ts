/**
 * Message event handler for @mentions, thread conversations, and DMs.
 *
 * Handles three scenarios:
 * 1. Bot is @mentioned in a channel: creates a new Devin session
 * 2. Message in a session thread: forwards to Devin or handles keywords
 * 3. Direct message from an allowlisted user: creates or continues a DM session
 *
 * Thread keywords (mute, unmute, !aside, EXIT) provide in-thread
 * control over session behavior without slash commands.
 */

import {
	ChannelType,
	type Client,
	type DMChannel,
	EmbedBuilder,
	type Message,
	type TextChannel,
} from "discord.js";
import { EMBED_COLORS, THREAD_AUTO_ARCHIVE_DURATION, THREAD_NAME_MAX_LENGTH } from "../config.js";
import type { AllowlistStore } from "../services/allowlist-store.js";
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
async function processMessageAttachments(
	apiKey: string,
	message: Message,
	orgId?: string,
): Promise<string> {
	let lines = "";
	for (const attachment of message.attachments.values()) {
		try {
			const fileRes = await fetch(attachment.url);
			if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
			const buffer = Buffer.from(await fileRes.arrayBuffer());
			const fileUrl = await uploadAttachment(apiKey, attachment.name, buffer, orgId);
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
 * @param allowlistStore - DM allowlist persistence store
 * @returns Event handler function for the `messageCreate` event
 */
export function createMessageHandler(
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
	allowlistStore: AllowlistStore,
) {
	return async (message: Message): Promise<void> => {
		if (message.author.bot) return;

		try {
			if (message.channel.type === ChannelType.DM) {
				await handleDirectMessage(message, client, config, sessionManager, allowlistStore);
				return;
			}

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
			await terminateSession(config.devinApiKey, sessionId, config.devinOrgId);
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
		await sessionManager.setMuted(sessionId, true);
		await message.react("\uD83D\uDD07");
		return;
	}

	if (lower === "unmute") {
		if (tracked && message.author.id !== tracked.userId) {
			await message.react("\uD83D\uDEAB");
			return;
		}
		await sessionManager.setMuted(sessionId, false);
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

	await message.react("\uD83D\uDC40");

	try {
		if ("sendTyping" in message.channel) {
			await message.channel.sendTyping().catch(() => {});
		}

		const attachmentLines = await processMessageAttachments(
			config.devinApiKey,
			message,
			config.devinOrgId,
		);
		const fullMessage = (content || "") + attachmentLines;

		await sendMessage(config.devinApiKey, sessionId, fullMessage, config.devinOrgId);
	} finally {
		await message.reactions
			.resolve("\uD83D\uDC40")
			?.users.remove(client.user?.id)
			.catch(() => {});
	}
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

	const attachmentLines = await processMessageAttachments(
		config.devinApiKey,
		message,
		config.devinOrgId,
	);
	const prompt = (task || "See attached files.") + attachmentLines;

	const queue = sessionManager.getQueue();

	let session_id: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(message.author.id, prompt, (p) =>
				createSession(config.devinApiKey, p, config.devinOrgId),
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
		const result = await createSession(config.devinApiKey, prompt, config.devinOrgId);
		session_id = result.session_id;
		url = result.url;
	}

	log.info(`Session created via @mention: ${session_id}`);

	let tracked = false;
	try {
		const prefix = `${config.botName}: `;
		const maxTaskLen = Math.max(0, THREAD_NAME_MAX_LENGTH - prefix.length);
		const threadName = `${prefix}${(task || "New session").slice(0, maxTaskLen)}`;
		const thread = await message.startThread({
			name: threadName,
			autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
			reason: `Devin session ${session_id}`,
		});

		const embed = new EmbedBuilder()
			.setDescription(
				`Talk to ${config.botName} in this thread — [Open web app](${url})\n\n\u{1F4A1} **Tip:** Type \`mute\` to stop Devin from reading your messages`,
			)
			.setColor(EMBED_COLORS.working);

		await sessionManager.track(session_id, thread, url, message.author.id, {
			originalMessageId: message.id,
			originalChannelId: message.channelId,
		});
		tracked = true;

		await thread.send({ embeds: [embed] });
	} catch (err) {
		if (!tracked) {
			queue?.releaseSession(session_id, message.author.id);
		}
		throw err;
	}
}

/**
 * Handles a direct message from a user. Checks the allowlist,
 * then either continues an existing DM session or creates a new one.
 */
async function handleDirectMessage(
	message: Message,
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
	allowlistStore: AllowlistStore,
): Promise<void> {
	const allowed = await allowlistStore.isAllowed(message.author.id);
	if (!allowed) {
		await message.reply(
			"You are not authorized to use DMs with this bot. Ask a server admin to add you via `/devin allowlist add`.",
		);
		return;
	}

	const existingSessionId = sessionManager.getSessionByThread(message.channelId);

	if (existingSessionId) {
		await handleDmSessionMessage(message, existingSessionId, client, config, sessionManager);
	} else {
		await handleDmNewSession(message, client, config, sessionManager);
	}
}

/**
 * Forwards a message to an existing DM session.
 * Supports the same keywords as thread sessions (EXIT, mute, unmute, !aside).
 */
async function handleDmSessionMessage(
	message: Message,
	sessionId: string,
	client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const content = message.content.trim();
	const lower = content.toLowerCase();
	const tracked = sessionManager.getTracked(sessionId);

	if (lower === "exit") {
		try {
			await terminateSession(config.devinApiKey, sessionId, config.devinOrgId);
		} catch (err) {
			log.error("Failed to terminate DM session:", err);
		}
		await sessionManager.userStop(sessionId);
		await message.reply("Session stopped.");
		return;
	}

	if (lower === "mute") {
		await sessionManager.setMuted(sessionId, true);
		await message.reply("Session muted. Messages will not be forwarded to Devin.");
		return;
	}

	if (lower === "unmute") {
		await sessionManager.setMuted(sessionId, false);
		await message.reply("Session unmuted. Messages will be forwarded to Devin.");
		return;
	}

	if (lower.startsWith("!aside") || lower.startsWith("(aside)")) return;

	if (sessionManager.isMuted(sessionId)) {
		await message.reply("Session is muted. Type `unmute` to resume.");
		return;
	}

	if (tracked && TERMINAL_STATUSES.has(tracked.lastStatus)) {
		await handleDmNewSession(message, client, config, sessionManager);
		return;
	}

	if (!content && message.attachments.size === 0) return;

	try {
		if ("sendTyping" in message.channel) {
			await message.channel.sendTyping().catch(() => {});
		}

		const attachmentLines = await processMessageAttachments(
			config.devinApiKey,
			message,
			config.devinOrgId,
		);
		const fullMessage = (content || "") + attachmentLines;

		await sendMessage(config.devinApiKey, sessionId, fullMessage, config.devinOrgId);
	} catch (err) {
		log.error("Failed to forward DM to Devin:", err);
		await message.reply("Failed to send your message to Devin. Please try again.").catch(() => {});
	}
}

/**
 * Creates a new Devin session from a DM and tracks it
 * against the DM channel for continued conversation.
 */
async function handleDmNewSession(
	message: Message,
	_client: Client,
	config: BotConfig,
	sessionManager: SessionManager,
): Promise<void> {
	const task = message.content.trim();
	if (!task && message.attachments.size === 0) {
		await message.reply("What would you like me to work on? Send me a task description.");
		return;
	}

	const attachmentLines = await processMessageAttachments(
		config.devinApiKey,
		message,
		config.devinOrgId,
	);
	const prompt = (task || "See attached files.") + attachmentLines;

	const queue = sessionManager.getQueue();

	let session_id: string;
	let url: string;

	if (queue) {
		try {
			const result = await queue.enqueue(message.author.id, prompt, (p) =>
				createSession(config.devinApiKey, p, config.devinOrgId),
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
		const result = await createSession(config.devinApiKey, prompt, config.devinOrgId);
		session_id = result.session_id;
		url = result.url;
	}

	log.info(`DM session created: ${session_id} for user ${message.author.id}`);

	const dmChannel = message.channel as DMChannel;

	let tracked = false;
	try {
		await sessionManager.track(session_id, dmChannel, url, message.author.id);
		tracked = true;

		const embed = new EmbedBuilder()
			.setDescription(
				`Talk to ${config.botName} here — [Open web app](${url})\n\n\u{1F4A1} **Tip:** Type \`mute\` to stop Devin from reading your messages`,
			)
			.setColor(EMBED_COLORS.working);

		await dmChannel.send({ embeds: [embed] });
	} catch (err) {
		if (!tracked) {
			queue?.releaseSession(session_id, message.author.id);
		}
		throw err;
	}
}
