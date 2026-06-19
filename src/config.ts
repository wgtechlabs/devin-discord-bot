/**
 * Application configuration loader and validator.
 *
 * Reads required environment variables and provides typed access
 * to the validated configuration. Exits the process with a clear
 * error message if any required variable is missing.
 */

import type { BotConfig, LogLevel } from "./types/index.js";

/** Discord embed colors mapped to session status categories */
export const EMBED_COLORS = {
	working: 0xf5a623,
	blocked: 0xe67e22,
	finished: 0x2ecc71,
	error: 0xe74c3c,
	info: 0x5865f2,
} as const;

/** Footer text appended to all bot embeds */
export const EMBED_FOOTER_TEXT = "Devin Discord Bot";

/**
 * Returns the footer text for bot embeds using the configured bot name.
 *
 * @param botName - The configured bot display name
 * @returns Footer string with bot name
 */
export function getEmbedFooterText(botName: string): string {
	return `${botName} Discord Bot`;
}

/** Auto-archive duration for session threads (24 hours in minutes) */
export const THREAD_AUTO_ARCHIVE_DURATION = 1440 as const;

/** Maximum character length for Discord thread names */
export const THREAD_NAME_MAX_LENGTH = 100;

/** Maximum allowed length for the BOT_NAME environment variable */
export const BOT_NAME_MAX_LENGTH = 32;

/** Initial polling interval for session updates (milliseconds) */
export const POLL_INTERVAL_INITIAL = 5_000;

/** Polling interval after the initial active period (milliseconds) */
export const POLL_INTERVAL_NORMAL = 15_000;

/** Duration of the initial fast-polling period (milliseconds) */
export const POLL_FAST_PERIOD = 120_000;

/** Base URL for the Devin API */
export const DEVIN_API_BASE_URL = "https://api.devin.ai/v1";

/** Valid log level values for runtime validation */
const VALID_LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

/**
 * Loads and validates all required environment variables.
 *
 * @returns Validated bot configuration object
 * @throws Exits process with code 1 if required variables are missing
 */
export function loadConfig(): BotConfig {
	const missing: string[] = [];

	const discordBotToken = process.env.DISCORD_BOT_TOKEN;
	const discordClientId = process.env.DISCORD_CLIENT_ID;
	const databaseUrl = process.env.DATABASE_URL;
	const devinApiKey = process.env.DEVIN_API_KEY;
	const devinOrgId = process.env.DEVIN_ORG_ID?.trim();
	const rawLogLevel = process.env.LOG_LEVEL ?? "info";
	const rawBotName = process.env.BOT_NAME ?? "Devin";

	if (!discordBotToken) missing.push("DISCORD_BOT_TOKEN");
	if (!discordClientId) missing.push("DISCORD_CLIENT_ID");
	if (!databaseUrl) missing.push("DATABASE_URL");
	if (!devinApiKey) missing.push("DEVIN_API_KEY");
	if (devinApiKey?.startsWith("cog_") && !devinOrgId) missing.push("DEVIN_ORG_ID");

	if (missing.length > 0) {
		console.error(`Missing required environment variables: ${missing.join(", ")}`);
		process.exit(1);
	}

	const logLevel: LogLevel = VALID_LOG_LEVELS.has(rawLogLevel) ? (rawLogLevel as LogLevel) : "info";
	const botName = rawBotName.trim().slice(0, BOT_NAME_MAX_LENGTH) || "Devin";

	return {
		discordBotToken: discordBotToken as string,
		discordClientId: discordClientId as string,
		databaseUrl: databaseUrl as string,
		devinApiKey: devinApiKey as string,
		devinOrgId: devinOrgId || undefined,
		logLevel,
		botName,
	};
}
