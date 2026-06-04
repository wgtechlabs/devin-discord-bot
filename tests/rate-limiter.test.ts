/**
 * Tests for the token-bucket rate limiter.
 *
 * Validates token consumption, refill behavior, queue ordering,
 * and per-user tracking.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RateLimiter } from "../src/services/rate-limiter.js";

describe("RateLimiter", () => {
	let limiter: RateLimiter;

	beforeEach(() => {
		limiter = new RateLimiter({
			maxTokens: 3,
			refillRate: 1,
			refillInterval: 100,
		});
	});

	afterEach(() => {
		limiter.destroy();
	});

	test("starts with max tokens", () => {
		expect(limiter.availableTokens).toBe(3);
	});

	test("consumes token on schedule", async () => {
		await limiter.schedule("user-1", async () => "result");
		expect(limiter.availableTokens).toBe(2);
	});

	test("returns execute function result", async () => {
		const result = await limiter.schedule("user-1", async () => 42);
		expect(result).toBe(42);
	});

	test("queues requests when tokens exhausted", async () => {
		const results: number[] = [];

		const p1 = limiter.schedule("user-1", async () => {
			results.push(1);
			return 1;
		});
		const p2 = limiter.schedule("user-1", async () => {
			results.push(2);
			return 2;
		});
		const p3 = limiter.schedule("user-1", async () => {
			results.push(3);
			return 3;
		});

		await Promise.all([p1, p2, p3]);
		expect(results).toEqual([1, 2, 3]);
		expect(limiter.availableTokens).toBe(0);
	});

	test("queued requests execute after refill", async () => {
		await limiter.schedule("user-1", async () => 1);
		await limiter.schedule("user-1", async () => 2);
		await limiter.schedule("user-1", async () => 3);

		expect(limiter.availableTokens).toBe(0);

		const resultPromise = limiter.schedule("user-1", async () => "refilled");
		expect(limiter.queueSize).toBe(1);

		const result = await resultPromise;
		expect(result).toBe("refilled");
	});

	test("tracks per-user queue size", async () => {
		await limiter.schedule("user-1", async () => 1);
		await limiter.schedule("user-2", async () => 2);
		await limiter.schedule("user-1", async () => 3);

		expect(limiter.availableTokens).toBe(0);

		limiter.schedule("user-1", async () => 4).catch(() => {});
		limiter.schedule("user-2", async () => 5).catch(() => {});

		expect(limiter.getUserQueueSize("user-1")).toBe(1);
		expect(limiter.getUserQueueSize("user-2")).toBe(1);
	});

	test("propagates errors from execute function", async () => {
		await expect(
			limiter.schedule("user-1", async () => {
				throw new Error("test error");
			}),
		).rejects.toThrow("test error");
	});

	test("destroy rejects pending requests", async () => {
		await limiter.schedule("user-1", async () => 1);
		await limiter.schedule("user-1", async () => 2);
		await limiter.schedule("user-1", async () => 3);

		const pending = limiter.schedule("user-1", async () => "never");
		limiter.destroy();

		await expect(pending).rejects.toThrow("Rate limiter destroyed");
	});
});
