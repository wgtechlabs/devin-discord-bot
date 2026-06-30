/**
 * Session lifecycle manager for Discord-Devin session tracking.
 *
 * Maintains an in-memory map of active sessions, handles adaptive
 * polling of the Devin API, posts status embeds to Discord threads,
 * and manages thread-level muting and session ownership.
 */

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type Client,
	type DMChannel,
	EmbedBuilder,
	type ThreadChannel,
} from "discord.js";
import {
	EMBED_COLORS,
	POLL_FAST_PERIOD,
	POLL_INTERVAL_INITIAL,
	POLL_INTERVAL_NORMAL,
	TYPING_INDICATOR_INTERVAL,
	getEmbedFooterText,
} from "../config.js";
import type {
	BotConfig,
	DevinPullRequest,
	DevinSessionState,
	DevinSessionStatus,
	SessionChannel,
	TrackedSession,
} from "../types/index.js";
import { TERMINAL_STATUSES } from "../types/index.js";
import { getSessionState } from "./devin-api.js";
import { formatMarkdownForDiscord } from "./discord-markdown.js";
import { createLogger } from "./logger.js";
import type { SessionQueue } from "./session-queue.js";
import type { SessionStateStore } from "./state-store.js";

const log = createLogger("SessionManager");

/**
 * Maps session status values to human-readable display strings
 * with color-coded emoji indicators.
 */
const STATUS_DISPLAY: Record<DevinSessionStatus, string> = {
	running: "Working",
	blocked: "Blocked",
	finished: "Finished",
	stopped: "Stopped",
	expired: "Expired",
	failed: "Failed",
};

/**
 * Maps session status values to Discord embed color codes.
 */
const STATUS_COLORS: Record<DevinSessionStatus, number> = {
	running: EMBED_COLORS.working,
	blocked: EMBED_COLORS.blocked,
	finished: EMBED_COLORS.finished,
	stopped: EMBED_COLORS.error,
	expired: EMBED_COLORS.error,
	failed: EMBED_COLORS.error,
};

export class SessionManager {
	/** Map of session ID to tracked session data */
	private sessions = new Map<string, TrackedSession>();
	/** Reverse map of Discord thread ID to session ID */
	private threadToSession = new Map<string, string>();
	/** Discord client reference for channel access */
	private client: Client;
	/** Bot configuration with API credentials */
	private config: BotConfig | null = null;
	/** Session queue for concurrency control */
	private queue: SessionQueue | null = null;
	/** Local state store for restart recovery snapshots */
	private readonly stateStore: SessionStateStore;
	/** Serialize state writes to prevent out-of-order snapshot overwrites */
	private persistChain: Promise<void> = Promise.resolve();

	constructor(client: Client, stateStore: SessionStateStore) {
		this.client = client;
		this.stateStore = stateStore;
	}

	/**
	 * Injects the validated bot config for API calls.
	 * Must be called before tracking any sessions.
	 *
	 * @param config - Validated bot configuration
	 */
	setConfig(config: BotConfig): void {
		this.config = config;
	}

	/**
	 * Injects the session queue for concurrency control.
	 *
	 * @param queue - Session queue instance
	 */
	setQueue(queue: SessionQueue): void {
		this.queue = queue;
	}

	/**
	 * Restores tracked sessions from persisted state and resumes polling.
	 */
	async restoreFromState(): Promise<void> {
		const persisted = await this.stateStore.load();
		if (persisted.length === 0) return;

		for (const saved of persisted) {
			try {
				const channel = await this.client.channels.fetch(saved.threadId);
				if (!channel || (!channel.isThread() && !channel.isDMBased())) {
					log.warn(`Restore orphaned session ${saved.sessionId}: missing thread ${saved.threadId}`);
					continue;
				}

				const session: TrackedSession = {
					sessionId: saved.sessionId,
					thread: channel as ThreadChannel | DMChannel,
					url: saved.url,
					userId: saved.userId,
					lastStatus: saved.lastStatus,
					lastMessageCount: saved.lastMessageCount,
					statusReason: saved.statusReason,
					muted: saved.muted,
					pollTimer: null,
					typingTimer: null,
					createdAt: saved.createdAt,
					originalMessageId: saved.originalMessageId,
					originalChannelId: saved.originalChannelId,
					postedPullRequests: new Set(),
				};

				this.sessions.set(saved.sessionId, session);
				this.threadToSession.set(channel.id, saved.sessionId);

				const permissionBlocked =
					saved.lastStatus === "blocked" && saved.statusReason === "permission-denied";
				if (!TERMINAL_STATUSES.has(saved.lastStatus) && !permissionBlocked) {
					this.queue?.registerActiveSession(saved.sessionId, saved.userId);
					this.startPolling(saved.sessionId);
					if (saved.lastStatus === "running") {
						this.startTypingIndicator(saved.sessionId);
					}
				}
			} catch (error) {
				if (this.isPermissionError(error)) {
					log.error(
						`Restore blocked session ${saved.sessionId}: permission error for thread ${saved.threadId}`,
						error,
					);
					continue;
				}
				throw error;
			}
		}

		await this.persistState();
	}

	/**
	 * Returns the session queue instance for external use.
	 */
	getQueue(): SessionQueue | null {
		return this.queue;
	}

	/**
	 * Begins tracking a new Devin session and starts polling for updates.
	 *
	 * @param sessionId - Devin API session identifier
	 * @param thread - Discord thread for posting updates
	 * @param url - Devin dashboard URL for the session
	 * @param userId - Discord user ID of the session creator
	 * @param meta - Optional metadata (original message/channel IDs)
	 */
	async track(
		sessionId: string,
		thread: SessionChannel,
		url: string,
		userId: string,
		meta?: { originalMessageId?: string; originalChannelId?: string },
	): Promise<void> {
		const session: TrackedSession = {
			sessionId,
			thread,
			url,
			userId,
			lastStatus: "running",
			lastMessageCount: 0,
			muted: false,
			pollTimer: null,
			typingTimer: null,
			createdAt: Date.now(),
			originalMessageId: meta?.originalMessageId,
			originalChannelId: meta?.originalChannelId,
			postedPullRequests: new Set(),
		};

		const existingSessionId = this.threadToSession.get(thread.id);
		if (existingSessionId && existingSessionId !== sessionId) {
			const oldSession = this.sessions.get(existingSessionId);
			if (oldSession) {
				this.stopPolling(existingSessionId);
				this.stopTypingIndicator(existingSessionId);
				this.queue?.releaseSession(existingSessionId, oldSession.userId);
				this.sessions.delete(existingSessionId);
			}
		}

		this.sessions.set(sessionId, session);
		this.threadToSession.set(thread.id, sessionId);
		this.startPolling(sessionId);
		this.startTypingIndicator(sessionId);
		this.queue?.registerActiveSession(sessionId, userId);
		await this.persistState();

		log.info(`Tracking session ${sessionId} in thread ${thread.id}`);
	}

	/**
	 * Looks up a session ID from a Discord thread ID.
	 *
	 * @param threadId - Discord thread identifier
	 * @returns Session ID if found, undefined otherwise
	 */
	getSessionByThread(threadId: string): string | undefined {
		return this.threadToSession.get(threadId);
	}

	/**
	 * Retrieves the full tracked session record.
	 *
	 * @param sessionId - Devin session identifier
	 * @returns Tracked session data or undefined
	 */
	getTracked(sessionId: string): TrackedSession | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * Toggles the mute state for a session's thread forwarding.
	 *
	 * @param sessionId - Target session identifier
	 * @param muted - Whether to mute (true) or unmute (false)
	 */
	async setMuted(sessionId: string, muted: boolean): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.muted = muted;
		await this.persistState();
	}

	/**
	 * Checks whether a session's thread forwarding is muted.
	 *
	 * @param sessionId - Target session identifier
	 * @returns True if muted, false otherwise
	 */
	isMuted(sessionId: string): boolean {
		return this.sessions.get(sessionId)?.muted ?? false;
	}

	/**
	 * Returns all currently tracked sessions as an array.
	 */
	getAllSessions(): TrackedSession[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * Handles user-initiated session stop. Cleans up polling
	 * and posts a terminal status embed.
	 *
	 * @param sessionId - Session to stop
	 */
	async userStop(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		this.stopPolling(sessionId);
		this.stopTypingIndicator(sessionId);
		session.lastStatus = "stopped";
		session.statusReason = undefined;
		await this.persistState();

		const embed = new EmbedBuilder()
			.setTitle("Session Stopped")
			.setDescription("This Devin session was manually terminated.")
			.setColor(EMBED_COLORS.error)
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		try {
			await session.thread.send({ embeds: [embed] });
		} catch (error) {
			await this.handlePermissionLoss(sessionId, session, "send stop embed", error);
		}

		await this.updateOriginalReaction(session, "stop");
		this.queue?.releaseSession(sessionId, session.userId);
		await this.persistState();
	}

	/**
	 * Starts adaptive polling for a session. Uses a shorter interval
	 * during the initial active period, then slows down.
	 */
	private startPolling(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session || !this.config) return;

		const apiKey = this.config.devinApiKey;
		const orgId = this.config.devinOrgId;
		const poll = async () => {
			try {
				const state = await getSessionState(apiKey, sessionId, orgId);
				await this.processUpdate(sessionId, state);
			} catch (err) {
				log.error(`Poll error for ${sessionId}:`, err);
			}
		};

		const getInterval = () => {
			const elapsed = Date.now() - session.createdAt;
			return elapsed < POLL_FAST_PERIOD ? POLL_INTERVAL_INITIAL : POLL_INTERVAL_NORMAL;
		};

		const scheduleNext = () => {
			const permissionBlocked =
				session.lastStatus === "blocked" && session.statusReason === "permission-denied";
			if (TERMINAL_STATUSES.has(session.lastStatus) || permissionBlocked) return;
			session.pollTimer = setTimeout(async () => {
				await poll();
				scheduleNext();
			}, getInterval());
		};

		scheduleNext();
	}

	/**
	 * Starts a continuous typing indicator for a session.
	 * Fires every 8 seconds to keep the indicator visible in Discord
	 * while the session is in a non-terminal, non-blocked status.
	 */
	private startTypingIndicator(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.stopTypingIndicator(sessionId);

		const sendTyping = () => {
			if (TERMINAL_STATUSES.has(session.lastStatus) || session.lastStatus === "blocked") {
				this.stopTypingIndicator(sessionId);
				return;
			}
			session.thread.sendTyping().catch(() => {});
		};

		sendTyping();
		session.typingTimer = setInterval(sendTyping, TYPING_INDICATOR_INTERVAL);
	}

	/**
	 * Stops the continuous typing indicator for a session.
	 */
	private stopTypingIndicator(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session?.typingTimer) {
			clearInterval(session.typingTimer);
			session.typingTimer = null;
		}
	}

	/**
	 * Stops the polling timer for a session.
	 */
	private stopPolling(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session?.pollTimer) {
			clearTimeout(session.pollTimer);
			session.pollTimer = null;
		}
	}

	/**
	 * Processes a Devin API state update: posts new messages,
	 * handles status transitions, and manages PR notifications.
	 */
	private async processUpdate(sessionId: string, state: DevinSessionState): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		const newMessages = state.messages.slice(session.lastMessageCount);
		for (const msg of newMessages) {
			if (msg.role === "devin") {
				await this.postDevinMessage(session, msg.content);
			}
		}
		session.lastMessageCount = state.messages.length;
		if (newMessages.length > 0) {
			await this.persistState();
		}

		if (state.pull_requests?.length) {
			for (const pr of state.pull_requests) {
				if (!session.postedPullRequests.has(pr.url)) {
					session.postedPullRequests.add(pr.url);
					await this.postPullRequest(session, pr);
				}
			}
		}

		if (state.status !== session.lastStatus) {
			const previousStatus = session.lastStatus;
			session.lastStatus = state.status;
			session.statusReason = undefined;
			await this.persistState();

			if (TERMINAL_STATUSES.has(state.status)) {
				this.stopPolling(sessionId);
				this.stopTypingIndicator(sessionId);
				await this.postStatusChange(session, state.status);
				await this.updateOriginalReaction(session, state.status);
				this.queue?.releaseSession(sessionId, session.userId);
				await this.persistState();
			} else if (state.status === "blocked") {
				this.stopTypingIndicator(sessionId);
			} else if (state.status === "running" && previousStatus === "blocked") {
				this.startTypingIndicator(sessionId);
			}
		}
	}

	/**
	 * Posts a Devin message as a plain text message in the session thread.
	 * Splits content into multiple messages if it exceeds Discord's 2000 character limit.
	 */
	private async postDevinMessage(session: TrackedSession, content: string): Promise<void> {
		try {
			await session.thread.sendTyping().catch(() => {});
			const formatted = formatMarkdownForDiscord(content);
			const chunks = this.splitMessage(formatted);
			for (const chunk of chunks) {
				await session.thread.send(chunk);
			}
		} catch (error) {
			await this.handlePermissionLoss(session.sessionId, session, "post Devin message", error);
		}
	}

	/**
	 * Splits a message into chunks that fit within Discord's 2000 character limit.
	 * Splits on newline boundaries when possible to preserve formatting.
	 */
	private splitMessage(content: string, maxLength = 2000): string[] {
		if (content.length <= maxLength) return [content];

		const FENCE_OVERHEAD = 4;
		const safeLength = maxLength - FENCE_OVERHEAD;
		const chunks: string[] = [];
		let remaining = content;

		while (remaining.length > 0) {
			if (remaining.length <= maxLength) {
				chunks.push(remaining);
				break;
			}

			let splitIndex = remaining.lastIndexOf("\n", safeLength);
			if (splitIndex <= 0) {
				splitIndex = remaining.lastIndexOf(" ", safeLength);
			}
			if (splitIndex <= 0) {
				splitIndex = safeLength;
			}

			const chunk = remaining.slice(0, splitIndex);
			const skip = splitIndex === safeLength ? splitIndex : splitIndex + 1;

			const fenceCount = (chunk.match(/^```/gm) || []).length;
			if (fenceCount % 2 !== 0) {
				chunks.push(`${chunk}\n\`\`\``);
				remaining = `\`\`\`\n${remaining.slice(skip)}`;
			} else {
				chunks.push(chunk);
				remaining = remaining.slice(skip);
			}
		}

		return chunks;
	}

	/**
	 * Posts a pull request notification embed in the session thread.
	 * Includes a "Review with Devin" button when the PR URL fits
	 * within Discord's 100-character customId limit.
	 */
	private async postPullRequest(session: TrackedSession, pr: DevinPullRequest): Promise<void> {
		const embed = new EmbedBuilder()
			.setTitle("Pull Request Created")
			.setDescription(`[${pr.title}](${pr.url})`)
			.addFields({ name: "Repository", value: pr.repository, inline: true })
			.setColor(EMBED_COLORS.finished)
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		const CUSTOM_ID_PREFIX = "review-pr:";
		const customId = `${CUSTOM_ID_PREFIX}${pr.url}`;
		const messagePayload: {
			embeds: EmbedBuilder[];
			components?: ActionRowBuilder<ButtonBuilder>[];
		} = { embeds: [embed] };

		if (customId.length <= 100) {
			const button = new ButtonBuilder()
				.setCustomId(customId)
				.setLabel("Review with Devin")
				.setStyle(ButtonStyle.Primary)
				.setEmoji("\uD83D\uDD0D");

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
			messagePayload.components = [row];
		}

		try {
			await session.thread.send(messagePayload);
		} catch (error) {
			await this.handlePermissionLoss(session.sessionId, session, "post PR embed", error);
		}
	}

	/**
	 * Posts a session status change embed when the session reaches
	 * a terminal state.
	 */
	private async postStatusChange(
		session: TrackedSession,
		status: DevinSessionStatus,
	): Promise<void> {
		const embed = new EmbedBuilder()
			.setTitle(`Session ${STATUS_DISPLAY[status]}`)
			.setDescription(`[View in Devin](${session.url})`)
			.setColor(STATUS_COLORS[status])
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		try {
			await session.thread.send({ embeds: [embed] });
		} catch (error) {
			await this.handlePermissionLoss(session.sessionId, session, "post status embed", error);
		}
	}

	/**
	 * Updates the reaction on the original trigger message to reflect
	 * the final session outcome (for @mention-triggered sessions).
	 */
	private async updateOriginalReaction(session: TrackedSession, status: string): Promise<void> {
		if (!session.originalMessageId || !session.originalChannelId) return;

		try {
			const channel = await this.client.channels.fetch(session.originalChannelId);
			if (!channel || !("messages" in channel)) return;

			const message = await channel.messages.fetch(session.originalMessageId);
			const emoji = status === "finished" ? "\u2705" : "\u274C";
			await message.react(emoji);
		} catch (err) {
			log.debug("Could not update original reaction:", err);
		}
	}

	private isPermissionError(error: unknown): boolean {
		const code =
			typeof error === "object" && error !== null && "code" in error
				? (error as { code?: unknown }).code
				: undefined;
		return code === 50001 || code === 50013 || code === 403;
	}

	private async handlePermissionLoss(
		sessionId: string,
		session: TrackedSession,
		action: string,
		error: unknown,
	): Promise<void> {
		if (!this.isPermissionError(error)) {
			log.error(`Failed to ${action}:`, error);
			return;
		}

		this.stopPolling(sessionId);
		this.stopTypingIndicator(sessionId);
		session.lastStatus = "blocked";
		session.statusReason = "permission-denied";
		this.queue?.releaseSession(sessionId, session.userId);
		await this.persistState();
		log.error(
			`Permission lost for session ${sessionId} thread ${session.thread.id} while trying to ${action}`,
			error,
		);
	}

	private async persistState(): Promise<void> {
		const snapshot = Array.from(this.sessions.values()).map((session) => ({
			sessionId: session.sessionId,
			threadId: session.thread.id,
			url: session.url,
			userId: session.userId,
			lastStatus: session.lastStatus,
			lastMessageCount: session.lastMessageCount,
			muted: session.muted,
			createdAt: session.createdAt,
			statusReason: session.statusReason,
			originalMessageId: session.originalMessageId,
			originalChannelId: session.originalChannelId,
		}));

		const write = async () => {
			await this.stateStore.save(snapshot);
		};
		const next = this.persistChain.then(write, write);
		this.persistChain = next.catch(() => {});
		await next;
	}
}
