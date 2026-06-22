/**
 * Minimal PostgreSQL-backed session state store for restart recovery.
 */

import { Pool } from "pg";
import type { DevinSessionStatus } from "../types/index.js";
import { createLogger } from "./logger.js";

const log = createLogger("SessionStateStore");

export interface PersistedSessionState {
	sessionId: string;
	threadId: string;
	url: string;
	userId: string;
	lastStatus: DevinSessionStatus;
	lastMessageCount: number;
	muted: boolean;
	createdAt: number;
	statusReason?: string;
	originalMessageId?: string;
	originalChannelId?: string;
}

type QueryClient = {
	query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const VALID_SESSION_STATUSES = new Set<DevinSessionStatus>([
	"running",
	"blocked",
	"finished",
	"stopped",
	"expired",
	"failed",
]);

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tracked_sessions (
	session_id TEXT PRIMARY KEY,
	thread_id TEXT NOT NULL,
	url TEXT NOT NULL,
	user_id TEXT NOT NULL,
	last_status TEXT NOT NULL,
	last_message_count INTEGER NOT NULL,
	muted BOOLEAN NOT NULL,
	created_at BIGINT NOT NULL,
	status_reason TEXT,
	original_message_id TEXT,
	original_channel_id TEXT
)
`;

const CREATE_THREAD_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS tracked_sessions_thread_id_unique ON tracked_sessions (thread_id)
`;

const SELECT_SQL = `
SELECT
	session_id,
	thread_id,
	url,
	user_id,
	last_status,
	last_message_count,
	muted,
	created_at,
	status_reason,
	original_message_id,
	original_channel_id
FROM tracked_sessions
`;

const UPSERT_SQL = `
INSERT INTO tracked_sessions (
	session_id,
	thread_id,
	url,
	user_id,
	last_status,
	last_message_count,
	muted,
	created_at,
	status_reason,
	original_message_id,
	original_channel_id
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (session_id) DO UPDATE SET
	thread_id = EXCLUDED.thread_id,
	url = EXCLUDED.url,
	user_id = EXCLUDED.user_id,
	last_status = EXCLUDED.last_status,
	last_message_count = EXCLUDED.last_message_count,
	muted = EXCLUDED.muted,
	created_at = EXCLUDED.created_at,
	status_reason = EXCLUDED.status_reason,
	original_message_id = EXCLUDED.original_message_id,
	original_channel_id = EXCLUDED.original_channel_id
`;

export class SessionStateStore {
	private readonly client: QueryClient;
	private initialized = false;

	constructor(databaseUrl: string, client?: QueryClient) {
		this.client = client ?? new Pool({ connectionString: databaseUrl });
	}

	private async init(): Promise<void> {
		if (this.initialized) return;
		await this.client.query(CREATE_TABLE_SQL);
		await this.client.query(CREATE_THREAD_UNIQUE_INDEX_SQL);
		this.initialized = true;
	}

	async load(): Promise<PersistedSessionState[]> {
		await this.init();
		const result = await this.client.query(SELECT_SQL);
		const sessions: PersistedSessionState[] = [];
		for (const row of result.rows) {
			const parsed = this.parseRow(row);
			if (parsed) sessions.push(parsed);
		}
		return sessions;
	}

	async save(sessions: PersistedSessionState[]): Promise<void> {
		await this.init();

		const currentIds = sessions.map((s) => s.sessionId);
		if (currentIds.length > 0) {
			await this.client.query("DELETE FROM tracked_sessions WHERE session_id <> ALL($1::text[])", [
				currentIds,
			]);
		} else {
			await this.client.query("DELETE FROM tracked_sessions");
		}

		for (const session of sessions) {
			await this.client.query(UPSERT_SQL, [
				session.sessionId,
				session.threadId,
				session.url,
				session.userId,
				session.lastStatus,
				session.lastMessageCount,
				session.muted,
				session.createdAt,
				session.statusReason ?? null,
				session.originalMessageId ?? null,
				session.originalChannelId ?? null,
			]);
		}
	}

	async markStatus(
		sessionId: string,
		lastStatus: DevinSessionStatus,
		statusReason: string,
	): Promise<void> {
		await this.init();
		await this.client.query(
			"UPDATE tracked_sessions SET last_status = $2, status_reason = $3 WHERE session_id = $1",
			[sessionId, lastStatus, statusReason],
		);
	}

	private parseRow(row: Record<string, unknown>): PersistedSessionState | null {
		const idForLog =
			typeof row.session_id === "string"
				? row.session_id
				: typeof row.thread_id === "string"
					? row.thread_id
					: "unknown-row";

		if (
			typeof row.session_id !== "string" ||
			typeof row.thread_id !== "string" ||
			typeof row.url !== "string" ||
			typeof row.user_id !== "string"
		) {
			log.warn(`Skipping invalid state row ${idForLog}: missing required string fields`);
			return null;
		}

		if (
			typeof row.last_status !== "string" ||
			!VALID_SESSION_STATUSES.has(row.last_status as DevinSessionStatus)
		) {
			log.warn(`Skipping invalid state row ${idForLog}: invalid last_status`);
			return null;
		}

		const lastMessageCount = Number(row.last_message_count);
		const createdAt = Number(row.created_at);
		if (!Number.isFinite(lastMessageCount) || !Number.isFinite(createdAt)) {
			log.warn(`Skipping invalid state row ${idForLog}: invalid numeric fields`);
			return null;
		}

		if (typeof row.muted !== "boolean") {
			log.warn(`Skipping invalid state row ${idForLog}: invalid muted flag`);
			return null;
		}

		const statusReason = this.readOptionalString(row.status_reason, idForLog, "status_reason");
		if (row.status_reason !== null && statusReason === undefined) return null;

		const originalMessageId = this.readOptionalString(
			row.original_message_id,
			idForLog,
			"original_message_id",
		);
		if (row.original_message_id !== null && originalMessageId === undefined) return null;

		const originalChannelId = this.readOptionalString(
			row.original_channel_id,
			idForLog,
			"original_channel_id",
		);
		if (row.original_channel_id !== null && originalChannelId === undefined) return null;

		return {
			sessionId: row.session_id,
			threadId: row.thread_id,
			url: row.url,
			userId: row.user_id,
			lastStatus: row.last_status as DevinSessionStatus,
			lastMessageCount,
			muted: row.muted,
			createdAt,
			statusReason,
			originalMessageId,
			originalChannelId,
		};
	}

	private readOptionalString(
		value: unknown,
		idForLog: string,
		fieldName: string,
	): string | undefined {
		if (value === null || value === undefined) return undefined;
		if (typeof value === "string") return value;
		log.warn(`Skipping invalid state row ${idForLog}: invalid ${fieldName}`);
		return undefined;
	}
}
