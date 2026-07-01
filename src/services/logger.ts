/**
 * Lightweight structured logger with level filtering.
 *
 * Provides namespaced log output with configurable verbosity.
 * Each module creates its own logger instance with a descriptive
 * namespace prefix for easy filtering in production logs.
 *
 * Uses @wgtechlabs/log-engine for structured logging.
 */

import { LogEngine, LogMode } from "@wgtechlabs/log-engine";
import type { LogLevel } from "../types/index.js";

/**
 * Maps custom LogLevel strings to LogMode enum values.
 */
const LOG_LEVEL_TO_MODE: Record<LogLevel, LogMode> = {
	debug: LogMode.DEBUG,
	info: LogMode.INFO,
	warn: LogMode.WARN,
	error: LogMode.ERROR,
};

/**
 * Sets the global log level threshold and configures the log engine.
 * Messages below this level are silently dropped.
 *
 * @param level - Minimum log level to output
 */
export function setLogLevel(level: LogLevel): void {
	LogEngine.configure({
		mode: LOG_LEVEL_TO_MODE[level],
	});
}

/**
 * Creates a namespaced logger instance.
 *
 * @param namespace - Prefix string for all log messages (e.g., "DevinAPI", "SessionManager")
 * @returns Object with debug/info/warn/error methods
 */
export function createLogger(namespace: string) {
	const prefix = `[${namespace}]`;

	return {
		debug: (...args: unknown[]) => {
			LogEngine.debug(prefix, { args });
		},
		info: (...args: unknown[]) => {
			LogEngine.info(prefix, { args });
		},
		warn: (...args: unknown[]) => {
			LogEngine.warn(prefix, { args });
		},
		error: (...args: unknown[]) => {
			LogEngine.error(prefix, { args });
		},
	};
}
