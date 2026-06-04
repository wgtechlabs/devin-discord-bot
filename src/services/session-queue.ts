/**
 * Session creation queue with concurrency control.
 *
 * Limits the number of simultaneously active Devin sessions and
 * queues excess requests with user-friendly position feedback.
 * Integrates with the rate limiter for API call throttling.
 */

import { createLogger } from "./logger.js";
import { DEFAULT_RATE_LIMIT_CONFIG, type RateLimiter } from "./rate-limiter.js";
import { RateLimiter as RateLimiterClass } from "./rate-limiter.js";

const log = createLogger("SessionQueue");

interface QueuedSessionRequest {
	userId: string;
	prompt: string;
	createFn: (prompt: string) => Promise<{ session_id: string; url: string }>;
	resolve: (result: SessionQueueResult) => void;
	reject: (reason: unknown) => void;
	enqueuedAt: number;
	position: number;
}

export interface SessionQueueResult {
	sessionId: string;
	url: string;
	queuedDuration: number;
}

export interface SessionQueueConfig {
	/** Maximum concurrent active sessions across all users */
	maxConcurrentSessions: number;
	/** Maximum concurrent sessions per user */
	maxSessionsPerUser: number;
	/** Maximum queue depth before rejecting new requests */
	maxQueueSize: number;
	/** Maximum time a request can wait in queue (milliseconds) */
	queueTimeout: number;
}

export const DEFAULT_QUEUE_CONFIG: SessionQueueConfig = {
	maxConcurrentSessions: 5,
	maxSessionsPerUser: 2,
	maxQueueSize: 20,
	queueTimeout: 300_000,
};

/**
 * Manages session creation with concurrency limits and fair queuing.
 *
 * When the system is at capacity, new requests are queued and
 * processed in FIFO order as slots become available. Per-user
 * limits prevent a single user from consuming all slots.
 */
export class SessionQueue {
	private readonly config: SessionQueueConfig;
	private readonly rateLimiter: RateLimiter;
	private readonly queue: QueuedSessionRequest[] = [];
	private readonly activeSessionsByUser = new Map<string, Set<string>>();
	private activeSessions = 0;
	private timeoutTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: Partial<SessionQueueConfig> = {}, rateLimiter?: RateLimiter) {
		this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
		this.rateLimiter = rateLimiter ?? new RateLimiterClass(DEFAULT_RATE_LIMIT_CONFIG);
		this.startTimeoutCheck();
	}

	/**
	 * Attempts to enqueue a session creation request.
	 * Returns immediately if capacity is available, otherwise queues.
	 *
	 * @param userId - Discord user requesting the session
	 * @param prompt - Task prompt for the Devin session
	 * @param createFn - Function that creates the session via API
	 * @returns Promise resolving to session result when processed
	 * @throws Error if queue is full or user is at their limit
	 */
	async enqueue(
		userId: string,
		prompt: string,
		createFn: (prompt: string) => Promise<{ session_id: string; url: string }>,
	): Promise<SessionQueueResult> {
		const userSessions = this.activeSessionsByUser.get(userId)?.size ?? 0;

		if (userSessions >= this.config.maxSessionsPerUser) {
			throw new SessionQueueError(
				"USER_LIMIT",
				`You have reached the maximum of ${this.config.maxSessionsPerUser} concurrent sessions. Please wait for a session to finish or stop one with \`/devin stop\`.`,
			);
		}

		if (this.queue.length >= this.config.maxQueueSize) {
			throw new SessionQueueError(
				"QUEUE_FULL",
				"The session queue is full. Please try again later.",
			);
		}

		if (this.activeSessions < this.config.maxConcurrentSessions) {
			return this.executeSession(userId, prompt, createFn);
		}

		return new Promise<SessionQueueResult>((resolve, reject) => {
			const request: QueuedSessionRequest = {
				userId,
				prompt,
				createFn,
				resolve,
				reject,
				enqueuedAt: Date.now(),
				position: this.queue.length + 1,
			};
			this.queue.push(request);
			log.info(
				`Queued session for user ${userId} at position ${request.position} ` +
					`(${this.activeSessions}/${this.config.maxConcurrentSessions} active)`,
			);
		});
	}

	/**
	 * Signals that a session has completed, freeing a slot.
	 * Triggers processing of the next queued request.
	 *
	 * @param sessionId - Completed session identifier
	 * @param userId - User who owned the session
	 */
	releaseSession(sessionId: string, userId: string): void {
		this.activeSessions = Math.max(0, this.activeSessions - 1);

		const userSet = this.activeSessionsByUser.get(userId);
		if (userSet) {
			userSet.delete(sessionId);
			if (userSet.size === 0) {
				this.activeSessionsByUser.delete(userId);
			}
		}

		log.info(
			`Released session ${sessionId} for user ${userId} ` +
				`(${this.activeSessions}/${this.config.maxConcurrentSessions} active, ${this.queue.length} queued)`,
		);

		this.processNext();
	}

	/**
	 * Returns the current queue position for a user's pending request.
	 * Returns 0 if the user has no pending requests.
	 */
	getQueuePosition(userId: string): number {
		const index = this.queue.findIndex((r) => r.userId === userId);
		return index === -1 ? 0 : index + 1;
	}

	/**
	 * Returns queue statistics for monitoring.
	 */
	getStats(): {
		activeSessions: number;
		maxConcurrentSessions: number;
		queueDepth: number;
		maxQueueSize: number;
	} {
		return {
			activeSessions: this.activeSessions,
			maxConcurrentSessions: this.config.maxConcurrentSessions,
			queueDepth: this.queue.length,
			maxQueueSize: this.config.maxQueueSize,
		};
	}

	/**
	 * Returns active session count for a specific user.
	 */
	getUserActiveSessions(userId: string): number {
		return this.activeSessionsByUser.get(userId)?.size ?? 0;
	}

	/**
	 * Cleans up timers and rejects all pending requests.
	 */
	destroy(): void {
		if (this.timeoutTimer) {
			clearInterval(this.timeoutTimer);
			this.timeoutTimer = null;
		}
		for (const request of this.queue) {
			request.reject(new SessionQueueError("DESTROYED", "Session queue was shut down."));
		}
		this.queue.length = 0;
	}

	private async executeSession(
		userId: string,
		prompt: string,
		createFn: (prompt: string) => Promise<{ session_id: string; url: string }>,
	): Promise<SessionQueueResult> {
		this.activeSessions++;
		const startTime = Date.now();

		try {
			const result = await this.rateLimiter.schedule(userId, () => createFn(prompt));

			if (!this.activeSessionsByUser.has(userId)) {
				this.activeSessionsByUser.set(userId, new Set());
			}
			this.activeSessionsByUser.get(userId)?.add(result.session_id);

			return {
				sessionId: result.session_id,
				url: result.url,
				queuedDuration: Date.now() - startTime,
			};
		} catch (err) {
			this.activeSessions = Math.max(0, this.activeSessions - 1);
			throw err;
		}
	}

	private async processNext(): Promise<void> {
		if (this.queue.length === 0) return;
		if (this.activeSessions >= this.config.maxConcurrentSessions) return;

		const request = this.queue.shift();
		if (!request) return;

		this.updatePositions();

		try {
			const result = await this.executeSession(request.userId, request.prompt, request.createFn);
			request.resolve(result);
		} catch (err) {
			request.reject(err);
		}
	}

	private updatePositions(): void {
		for (let i = 0; i < this.queue.length; i++) {
			this.queue[i].position = i + 1;
		}
	}

	private startTimeoutCheck(): void {
		this.timeoutTimer = setInterval(() => {
			const now = Date.now();
			const timedOut: QueuedSessionRequest[] = [];

			for (let i = this.queue.length - 1; i >= 0; i--) {
				if (now - this.queue[i].enqueuedAt > this.config.queueTimeout) {
					const [request] = this.queue.splice(i, 1);
					timedOut.push(request);
				}
			}

			for (const request of timedOut) {
				log.warn(`Queue timeout for user ${request.userId} after ${this.config.queueTimeout}ms`);
				request.reject(
					new SessionQueueError(
						"TIMEOUT",
						"Your session request timed out in the queue. Please try again.",
					),
				);
			}

			if (timedOut.length > 0) {
				this.updatePositions();
			}
		}, 30_000);
	}
}

export type SessionQueueErrorCode = "USER_LIMIT" | "QUEUE_FULL" | "TIMEOUT" | "DESTROYED";

/**
 * Typed error for queue-related failures with a machine-readable code.
 */
export class SessionQueueError extends Error {
	readonly code: SessionQueueErrorCode;

	constructor(code: SessionQueueErrorCode, message: string) {
		super(message);
		this.name = "SessionQueueError";
		this.code = code;
	}
}
