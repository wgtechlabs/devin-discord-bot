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
 * Splits variadic logger args into a formatted message string and an
 * optional structured data payload.  String arguments are joined into
 * the message (prefixed with the namespace); a trailing non-string
 * argument (e.g. an Error or plain object) is forwarded as the `data`
 * parameter so LogEngine can apply automatic redaction.
 */
function formatArgs(prefix: string, args: unknown[]): [message: string, data: unknown | undefined] {
	const last = args[args.length - 1];
	const hasData = args.length > 1 && typeof last !== "string";
	const msgArgs = hasData ? args.slice(0, -1) : args;
	return [[prefix, ...msgArgs].map(String).join(" "), hasData ? last : undefined];
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
			const [message, data] = formatArgs(prefix, args);
			LogEngine.debug(message, data);
		},
		info: (...args: unknown[]) => {
			const [message, data] = formatArgs(prefix, args);
			LogEngine.info(message, data);
		},
		warn: (...args: unknown[]) => {
			const [message, data] = formatArgs(prefix, args);
			LogEngine.warn(message, data);
		},
		error: (...args: unknown[]) => {
			const [message, data] = formatArgs(prefix, args);
			LogEngine.error(message, data);
		},
	};
}
