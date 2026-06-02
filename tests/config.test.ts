/**
 * Tests for the configuration loader module.
 *
 * Validates that loadConfig correctly reads environment variables,
 * applies defaults, and handles invalid log levels gracefully.
 */

import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.js";
import {
	DEVIN_API_BASE_URL,
	EMBED_COLORS,
	EMBED_FOOTER_TEXT,
	POLL_FAST_PERIOD,
	POLL_INTERVAL_INITIAL,
	POLL_INTERVAL_NORMAL,
	THREAD_AUTO_ARCHIVE_DURATION,
	THREAD_NAME_MAX_LENGTH,
} from "../src/config.js";

describe("loadConfig", () => {
	test("returns validated config from environment variables", () => {
		const config = loadConfig();

		expect(config.discordBotToken).toBe("test-token");
		expect(config.discordClientId).toBe("test-client-id");
		expect(config.devinApiKey).toBe("apk_test-key");
		expect(config.logLevel).toBe("error");
	});

	test("defaults log level to info for invalid values", () => {
		const original = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = "invalid";

		const config = loadConfig();
		expect(config.logLevel).toBe("info");

		process.env.LOG_LEVEL = original;
	});
});

describe("config constants", () => {
	test("embed colors are valid hex values", () => {
		expect(EMBED_COLORS.working).toBeGreaterThan(0);
		expect(EMBED_COLORS.blocked).toBeGreaterThan(0);
		expect(EMBED_COLORS.finished).toBeGreaterThan(0);
		expect(EMBED_COLORS.error).toBeGreaterThan(0);
		expect(EMBED_COLORS.info).toBeGreaterThan(0);
	});

	test("footer text is defined", () => {
		expect(EMBED_FOOTER_TEXT).toBe("Devin Discord Bot");
	});

	test("polling intervals are reasonable", () => {
		expect(POLL_INTERVAL_INITIAL).toBe(5_000);
		expect(POLL_INTERVAL_NORMAL).toBe(15_000);
		expect(POLL_FAST_PERIOD).toBe(120_000);
	});

	test("thread config values are sensible", () => {
		expect(THREAD_AUTO_ARCHIVE_DURATION).toBe(1440);
		expect(THREAD_NAME_MAX_LENGTH).toBe(100);
	});

	test("API base URL points to Devin", () => {
		expect(DEVIN_API_BASE_URL).toBe("https://api.devin.ai/v1");
	});
});
