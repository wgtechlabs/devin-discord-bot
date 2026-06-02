/**
 * Lightweight structured logger with level filtering.
 *
 * Provides namespaced log output with configurable verbosity.
 * Each module creates its own logger instance with a descriptive
 * namespace prefix for easy filtering in production logs.
 */

import type { LogLevel } from "../types/index.js";

/** Numeric priority for each log level (lower = more verbose) */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/** Module-level log threshold, set once at startup */
let currentLevel: LogLevel = "info";

/**
 * Sets the global log level threshold.
 * Messages below this level are silently dropped.
 *
 * @param level - Minimum log level to output
 */
export function setLogLevel(level: LogLevel): void {
	currentLevel = level;
}

/**
 * Creates a namespaced logger instance.
 *
 * @param namespace - Prefix string for all log messages (e.g., "DevinAPI", "SessionManager")
 * @returns Object with debug/info/warn/error methods
 */
export function createLogger(namespace: string) {
	const prefix = `[${namespace}]`;

	function shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
	}

	return {
		debug: (...args: unknown[]) => {
			if (shouldLog("debug")) console.debug(prefix, ...args);
		},
		info: (...args: unknown[]) => {
			if (shouldLog("info")) console.info(prefix, ...args);
		},
		warn: (...args: unknown[]) => {
			if (shouldLog("warn")) console.warn(prefix, ...args);
		},
		error: (...args: unknown[]) => {
			if (shouldLog("error")) console.error(prefix, ...args);
		},
	};
}
