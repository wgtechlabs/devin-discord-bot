/**
 * Token-bucket rate limiter for Devin API calls.
 *
 * Prevents exceeding API rate limits by queuing requests when
 * the bucket is empty and processing them as tokens refill.
 * Supports per-user and global rate limiting.
 */

interface RateLimitConfig {
	/** Maximum tokens in the bucket */
	maxTokens: number;
	/** Token refill rate per interval */
	refillRate: number;
	/** Refill interval in milliseconds */
	refillInterval: number;
}

interface PendingRequest<T> {
	execute: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
	userId: string;
	enqueuedAt: number;
}

/**
 * Token-bucket rate limiter with per-user fairness.
 *
 * Each bucket holds a configurable number of tokens that refill
 * at a steady rate. When a request arrives and tokens are available,
 * it executes immediately. Otherwise it queues and waits.
 */
export class RateLimiter {
	private tokens: number;
	private readonly config: RateLimitConfig;
	private readonly queue: PendingRequest<unknown>[] = [];
	private refillTimer: ReturnType<typeof setInterval> | null = null;
	private readonly userRequestCounts = new Map<string, number>();
	private processing = false;

	constructor(config: RateLimitConfig) {
		this.config = config;
		this.tokens = config.maxTokens;
		this.startRefill();
	}

	/**
	 * Schedules a request through the rate limiter.
	 * Resolves when the request executes, rejects if it fails.
	 *
	 * @param userId - Discord user ID for per-user tracking
	 * @param execute - Async function to execute when a token is available
	 * @returns Promise resolving to the execute function's return value
	 */
	async schedule<T>(userId: string, execute: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const pending: PendingRequest<T> = {
				execute,
				resolve,
				reject,
				userId,
				enqueuedAt: Date.now(),
			};

			this.queue.push(pending as PendingRequest<unknown>);
			this.userRequestCounts.set(userId, (this.userRequestCounts.get(userId) ?? 0) + 1);
			this.processQueue();
		});
	}

	/**
	 * Returns the number of available tokens.
	 */
	get availableTokens(): number {
		return this.tokens;
	}

	/**
	 * Returns the current queue depth.
	 */
	get queueSize(): number {
		return this.queue.length;
	}

	/**
	 * Returns pending request count for a specific user.
	 */
	getUserQueueSize(userId: string): number {
		return this.userRequestCounts.get(userId) ?? 0;
	}

	/**
	 * Stops the refill timer and clears the queue.
	 * Pending requests are rejected with an abort error.
	 */
	destroy(): void {
		if (this.refillTimer) {
			clearInterval(this.refillTimer);
			this.refillTimer = null;
		}
		for (const pending of this.queue) {
			pending.reject(new Error("Rate limiter destroyed"));
		}
		this.queue.length = 0;
		this.userRequestCounts.clear();
	}

	private startRefill(): void {
		this.refillTimer = setInterval(() => {
			const previousTokens = this.tokens;
			this.tokens = Math.min(this.config.maxTokens, this.tokens + this.config.refillRate);

			if (this.tokens > previousTokens && this.queue.length > 0) {
				this.processQueue();
			}
		}, this.config.refillInterval);
	}

	private async processQueue(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		try {
			while (this.queue.length > 0 && this.tokens > 0) {
				const pending = this.queue.shift();
				if (!pending) break;

				this.tokens--;
				this.decrementUserCount(pending.userId);

				try {
					const result = await pending.execute();
					pending.resolve(result);
				} catch (err) {
					pending.reject(err);
				}
			}
		} finally {
			this.processing = false;
		}
	}

	private decrementUserCount(userId: string): void {
		const count = this.userRequestCounts.get(userId) ?? 0;
		if (count <= 1) {
			this.userRequestCounts.delete(userId);
		} else {
			this.userRequestCounts.set(userId, count - 1);
		}
	}
}

/** Default global rate limiter configuration */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
	maxTokens: 10,
	refillRate: 2,
	refillInterval: 10_000,
};

/** Per-user rate limiter configuration (stricter) */
export const USER_RATE_LIMIT_CONFIG: RateLimitConfig = {
	maxTokens: 5,
	refillRate: 1,
	refillInterval: 10_000,
};
