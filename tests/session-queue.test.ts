/**
 * Tests for the session queue with concurrency control.
 *
 * Validates per-user limits, global concurrency caps, queue
 * overflow handling, session release, and timeout behavior.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { RateLimiter } from "../src/services/rate-limiter.js";
import { SessionQueue, SessionQueueError } from "../src/services/session-queue.js";

describe("SessionQueue", () => {
	let queue: SessionQueue;
	let rateLimiter: RateLimiter;

	const mockCreateFn = async (prompt: string) => ({
		session_id: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		url: `https://app.devin.ai/sessions/test-${prompt.slice(0, 8)}`,
	});

	beforeEach(() => {
		rateLimiter = new RateLimiter({
			maxTokens: 20,
			refillRate: 5,
			refillInterval: 100,
		});
		queue = new SessionQueue(
			{
				maxConcurrentSessions: 2,
				maxSessionsPerUser: 2,
				maxQueueSize: 5,
				queueTimeout: 5000,
			},
			rateLimiter,
		);
	});

	afterEach(() => {
		queue.destroy();
		rateLimiter.destroy();
	});

	test("creates session when capacity available", async () => {
		const result = await queue.enqueue("user-1", "test task", mockCreateFn);
		expect(result.sessionId).toContain("session-");
		expect(result.url).toContain("https://app.devin.ai/sessions/");
		expect(result.queuedDuration).toBeGreaterThanOrEqual(0);
	});

	test("tracks active sessions in stats", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		const stats = queue.getStats();
		expect(stats.activeSessions).toBe(1);
		expect(stats.maxConcurrentSessions).toBe(2);
		expect(stats.queueDepth).toBe(0);
	});

	test("rejects when user exceeds per-user limit", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		await queue.enqueue("user-1", "task 2", mockCreateFn);

		await expect(queue.enqueue("user-1", "task 3", mockCreateFn)).rejects.toThrow(
			SessionQueueError,
		);

		try {
			await queue.enqueue("user-1", "task 3", mockCreateFn);
		} catch (err) {
			expect(err).toBeInstanceOf(SessionQueueError);
			expect((err as SessionQueueError).code).toBe("USER_LIMIT");
		}
	});

	test("allows different users to create sessions", async () => {
		const r1 = await queue.enqueue("user-1", "task 1", mockCreateFn);
		const r2 = await queue.enqueue("user-2", "task 2", mockCreateFn);
		expect(r1.sessionId).not.toBe(r2.sessionId);
	});

	test("tracks per-user active sessions", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		await queue.enqueue("user-1", "task 2", mockCreateFn);
		expect(queue.getUserActiveSessions("user-1")).toBe(2);
		expect(queue.getUserActiveSessions("user-2")).toBe(0);
	});

	test("releases session and updates stats", async () => {
		const result = await queue.enqueue("user-1", "task 1", mockCreateFn);
		expect(queue.getStats().activeSessions).toBe(1);

		queue.releaseSession(result.sessionId, "user-1");
		expect(queue.getStats().activeSessions).toBe(0);
		expect(queue.getUserActiveSessions("user-1")).toBe(0);
	});

	test("rejects when queue is full", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		await queue.enqueue("user-2", "task 2", mockCreateFn);

		const pendingPromises: Promise<unknown>[] = [];
		for (let i = 0; i < 5; i++) {
			pendingPromises.push(
				queue.enqueue(`user-${i + 10}`, `queued task ${i}`, mockCreateFn).catch(() => {}),
			);
		}

		try {
			await queue.enqueue("user-99", "overflow task", mockCreateFn);
			throw new Error("Expected enqueue to throw but it did not");
		} catch (err) {
			expect(err).toBeInstanceOf(SessionQueueError);
			expect((err as SessionQueueError).code).toBe("QUEUE_FULL");
		}
	});

	test("returns queue position for queued user", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		await queue.enqueue("user-2", "task 2", mockCreateFn);

		queue.enqueue("user-3", "queued task", mockCreateFn).catch(() => {});
		expect(queue.getQueuePosition("user-3")).toBe(1);
		expect(queue.getQueuePosition("user-99")).toBe(0);
	});

	test("destroy rejects all pending requests", async () => {
		await queue.enqueue("user-1", "task 1", mockCreateFn);
		await queue.enqueue("user-2", "task 2", mockCreateFn);

		const pending = queue.enqueue("user-3", "queued task", mockCreateFn);
		queue.destroy();

		await expect(pending).rejects.toThrow("Session queue was shut down.");
	});

	test("enqueue after destroy throws DESTROYED error", async () => {
		queue.destroy();

		try {
			await queue.enqueue("user-1", "task 1", mockCreateFn);
			throw new Error("Expected enqueue to throw but it did not");
		} catch (err) {
			expect(err).toBeInstanceOf(SessionQueueError);
			expect((err as SessionQueueError).code).toBe("DESTROYED");
		}
	});

	test("queued request times out after queueTimeout", async () => {
		const shortTimeoutQueue = new SessionQueue(
			{
				maxConcurrentSessions: 1,
				maxSessionsPerUser: 1,
				maxQueueSize: 5,
				queueTimeout: 50,
			},
			rateLimiter,
		);

		// Fill the one slot with a slow session so the next request is queued
		const slowCreate = (_prompt: string) =>
			new Promise<{ session_id: string; url: string }>((resolve) =>
				setTimeout(() => resolve({ session_id: "slow-session", url: "https://example.com" }), 500),
			);
		shortTimeoutQueue.enqueue("user-1", "slow task", slowCreate).catch(() => {});

		// Await the queued request — it should be rejected with TIMEOUT once the
		// interval fires (queueTimeout=50ms so interval=50ms, max wait ~100ms).
		let timeoutError: unknown;
		try {
			await shortTimeoutQueue.enqueue("user-2", "queued task", mockCreateFn);
		} catch (err) {
			timeoutError = err;
		}

		shortTimeoutQueue.destroy();

		expect(timeoutError).toBeInstanceOf(SessionQueueError);
		expect((timeoutError as SessionQueueError).code).toBe("TIMEOUT");
	});

	test("SessionQueueError has correct code and message", () => {
		const err = new SessionQueueError("QUEUE_FULL", "Queue is full");
		expect(err.code).toBe("QUEUE_FULL");
		expect(err.message).toBe("Queue is full");
		expect(err.name).toBe("SessionQueueError");
		expect(err).toBeInstanceOf(Error);
	});
});
