/**
 * Tests for the configuration loader module.
 *
 * Validates that loadConfig correctly reads environment variables,
 * applies defaults, and handles invalid log levels gracefully.
 */

import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.js";
import {
	BOT_NAME_MAX_LENGTH,
	DEVIN_API_BASE_URL,
	EMBED_COLORS,
	EMBED_FOOTER_TEXT,
	POLL_FAST_PERIOD,
	POLL_INTERVAL_INITIAL,
	POLL_INTERVAL_NORMAL,
	THREAD_AUTO_ARCHIVE_DURATION,
	THREAD_NAME_MAX_LENGTH,
	getEmbedFooterText,
} from "../src/config.js";

describe("loadConfig", () => {
	test("returns validated config from environment variables", () => {
		const config = loadConfig();

		expect(config.discordBotToken).toBe("test-token");
		expect(config.discordClientId).toBe("test-client-id");
		expect(config.devinApiKey).toBe("apk_test-key");
		expect(config.devinOrgId).toBeUndefined();
		expect(config.logLevel).toBe("error");
	});

	test("defaults bot name to Devin when BOT_NAME is not set", () => {
		const original = process.env.BOT_NAME;
		// biome-ignore lint/performance/noDelete: Test requires unsetting env var.
		delete process.env.BOT_NAME;

		const config = loadConfig();
		expect(config.botName).toBe("Devin");

		if (original === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.BOT_NAME;
		} else {
			process.env.BOT_NAME = original;
		}
	});

	test("uses custom bot name from BOT_NAME env variable", () => {
		const original = process.env.BOT_NAME;
		process.env.BOT_NAME = "MyBot";

		const config = loadConfig();
		expect(config.botName).toBe("MyBot");

		if (original === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.BOT_NAME;
		} else {
			process.env.BOT_NAME = original;
		}
	});

	test("truncates bot name exceeding max length", () => {
		const original = process.env.BOT_NAME;
		process.env.BOT_NAME = "A".repeat(BOT_NAME_MAX_LENGTH + 20);

		const config = loadConfig();
		expect(config.botName.length).toBe(BOT_NAME_MAX_LENGTH);

		if (original === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.BOT_NAME;
		} else {
			process.env.BOT_NAME = original;
		}
	});

	test("falls back to Devin for whitespace-only bot name", () => {
		const original = process.env.BOT_NAME;
		process.env.BOT_NAME = "   ";

		const config = loadConfig();
		expect(config.botName).toBe("Devin");

		if (original === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.BOT_NAME;
		} else {
			process.env.BOT_NAME = original;
		}
	});

	test("defaults log level to info for invalid values", () => {
		const original = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = "invalid";

		const config = loadConfig();
		expect(config.logLevel).toBe("info");

		process.env.LOG_LEVEL = original;
	});

	test("uses DEVIN_ORG_ID when provided", () => {
		const originalApiKey = process.env.DEVIN_API_KEY;
		const originalOrgId = process.env.DEVIN_ORG_ID;
		process.env.DEVIN_API_KEY = "cog_test-key";
		process.env.DEVIN_ORG_ID = "org-test";

		const config = loadConfig();
		expect(config.devinApiKey).toBe("cog_test-key");
		expect(config.devinOrgId).toBe("org-test");

		if (originalApiKey === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.DEVIN_API_KEY;
		} else {
			process.env.DEVIN_API_KEY = originalApiKey;
		}

		if (originalOrgId === undefined) {
			// biome-ignore lint/performance/noDelete: Restore env var to unset state.
			delete process.env.DEVIN_ORG_ID;
		} else {
			process.env.DEVIN_ORG_ID = originalOrgId;
		}
	});

	test("requires DEVIN_ORG_ID for cog_ keys", () => {
		const originalApiKey = process.env.DEVIN_API_KEY;
		const originalOrgId = process.env.DEVIN_ORG_ID;
		const originalExit = process.exit;
		const originalConsoleError = console.error;

		try {
			process.env.DEVIN_API_KEY = "cog_test-key";
			// biome-ignore lint/performance/noDelete: Test requires unsetting env var.
			delete process.env.DEVIN_ORG_ID;

			process.exit = ((code?: number) => {
				throw new Error(`process.exit:${code ?? "undefined"}`);
			}) as typeof process.exit;
			console.error = (() => {}) as typeof console.error;

			expect(() => loadConfig()).toThrow("process.exit:1");
		} finally {
			process.exit = originalExit;
			console.error = originalConsoleError;
			if (originalApiKey === undefined) {
				// biome-ignore lint/performance/noDelete: Restore env var to unset state.
				delete process.env.DEVIN_API_KEY;
			} else {
				process.env.DEVIN_API_KEY = originalApiKey;
			}

			if (originalOrgId === undefined) {
				// biome-ignore lint/performance/noDelete: Restore env var to unset state.
				delete process.env.DEVIN_ORG_ID;
			} else {
				process.env.DEVIN_ORG_ID = originalOrgId;
			}
		}
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

	test("footer text constant is defined", () => {
		expect(EMBED_FOOTER_TEXT).toBe("Devin Discord Bot");
	});

	test("getEmbedFooterText returns correct text for given bot name", () => {
		expect(getEmbedFooterText("Devin")).toBe("Devin Discord Bot");
		expect(getEmbedFooterText("MyBot")).toBe("MyBot Discord Bot");
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
