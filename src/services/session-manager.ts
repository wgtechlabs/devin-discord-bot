/**
 * Session lifecycle manager for Discord-Devin session tracking.
 *
 * Maintains an in-memory map of active sessions, handles adaptive
 * polling of the Devin API, posts status embeds to Discord threads,
 * and manages thread-level muting and session ownership.
 */

import { type Client, EmbedBuilder, type ThreadChannel } from "discord.js";
import {
	EMBED_COLORS,
	POLL_FAST_PERIOD,
	POLL_INTERVAL_INITIAL,
	POLL_INTERVAL_NORMAL,
	getEmbedFooterText,
} from "../config.js";
import type {
	BotConfig,
	DevinPullRequest,
	DevinSessionState,
	DevinSessionStatus,
	TrackedSession,
} from "../types/index.js";
import { TERMINAL_STATUSES } from "../types/index.js";
import { getSessionState } from "./devin-api.js";
import { createLogger } from "./logger.js";
import type { SessionQueue } from "./session-queue.js";

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

	constructor(client: Client) {
		this.client = client;
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
		thread: ThreadChannel,
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
			createdAt: Date.now(),
			originalMessageId: meta?.originalMessageId,
			originalChannelId: meta?.originalChannelId,
		};

		this.sessions.set(sessionId, session);
		this.threadToSession.set(thread.id, sessionId);
		this.startPolling(sessionId);

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
	setMuted(sessionId: string, muted: boolean): void {
		const session = this.sessions.get(sessionId);
		if (session) session.muted = muted;
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
		session.lastStatus = "stopped";

		const embed = new EmbedBuilder()
			.setTitle("Session Stopped")
			.setDescription("This Devin session was manually terminated.")
			.setColor(EMBED_COLORS.error)
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		await session.thread.send({ embeds: [embed] }).catch((err: Error) => {
			log.error("Failed to send stop embed:", err.message);
		});

		await this.updateOriginalReaction(session, "stop");
		this.queue?.releaseSession(sessionId, session.userId);
	}

	/**
	 * Starts adaptive polling for a session. Uses a shorter interval
	 * during the initial active period, then slows down.
	 */
	private startPolling(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session || !this.config) return;

		const apiKey = this.config.devinApiKey;
		const poll = async () => {
			try {
				const state = await getSessionState(apiKey, sessionId);
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
			if (TERMINAL_STATUSES.has(session.lastStatus)) return;
			session.pollTimer = setTimeout(async () => {
				await poll();
				scheduleNext();
			}, getInterval());
		};

		scheduleNext();
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

		if (state.pull_requests?.length) {
			for (const pr of state.pull_requests) {
				await this.postPullRequest(session, pr);
			}
		}

		if (state.status !== session.lastStatus) {
			session.lastStatus = state.status;

			if (TERMINAL_STATUSES.has(state.status)) {
				this.stopPolling(sessionId);
				await this.postStatusChange(session, state.status);
				await this.updateOriginalReaction(session, state.status);
				this.queue?.releaseSession(sessionId, session.userId);
			}
		}
	}

	/**
	 * Posts a Devin message as a rich embed in the session thread.
	 */
	private async postDevinMessage(session: TrackedSession, content: string): Promise<void> {
		const truncated = content.length > 4000 ? `${content.slice(0, 3997)}...` : content;

		const embed = new EmbedBuilder()
			.setDescription(truncated)
			.setColor(EMBED_COLORS.working)
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		await session.thread.send({ embeds: [embed] }).catch((err: Error) => {
			log.error("Failed to post Devin message:", err.message);
		});
	}

	/**
	 * Posts a pull request notification embed in the session thread.
	 */
	private async postPullRequest(session: TrackedSession, pr: DevinPullRequest): Promise<void> {
		const embed = new EmbedBuilder()
			.setTitle("Pull Request Created")
			.setDescription(`[${pr.title}](${pr.url})`)
			.addFields({ name: "Repository", value: pr.repository, inline: true })
			.setColor(EMBED_COLORS.finished)
			.setTimestamp()
			.setFooter({ text: getEmbedFooterText(this.config?.botName ?? "Devin") });

		await session.thread.send({ embeds: [embed] }).catch((err: Error) => {
			log.error("Failed to post PR embed:", err.message);
		});
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

		await session.thread.send({ embeds: [embed] }).catch((err: Error) => {
			log.error("Failed to post status embed:", err.message);
		});
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
}
