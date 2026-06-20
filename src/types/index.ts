/**
 * Core type definitions for the Devin Discord Bot.
 *
 * Centralizes all shared interfaces and type aliases used across
 * the bot's services, commands, and handlers.
 */

import type { TextChannel, ThreadChannel } from "discord.js";

/**
 * Log levels supported by the bot's logging system.
 * Controls verbosity of console output.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Validated environment configuration required to run the bot.
 * All fields are guaranteed present after startup validation.
 */
export interface BotConfig {
	/** Discord bot authentication token */
	discordBotToken: string;
	/** Discord application client ID for command registration */
	discordClientId: string;
	/** PostgreSQL connection string for persistent session state */
	databaseUrl: string;
	/** Devin API key for session management */
	devinApiKey: string;
	/** Devin organization ID for v3 service-user API keys (cog_*) */
	devinOrgId?: string;
	/** Current log level threshold */
	logLevel: LogLevel;
	/** Customizable bot display name used in embeds and thread names */
	botName: string;
}

/**
 * Status values returned by the Devin API for active sessions.
 * Maps to color-coded Discord embeds for user feedback.
 */
export type DevinSessionStatus =
	| "running"
	| "blocked"
	| "finished"
	| "stopped"
	| "expired"
	| "failed";

/**
 * Response shape from the Devin API when creating a new session.
 */
export interface DevinCreateSessionResponse {
	/** Unique session identifier */
	session_id: string;
	/** Web URL to view the session in Devin's dashboard */
	url: string;
}

/**
 * A single structured message within a Devin session,
 * returned when polling for session updates.
 */
export interface DevinMessage {
	/** Unique message identifier */
	message_id: string;
	/** Role of the message author */
	role: "user" | "devin";
	/** Message text content */
	content: string;
	/** ISO 8601 timestamp of message creation */
	created_at: string;
}

/**
 * Structured pull request information extracted from a Devin session.
 * Present when Devin opens a PR as part of the task.
 */
export interface DevinPullRequest {
	/** Full URL to the pull request on the git host */
	url: string;
	/** PR title text */
	title: string;
	/** Target repository in "owner/repo" format */
	repository: string;
}

/**
 * Full session state returned by the Devin API status endpoint.
 * Used by the polling loop to detect new messages and status changes.
 */
export interface DevinSessionState {
	/** Current session lifecycle status */
	status: DevinSessionStatus;
	/** Ordered list of session messages */
	messages: DevinMessage[];
	/** Pull requests created during the session, if any */
	pull_requests?: DevinPullRequest[];
}

/**
 * Internal tracking record for an active Devin session.
 * Maintained by the SessionManager to correlate Discord threads
 * with Devin API sessions.
 */
export interface TrackedSession {
	/** Devin API session identifier */
	sessionId: string;
	/** Discord thread where updates are posted */
	thread: ThreadChannel;
	/** Web URL to view the session in Devin's dashboard */
	url: string;
	/** Discord user ID of the session creator */
	userId: string;
	/** Most recently observed session status */
	lastStatus: DevinSessionStatus;
	/** Number of messages already posted to the thread */
	lastMessageCount: number;
	/** Last known blocked/failure reason for non-routable state */
	statusReason?: string;
	/** Whether thread-to-Devin message forwarding is muted */
	muted: boolean;
	/** Polling interval timer reference */
	pollTimer: ReturnType<typeof setInterval> | null;
	/** Session creation timestamp in epoch milliseconds */
	createdAt: number;
	/** Original message ID that triggered the session (for @mention reactions) */
	originalMessageId?: string;
	/** Channel ID containing the original trigger message */
	originalChannelId?: string;
	/** Set of PR URLs already posted to prevent duplicate notifications */
	postedPullRequests: Set<string>;
}

/**
 * Discord channel types that support thread creation.
 * Used to narrow channel references before creating session threads.
 */
export type ThreadableChannel = TextChannel;

/**
 * Configuration for a pre-built prompt template.
 * Templates provide guided forms for common Devin tasks.
 */
export interface PromptTemplate {
	/** Unique template identifier used in component custom IDs */
	id: string;
	/** Human-readable template name shown in the select menu */
	name: string;
	/** Short description shown below the template name */
	description: string;
	/** Ordered list of form fields presented in the modal */
	fields: TemplateField[];
	/** Function that builds the Devin prompt from filled field values */
	buildPrompt: (values: Record<string, string>) => string;
}

/**
 * A single input field within a prompt template modal.
 */
export interface TemplateField {
	/** Unique field identifier within the template */
	id: string;
	/** Label text shown above the input */
	label: string;
	/** Placeholder text shown when the field is empty */
	placeholder: string;
	/** Whether the field must be filled before submission */
	required: boolean;
	/** Input style: short for single-line, paragraph for multi-line */
	style: "short" | "paragraph";
}

/**
 * Terminal session statuses that indicate the session is no longer active.
 * Used to stop polling and prevent further message forwarding.
 */
export const TERMINAL_STATUSES = new Set<DevinSessionStatus>([
	"finished",
	"stopped",
	"expired",
	"failed",
]);
